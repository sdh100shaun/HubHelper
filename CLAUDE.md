# Project Guidelines for Claude Code

## Pre-Commit Checklist

**CRITICAL**: Before committing and pushing ANY changes, Claude MUST run ALL of the following checks and ensure they pass:

### 1. Linting
```bash
npm run lint
```
- **MUST** pass with zero errors and zero warnings
- If errors exist, run `npm run lint:fix` or manually fix them
- **NEVER** commit code with linting errors

### 2. Build
```bash
npm run build
```
- **MUST** compile successfully with zero TypeScript errors
- Deprecation warnings are acceptable
- **NEVER** commit code that doesn't compile

### 3. Tests
```bash
npm test
```
- All tests **MUST** pass
- If tests fail, fix the issues before committing
- **NEVER** commit code with failing tests

### 4. SBOM Generation (if applicable)
```bash
npm run sbom:generate
```
- Run if changes affect dependencies
- Ensure SBOM generates without errors

## Complete Pre-Commit Command

Run this before EVERY commit:

```bash
npm run lint && npm run build && npm test
```

If ANY of these fail, **DO NOT COMMIT**.

## Commit Message Format

This project uses **Conventional Commits**. Every commit message MUST follow this format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Allowed Types
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style/formatting
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Test changes
- `build` - Build system changes
- `ci` - CI configuration changes
- `chore` - Maintenance tasks
- `security` - Security improvements
- `revert` - Revert previous commit

### Examples
```bash
feat(lists): add repository list management
fix(lint): resolve biome configuration issues
docs(readme): update installation instructions
```

## Code Quality Standards

### TypeScript
- Use strict type checking
- Avoid `any` types (warnings acceptable in tests)
- Prefer interfaces over types for objects
- Use `unknown` instead of `any` when type is truly unknown

### Code Style
- 2-space indentation
- Single quotes for strings
- Semicolons required
- 100-character line width
- Trailing commas (ES5 style)

### Documentation Language
- All user-facing documentation must use **UK English** spellings
- Use "organisation" (not "organization"), "customise" (not "customize"), "colour" (not "color"), "behaviour" (not "behavior"), "analyse" (not "analyze") in prose
- Technical terms, CLI command names (`analyze`), JSON field names, and code remain unchanged

### Error Handling
- Always handle errors gracefully
- Provide meaningful error messages
- Log errors without exposing sensitive data
- Use try-catch for async operations

### Testing
- Maintain >75% code coverage per file
- Test both success and failure cases
- Mock external dependencies
- Use descriptive test names

## File Organization

```
src/
├── types/           # TypeScript interfaces
├── services/        # Business logic
├── analyzers/       # Analysis engines
├── reporters/       # Output formatters
└── __tests__/       # Test files

docs/                # Documentation
.claude/            # Claude-specific files
```

## Git Workflow

### Branch Naming
- Feature branches: `claude/<feature-name>-H5bVu`
- All branches must end with `-H5bVu` for tracking

### Pushing Changes
- Always use: `git push -u origin <branch-name>`
- If push fails due to network, retry up to 4 times with exponential backoff
- Branch must start with `claude/` and end with `-H5bVu`

### Before Creating PR
1. ✅ All checks pass (lint, build, test)
2. ✅ Commit messages follow conventional format
3. ✅ Documentation updated (if applicable)
4. ✅ CHANGELOG updated (for user-facing changes)
5. ✅ No sensitive data in commits

## Security Practices

### Secrets Management
- **NEVER** commit tokens, passwords, or API keys
- Use environment variables (`process.env`)
- Store sensitive config in `.env` (gitignored)
- Use `.env.example` for templates

### Dependencies
- Run `npm audit` regularly
- Update vulnerable dependencies promptly
- Generate SBOM for supply chain transparency

### Error Messages
- Sanitize errors before logging
- Don't expose internal paths or secrets
- Provide helpful but safe error messages

## Documentation Requirements

### Code Comments
- Add comments for non-obvious logic
- Document public APIs with JSDoc
- Explain WHY, not WHAT
- Keep comments up-to-date

### User Documentation
- Update README.md for new features
- Create detailed guides in docs/
- Include examples and use cases
- Add troubleshooting sections

## CI/CD Integration

### GitHub Actions Workflows
- All PRs trigger CI validation
- Commits must pass: lint, build, test, security audit
- Conventional commits validated automatically
- SBOM generated on releases

### Local Validation
Before pushing, run:
```bash
# Full validation suite
npm run lint && npm run build && npm test && npm run sbom:generate

# Quick check
npm run lint && npm run build
```

## Common Issues & Solutions

