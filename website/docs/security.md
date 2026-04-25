---
sidebar_position: 7
title: Security
description: Security features, best practices, and vulnerability reporting
---

## Security Overview

HubHelper is designed with security as a top priority. This page outlines our security features, implemented protections, and best practices for using the tool safely.

## Implemented Security Features

### 1. XSS Protection (Cross-Site Scripting)

HTML reports are protected against XSS attacks through multiple layers:

#### HTML Escaping

All user-controlled data is escaped before insertion into HTML:

```typescript
// Example: Repository names, PR titles, usernames
const safeRepository = escapeHtml(issue.repository);
const safeDescription = escapeHtml(issue.description);
// Then use in HTML template
```

**Protected Data**:
- Repository names
- Pull request titles
- User names
- Commit messages
- Workflow names
- AI-generated insights
- Recommendations

#### URL Sanitization

URLs are validated to prevent malicious URIs:

```typescript
// Blocks javascript: and data: URIs
if (url.startsWith('javascript:') || url.startsWith('data:')) {
  return ''; // Blocked
}

// Only allows http:// and https://
if (!url.startsWith('http://') && !url.startsWith('https://')) {
  return ''; // Blocked
}
```

**Blocked URLs**:
- `javascript:alert(1)`
- `data:text/html,<script>alert(1)</script>`
- `file:///etc/passwd`
- `vbscript:alert(1)`

#### Content Security Policy

HTML reports include CSP headers that prevent code execution:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               style-src 'unsafe-inline';
               script-src 'none';
               img-src 'self' data: https:;
               object-src 'none';
               base-uri 'self';">
```

**Protections**:
- No inline scripts allowed
- No eval() or similar code execution
- Restricted resource loading
- Prevents XSS even if escaping is bypassed

### 2. Path Traversal Protection

File operations are secured against directory traversal attacks:

#### Path Validation

```typescript
// Blocks parent directory traversal
validateFilePath('../../../etc/passwd'); // ❌ Throws error

// Blocks absolute paths
validateFilePath('/etc/passwd'); // ❌ Throws error

// Allows safe relative paths
validateFilePath('reports/output.json'); // ✅ Allowed
```

**Security Checks**:
- Normalizes paths to detect encoded traversal (`%2e%2e%2f`)
- Blocks parent directory access (`../`)
- Blocks absolute paths (`/`, `C:\`)
- Validates file extensions
- Detects null byte injection

#### Allowed File Extensions

Only safe file types are permitted:

- `.json` - JSON data files
- `.html` - HTML reports
- `.txt` - Text files
- `.md` - Markdown files

**Blocked Extensions**:
- `.exe`, `.sh`, `.bat` - Executables
- `.php`, `.asp`, `.jsp` - Server scripts
- No extension files

### 3. Input Validation

All user inputs are validated before processing:

#### Organization Name Validation

```typescript
// GitHub organization naming rules
// 1-39 characters, alphanumeric + hyphens
// Cannot start or end with hyphen

validateOrganizationName('my-company'); // ✅ Valid
validateOrganizationName('org_name'); // ❌ Invalid (underscore)
validateOrganizationName('-myorg'); // ❌ Invalid (starts with hyphen)
validateOrganizationName('../etc'); // ❌ Invalid (path traversal)
validateOrganizationName("'; DROP TABLE--"); // ❌ Invalid (SQL injection)
```

#### Days Parameter Validation

```typescript
// Must be integer between 1-365

validateDays(30); // ✅ Valid
validateDays('30'); // ✅ Valid (parsed)
validateDays(0); // ❌ Invalid (too small)
validateDays(999); // ❌ Invalid (too large)
validateDays('30.5'); // ❌ Invalid (not integer)
validateDays('30abc'); // ❌ Invalid (not numeric)
validateDays('30; DROP TABLE--'); // ❌ Invalid (injection attempt)
```

**Purpose**: Prevents API abuse by limiting the time range.

#### GitHub Token Validation

```typescript
// Basic format validation

