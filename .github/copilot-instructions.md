# GitHub Copilot Instructions

## Commands

```bash
# Build
npm run build            # TypeScript → dist/ via tsc
npm run dev              # Run without building: tsx src/index.ts [command] [options]

# Test
npm test                 # Full suite (Jest + ts-jest, ESM mode)
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report to coverage/
npx jest --testPathPattern=security-analyzer   # Run a single test file by name

# Lint & Format (Biome — not ESLint)
npm run lint             # Check
npm run lint:fix         # Auto-fix
npm run format           # Format in place

# Pre-commit gate (must all pass)
npm run lint && npm run build && npm test
```

## Architecture

**Entry point:** `src/index.ts` — Commander.js CLI with commands: `analyze`, `check-repo`, `watch`, `list` (subcommands), `report`.

**Data flow for `analyze`:**
```
GitHubFetcher → SecurityAnalyzer → AIAnalyzer → Reporters (console / JSON / HTML)
```

**Layer responsibilities:**
- `src/services/github-fetcher.ts` — All Octokit API calls; fetches repos, PRs, workflows
- `src/analyzers/security-analyzer.ts` — Detects: self-merges, security PRs, disabled Actions, paused/disabled workflows
- `src/analyzers/ai-analyzer.ts` — Risk patterns and recommendations via `@github/copilot-sdk`
- `src/analyzers/compliance-analyzer.ts` — Member profile compliance (name/email policy)
- `src/services/compliance-checker.ts` — Fetches org members and delegates to ComplianceAnalyzer
- `src/services/repository-list-manager.ts` — CRUD for named repo lists; persisted to `.gh-lists/lists.json`
- `src/services/list-report-generator.ts` — Generates `ListReport` from a saved repo list
- `src/reporters/` — Console (chalk/ora), JSON, HTML, CSV, Markdown output formatters
- `src/utils/` — Input validation, path traversal prevention, HTML sanitization (XSS)
- `src/types/index.ts` — All shared interfaces; `src/types/watch.ts` — watch-mode types

**Key types** (from `src/types/index.ts`): `Repository`, `PullRequest`, `Workflow`, `SecurityIssue`, `AnalysisResult`, `ComplianceResult`, `RepositoryList`, `ListReport`.

## Key Conventions

### ES Modules
The project uses `"type": "module"`. TypeScript imports **must** use `.js` extensions even when importing `.ts` source files:
```ts
import { GitHubFetcher } from './services/github-fetcher.js';  // ✅
import { GitHubFetcher } from './services/github-fetcher';     // ❌
```

### Testing
- Tests live in `src/__tests__/*.test.ts`; module mocks in `src/__mocks__/`
- Jest uses `ts-jest/presets/default-esm` with `moduleNameMapper` to strip `.js` extensions at runtime
- `src/index.ts` is excluded from coverage collection
- Mock external dependencies (Octokit, fs, chalk) — never hit the network in tests

### Biome (not ESLint)
- `noExplicitAny` is a **warning** (not error), but avoid `any` in production code
- `noNonNullAssertion` is **off** — non-null assertions (`!`) are permitted where safe
- Run `npm run lint:fix` to auto-resolve import order and formatting issues

### Security utilities (always use these)
All user-supplied strings must be validated before use:
- `validateOrganizationName`, `validateGitHubToken`, `validateDays` — from `src/utils/input-validator.ts`
- `validateFilePath` — from `src/utils/path-validator.ts`; prevents path traversal; enforces allowed extensions
- `sanitizeHtml` — from `src/utils/html-sanitizer.ts`; use in HTML reporters before injecting user content

### Documentation language
All user-facing documentation must use **UK English** spellings: "organisation", "customise", "colour", "behaviour", "analyse". Technical terms, CLI command names, JSON field names, and source code are exempt.

### Commit format (Conventional Commits)
```
<type>(<scope>): <subject>
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `security`, `revert`

### Environment variables
```
GITHUB_TOKEN=<pat>
GITHUB_ORG=<org-name>
```
Read from `.env` (via dotenv) or passed with `--token` / `--org` flags. Never hardcode.

### Repository list storage
Lists are stored locally in `.gh-lists/lists.json` (relative to CWD). The `RepositoryListManager` handles atomic writes via rename. Format: `org/repo` strings inside named list objects.