### Linting Failures
**Problem**: Biome config version mismatch  
**Solution**: Update biome.json schema version to match CLI

**Problem**: Import order errors  
**Solution**: Run `npm run lint:fix`

### Build Failures
**Problem**: TypeScript errors  
**Solution**: Fix type errors, avoid `any` types

### Test Failures
**Problem**: Tests not running  
**Solution**: Ensure jest is installed: `npm install`

## Performance Guidelines

- Use pagination for API calls
- Implement caching where appropriate
- Avoid blocking operations
- Use async/await for I/O
- Batch API requests when possible

## Accessibility

- Use descriptive variable names
- Keep functions small and focused
- Avoid deep nesting (max 3 levels)
- Write self-documenting code
- Add comments for complex algorithms

## Review Checklist

Before considering work complete, verify:

- [ ] All checks pass (lint, build, test)
- [ ] Conventional commit format used
- [ ] No TODO or FIXME comments without issues
- [ ] Documentation updated
- [ ] No console.log in production code
- [ ] Error handling in place
- [ ] Tests written and passing
- [ ] No hardcoded values (use config)
- [ ] Type-safe (no `any` unless justified)
- [ ] Security considered
- [ ] Performance acceptable
- [ ] Code reviewed (self-review minimum)

## Getting Help

- Check existing issues
- Review documentation in docs/
- Read CONTRIBUTING.md
- Check SECURITY.md for security concerns
- Review implementation plans in .claude/

---

**Remember**: Quality over speed. Taking time to run checks prevents pipeline failures and maintains codebase health.