validateGitHubToken(token); // Checks:
// - Minimum length (40 characters)
// - No whitespace
// - Not empty
```

**Note**: Full token validation happens during GitHub API authentication.

### 4. Security Testing

Comprehensive test coverage ensures security features work correctly:

```bash
# 128 total tests including:
# - 73 XSS protection tests
# - 26 path validation tests
# - 29 input validation tests
npm test
```

**Test Categories**:
- HTML escaping (script tags, event handlers, iframes, SVG)
- URL sanitization (javascript:, data:, file: URIs)
- Path traversal (../, absolute paths, null bytes)
- Input validation (SQL injection, XSS, path traversal attempts)
- Edge cases (empty strings, null values, special characters)

## Best Practices

### 1. Protect Your GitHub Token

**Do**:
- ✅ Store tokens in environment variables
- ✅ Use `.env` files (add to `.gitignore`)
- ✅ Rotate tokens regularly
- ✅ Use tokens with minimum required scopes
- ✅ Delete tokens when no longer needed

**Don't**:
- ❌ Commit tokens to version control
- ❌ Share tokens in plain text (Slack, email)
- ❌ Use tokens with excessive permissions
- ❌ Hardcode tokens in scripts

```bash
# ✅ Good: Use environment variables
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
npx @sdh100shaun/hubhelper analyze --org myorg

# ❌ Bad: Token in command (visible in shell history)
npx @sdh100shaun/hubhelper analyze --token ghp_xxx --org myorg
```

### 2. Secure Output Files

**Recommendations**:
- Store reports in secure directories with appropriate permissions
- Don't commit HTML/JSON reports containing sensitive data
- Review reports before sharing publicly
- Use encryption for sensitive reports

```bash
# ✅ Good: Save to secure directory
npx @sdh100shaun/hubhelper analyze \
  --org myorg \
  --html secure/reports/output.html

# Add to .gitignore
echo "secure/" >> .gitignore
```

### 3. Limit Analysis Scope

**Principle of Least Privilege**:
- Use the shortest time range needed
- Analyze specific repos when possible (when `check-repo` is available)
- Don't request more permissions than necessary

```bash
# ✅ Good: Analyze last 7 days for weekly check
npx @sdh100shaun/hubhelper analyze --org myorg --days 7

# ⚠️ Caution: 365-day analysis uses more API quota
npx @sdh100shaun/hubhelper analyze --org myorg --days 365
```

### 4. CI/CD Integration Security

When using in automated pipelines:

```yaml
# ✅ Good: Use secrets, don't expose token
- name: Run Security Analysis
  env:
    GITHUB_TOKEN: ${% raw %}{{ {% endraw %}secrets.ANALYSIS_TOKEN {% raw %}}}{% endraw %}
  run: |
    npx @sdh100shaun/hubhelper analyze \
      --org ${% raw %}{{ {% endraw %}github.repository_owner {% raw %}}}{% endraw %} \
      --json security-report.json \
      --no-ai

# ❌ Bad: Don't use GITHUB_TOKEN directly (too broad permissions)
- name: Bad Example
  run: |
    npx @sdh100shaun/hubhelper analyze \
      --token ${% raw %}{{ {% endraw %}secrets.GITHUB_TOKEN {% raw %}}}{% endraw %}  # Don't do this!
