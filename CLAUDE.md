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