**Always run the full check suite before committing:**
```bash
npm run lint && npm run build && npm test
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HubHelper (`@sdh100shaun/hubhelper`) is an AI-powered **policy-driven** security analysis tool for GitHub organizations. It uses declarative YAML policies to define security controls, evaluate compliance, and generate standardized reports (console, JSON, HTML, SARIF, compliance frameworks).

### Policy-Driven Architecture

HubHelper uses a declarative policy engine instead of hardcoded detection logic:

- **Control Catalog** (`policies/catalog.yaml`) — Defines 9 security controls with evaluator configurations, framework mappings (NIST 800-53, CIS Controls), and default severities
- **Policy Profiles** (`policies/*.yaml`) — Customizable profiles (default, strict) that reference catalog controls and apply tailoring
- **Evaluators** (`src/evaluators/`) — Pluggable control evaluators registered via decorators
- **Policy Engine** (`src/policy/`) — Loads policies, resolves controls, executes evaluators, aggregates results

**Key Benefit:** Security teams can customize controls, severities, and thresholds by editing YAML files without code changes.

## Commands

```bash
# Build
npm run build            # TypeScript compilation (tsc) → dist/

# Dev
npm run dev              # Run with tsx (e.g. npm run dev analyze --org myorg --days 30)

# Test
npm test                 # Jest (ESM via ts-jest)
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (text + lcov + html)

# Lint & Format (Biome)
npm run lint             # biome check .
npm run lint:fix         # biome check --apply .
npm run format           # biome format --write .

# Documentation site (Eleventy)
npm run docs:build       # Build to _site/
npm run docs:serve       # Dev server with hot reload
```

## Architecture

**CLI entry point:** `src/index.ts` — Commander.js with `analyze`, `check-repo`, `query`, and `watch` commands.

**Policy-driven data flow:**
```
GitHubFetcher → PolicyEngine.evaluate() → Evaluators (9 controls) → PolicyEngineResult → Reporters
                                                                                          ├─ Console
                                                                                          ├─ JSON
                                                                                          ├─ HTML
                                                                                          ├─ SARIF (GitHub Code Scanning)
                                                                                          └─ Compliance (frameworks)
```

### Core Components

- **policies/** — YAML-based security policies
  - `catalog.yaml` — Control definitions with framework mappings
  - `default.yaml` — Balanced security profile (default)
  - `strict.yaml` — Stricter thresholds and elevated severities

- **policy/** — Policy engine infrastructure
  - `engine.ts` — Orchestrates policy evaluation
  - `loader.ts` — Parses and validates YAML policies
  - `resolver.ts` — Resolves controls with tailoring
  - `evaluator-registry.ts` — Decorator-based evaluator registration
  - `types.ts` — Zod schemas and TypeScript types

- **evaluators/** — Control evaluators (registered via `@registerEvaluator`)
  - `base-evaluator.ts` — Shared parameter validation and utilities
  - `self-merge-evaluator.ts` — HH-GH-001: Detects self-merged PRs
  - `security-pr-classifier.ts` — HH-GH-003: Identifies security PRs
  - `disabled-actions-evaluator.ts` — HH-GH-004: Flags disabled Actions
  - `paused-workflow-evaluator.ts` — HH-GH-005: Detects paused workflows
  - `disabled-workflow-evaluator.ts` — HH-GH-006: Detects disabled workflows
  - `action-failure-evaluator.ts` — HH-GH-008: Monitors action failures
  - `repeated-failure-classifier.ts` — HH-GH-007: Repeated failures
  - `security-pr-volume-evaluator.ts` — HH-GH-009: Meta-control for PR volume

- **reporters/** — Output formatters
  - `console-reporter.ts` — Terminal output (chalk/ora)
  - `json-reporter.ts` — JSON export
  - `html-reporter.ts` — HTML reports
  - `sarif-reporter.ts` — SARIF 2.1.0 (GitHub Code Scanning integration)
  - `compliance-reporter.ts` — Framework compliance reports (NIST, CIS)

- **services/** — GitHub API integration
  - `github-fetcher.ts` — Octokit client for repos, PRs, workflows
  - `watch-orchestrator.ts` — Continuous monitoring mode
  - `state-manager.ts` — Stateful change detection
  - `change-detector.ts` — Issue deduplication

- **analyzers/** — AI-powered analysis
  - `security-analyzer.ts` — Legacy analyzer (deprecated, use policy-driven)
  - `ai-analyzer.ts` — Pattern analysis via `@github/copilot-sdk`

- **utils/** — Security and validation
  - `input-validator.ts` — GitHub token/org/days validation
  - `path-validator.ts` — Path traversal prevention
  - `html-sanitizer.ts` — XSS prevention

- **types/index.ts** — Core interfaces: `Repository`, `PullRequest`, `Workflow`, `SecurityIssue`, `AnalysisResult`, `OrganizationActivity`

## Working with Policies

### Adding a New Control

1. **Define in catalog** (`policies/catalog.yaml`):
   ```yaml
   - id: HH-GH-010
     statement: New control statement
     family: pull-request
     evaluator:
       kind: github.pull-request
       detector: new-detector
       parameters:
         - name: threshold
           type: number
           required: false
     default-severity: medium
     mappings:
       NIST-800-53: [CM-3]
   ```

2. **Create evaluator** (`src/evaluators/new-detector-evaluator.ts`):
   ```typescript
   @registerEvaluator('new-detector')
   export class NewDetectorEvaluator extends BaseEvaluator {
     readonly controlId = 'HH-GH-010';
     readonly kind = 'github.pull-request' as const;
     
     async evaluate(context, parameters, severity): Promise<EvaluationResult> {
       // Implementation
     }
   }
   ```

3. **Add to profiles** (`policies/default.yaml`, `policies/strict.yaml`):
   ```yaml
   controls:
     include:
       - HH-GH-010
     tailoring:
       - id: HH-GH-010
         severity: high  # Override default
   ```

### Customizing Existing Controls

Edit profiles to tailor controls without touching code:
- Change severity levels
- Adjust parameter values (thresholds, keywords, etc.)
- Enable/disable controls via `include` list

## Key Conventions

- **ES Modules** — `"type": "module"` in package.json; TypeScript targets ES2022
- **Biome** for linting/formatting — 100-char line width, 2-space indent, single quotes, trailing commas (ES5)
- **Tests** live in `src/__tests__/` matching `*.test.ts`; mocks in `src/__mocks__/`
- **Node >=20** required; CI tests against 20, 22
- **No linter suppression comments** outside of test files — `biome-ignore` and similar suppression comments are only allowed in `src/__tests__/**/*.test.ts` files. Production code in `src/` must pass linting without suppressions.
- **Evaluator registration** — Use `@registerEvaluator('detector-name')` decorator to register evaluators
- **Control IDs** — Format: `HH-GH-###` (HH = HubHelper, GH = GitHub, ### = sequential number)

## Quality Gates

All work sessions must satisfy these standards before considering work complete:

1. **Linting** — `npm run lint` must pass with zero errors or warnings.
2. **Unit tests** — `npm test` must pass with zero failures.
3. **Test coverage** — Every new or modified function must have corresponding tests in `src/__tests__/`.
4. **CI compatibility** — Changes must pass the full GitHub Actions CI matrix (`npm run lint`, `npm run build`, `npm test` across Node 20/22). Run `npm run lint && npm run build && npm test` locally before finishing.

## Environment Variables

```
GITHUB_TOKEN=<personal_access_token>
GITHUB_ORG=<organization_name>
ELEVENTY_PATH_PREFIX=/HubHelper/    # for docs deployment only
```