```

**Best Practices**:
- Create a dedicated token with minimal scopes
- Store as repository secret
- Limit to specific branches (e.g., only run on `main`)
- Review output before publishing as artifacts

### 5. Review HTML Reports Before Sharing

HTML reports may contain sensitive information:

- Internal repository names
- User names
- PR titles and descriptions
- Security issue details

**Before sharing externally**:
- Review for confidential information
- Redact sensitive repository names if needed
- Consider generating separate reports for external stakeholders

## Vulnerability Reporting

### Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

**Do NOT**:
- ❌ Open a public GitHub issue
- ❌ Discuss publicly on social media
- ❌ Exploit the vulnerability

**Do**:
- ✅ Use [GitHub Security Advisories](https://github.com/sdh100shaun/gh-tools/security/advisories)
- ✅ Email security details privately
- ✅ Allow reasonable time for a fix before disclosure

### What to Include

When reporting a vulnerability, please provide:

1. **Description**: What is the vulnerability?
2. **Impact**: What can an attacker do?
3. **Steps to Reproduce**: How to trigger the issue?
4. **Affected Versions**: Which versions are vulnerable?
5. **Suggested Fix**: If you have ideas for fixing it

### Response Timeline

We aim to:
- Acknowledge reports within 48 hours
- Provide an initial assessment within 1 week
- Release a fix within 30 days for critical issues
- Credit reporters (if desired) in security advisories

## Security Audit History

### v1.0.0 (2026-01-24)

**Security Review Completed**: Comprehensive audit identified and fixed:

1. **CRITICAL: XSS Vulnerability in HTML Reporter**
   - **Status**: ✅ Fixed
   - **Fix**: Added HTML escaping and CSP headers
   - **Tests**: 73 XSS protection tests added

2. **HIGH: Path Traversal Vulnerability**
   - **Status**: ✅ Fixed
   - **Fix**: Implemented path validation utilities
   - **Tests**: 26 path validation tests added

3. **HIGH: Insufficient Input Validation**
   - **Status**: ✅ Fixed
   - **Fix**: Added strict input validation for all CLI parameters
   - **Tests**: 29 input validation tests added

**Total Test Coverage**: 128 tests, all passing

See [SECURITY_REVIEW.md](https://github.com/sdh100shaun/gh-tools/blob/main/SECURITY_REVIEW.md) for full details.

## Security-Related Configuration

## Token Security

### Minimum Privilege Principle

This tool follows the principle of least privilege. Use **fine-grained tokens** with only the minimum required permissions:

**Repository permissions (Read-only):**
- ✅ **Actions**: Read - Workflow status checks
- ✅ **Pull requests**: Read - PR analysis
- ✅ **Metadata**: Read - Repository listing (automatic)
- ⚠️ **Administration**: Read - Security settings (optional)

**Organization permissions:**
- ❌ **None required** for most use cases

### Why Fine-Grained Tokens?

| Feature | Fine-Grained Token | Classic Token |
|---------|-------------------|---------------|
| **Security** | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Granular permissions** | ✅ Yes | ❌ No |
| **Repository scoping** | ✅ Yes | ❌ No |
| **Forced expiration** | ✅ Yes | ❌ No |
| **Read-only option** | ✅ Yes | ⚠️ Limited |
| **Audit trail** | ✅ Detailed | ⚠️ Basic |
| **Org scoping** | ✅ Yes | ❌ No |
| **Revocation impact** | 🎯 Minimal | 💥 Broad |

**Classic tokens require broad scopes:**
- `repo` - Full control of repositories (write access not needed)
- `read:org` - Read organization membership
- `admin:org` - Full org control (extremely broad, dangerous)

**Fine-grained tokens need only:**
- Read-only repository permissions
- No write access
- No organization-level permissions
- Scoped to specific organization

**Security improvement:** Fine-grained tokens are ~99% less permissive than classic tokens for this use case.

### Token Security Checklist

Use this checklist to ensure your tokens are secure:

- [ ] Using fine-grained tokens (not classic)
- [ ] Read-only permissions (no write access)
- [ ] Organization-scoped (not account-wide)
- [ ] Expiration set (90 days or less)
- [ ] Stored in secure credential manager
- [ ] Not committed to git (added to .gitignore)
- [ ] Rotated regularly (every 90 days)
- [ ] Revoked immediately if compromised
- [ ] Separate tokens for dev/staging/production

### Token Storage Security

**✅ Secure Storage Methods:**
- Environment variables (for local development)
- `.env` file (in .gitignore)
- GitHub Secrets (for CI/CD)
- Password managers (1Password, LastPass, Bitwarden)
- Secrets managers (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)

**❌ Insecure Storage Methods:**
- Hard-coded in source code
- Committed to version control
- Stored in plain text files
- Shared via email/Slack/chat
- Logged to console/files
- Exposed in shell history

### Audit and Monitoring

**Monitor token usage:**

```bash
# Check token validity and permissions (scopes are shown in response headers)
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user

