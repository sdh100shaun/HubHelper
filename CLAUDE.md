# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HubHelper (`@sdh100shaun/hubhelper`) is an AI-powered CLI tool that visualizes GitHub activity and flags security issues across organizations using the GitHub Copilot SDK and Octokit. It detects self-merged PRs, security-related PRs, disabled GitHub Actions, paused/disabled workflows, and unreviewed security changes.

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

**CLI entry point:** `src/index.ts` — Commander.js with `analyze`, `check-repo`, and `watch` commands.

**Data flow pipeline:**
```
GitHubFetcher (src/services/) → SecurityAnalyzer (src/analyzers/) → AIAnalyzer (src/analyzers/) → Reporters (src/reporters/)
```

- **services/github-fetcher.ts** — Octokit-based GitHub API client; fetches repos, PRs, workflows
- **analyzers/security-analyzer.ts** — Core detection: self-merges, security PRs, disabled actions, workflow status
- **analyzers/ai-analyzer.ts** — Pattern analysis and risk assessment via `@github/copilot-sdk`
- **reporters/** — Three output formats: console (chalk/ora), JSON, HTML
- **utils/** — Input validation, path traversal prevention, HTML sanitization (XSS prevention)
- **types/index.ts** — Core interfaces: `Repository`, `PullRequest`, `Workflow`, `SecurityIssue`, `AnalysisResult`, `OrganizationActivity`

## Key Conventions

- **ES Modules** — `"type": "module"` in package.json; TypeScript targets ES2022
- **Biome** for linting/formatting — 100-char line width, 2-space indent, single quotes, trailing commas (ES5)
- **Tests** live in `src/__tests__/` matching `*.test.ts`; mocks in `src/__mocks__/`
- **Node >=20** required; CI tests against 20, 22
- **No linter suppression comments** outside of test files — `biome-ignore` and similar suppression comments are only allowed in `src/__tests__/**/*.test.ts` files. Production code in `src/` must pass linting without suppressions.

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