# Alternatively, verify the token is accepted and see rate limits
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/rate_limit
# View audit log
# Go to: https://github.com/settings/security-log
# Filter by token usage
```

**Set up alerts:**
- GitHub automatically sends email when tokens are exposed in commits
- Enable notifications: Settings → Notifications → Security alerts
- Review audit logs regularly for unexpected usage

### Token Compromise Response

If a token is compromised, follow these steps immediately:

**1. Immediate Actions:**
```bash
# Revoke the token immediately
# Go to: https://github.com/settings/tokens
# Click "Delete" next to the compromised token
```

**2. Investigate:**
```bash
# Check audit logs for unauthorized access
# Settings → Security log
# Look for API calls made with the token
# Note: timestamps, IP addresses, actions performed
```

**3. Rotate:**
```bash
# Create new fine-grained token with same permissions
# Update all services using the old token:
# - Local .env files
# - GitHub Actions secrets
# - CI/CD configurations
# - Production servers
```

**4. Review:**
```bash
# Check for unauthorized changes:
# - Review recent commits in all repositories
# - Check pull requests created/merged
# - Review GitHub Actions workflow runs
# - Verify organization settings unchanged
```

**5. Document:**
- Record incident details
- Note when compromise was detected
- List actions taken
- Update security procedures if needed

### Permissions Required

The tool works with both token types:

#### Fine-Grained Personal Access Token (Recommended)

**Repository permissions:**

| Permission | Purpose | Required? |
|------------|---------|-----------|
| **Actions**: Read | Check if GitHub Actions is enabled<br />List workflow status (active/disabled/paused) | ✅ Yes |
| **Pull requests**: Read | Analyze merged PRs<br />Detect self-merges<br />Identify security-related PRs | ✅ Yes |
| **Metadata**: Read | List organization repositories<br />Get repository details | ✅ Yes (automatic) |
| **Administration**: Read | Check secret scanning status<br />Check Dependabot status | ⚠️ Optional |

**Organization permissions:**
- ❌ None required

**Security benefits:**
- ✅ Read-only access (cannot modify anything)
- ✅ Organization-scoped (limited blast radius)
- ✅ Repository-specific access possible
- ✅ Automatic expiration
- ✅ Detailed audit logs

#### Classic Personal Access Token (Legacy)

**Scopes:**

| Scope | Purpose | Risk Level |
|-------|---------|------------|
| `repo` | Access repository data | ⚠️ High - Full repo access (write not needed) |
| `read:org` | Read organization info | ✅ Low - Read-only |

**Security concerns:**
- ⚠️ Grants write access (not needed)
- ⚠️ No expiration enforcement
- ⚠️ Cannot limit to specific repositories
- ⚠️ Broad scope across all organizations

**Note:** The `admin:org` scope mentioned in older documentation is NOT required. The tool only needs read access.

**Mitigation:** Use fine-grained tokens instead. If using classic tokens, create a dedicated token, rotate every 90 days, and limit to specific organizations.

### Data Handling

**What Data is Collected**:
- Repository metadata (names, settings)
- Pull request information (titles, authors, merge status)
- Workflow status (enabled/disabled/paused)
- User names (authors, reviewers, mergers)

**What is NOT Collected**:
- Code content
- File contents
- Commit contents
- Personal emails
- IP addresses
- Usage analytics

**Data Storage**:
- All data is processed locally
- No data is sent to external servers (except GitHub API)
- Output files are stored where you specify
- No persistent storage by the tool

### Network Connections

The tool only connects to:
- `api.github.com` - GitHub REST API
- No telemetry or analytics servers
- No third-party services (except GitHub Copilot SDK when used)

## Compliance

### License

MIT License - See [LICENSE](https://github.com/sdh100shaun/gh-tools/blob/main/LICENSE)

### Dependencies

All dependencies are regularly audited for vulnerabilities:

```bash
npm audit
```

Security updates are applied promptly.

## Security Roadmap

Planned security enhancements:

- [ ] Add SAST (Static Application Security Testing)
- [ ] Implement dependency scanning automation
- [ ] Add signature verification for releases
- [ ] Provide SBOM (Software Bill of Materials)
- [ ] Add automated security regression tests

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## Questions?

For security-related questions:
- Use [GitHub Security Advisories](https://github.com/sdh100shaun/gh-tools/security/advisories) for vulnerabilities
- Use [GitHub Discussions](https://github.com/sdh100shaun/gh-tools/discussions) for general security questions
- Check the [FAQ](/docs/getting-started#troubleshooting) for common issues
