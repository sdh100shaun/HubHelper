# AI-Assisted Policy Authoring & Explanation Layer Plan

**Status:** Planning Phase  
**Priority:** High  
**Estimated Effort:** 12–15 days  
**Target Version:** v1.3.0  

---

## Executive Summary

HubHelper currently uses hardcoded evaluators (TypeScript) to implement policy controls and a
static lookup table in `copilot-service.ts` to explain issues. This plan introduces two
AI-powered layers that reduce the amount of code that must be written per control and improve
the quality of output presented to security teams:

1. **AI Policy Authoring** — translate a plain-English security requirement into a valid
   YAML catalog entry + TypeScript evaluator stub, ready for human review and commit.
2. **AI Explanation Layer** — replace the static `fallbackExplain` map with contextual,
   remediation-focused explanations and an org-level executive summary, generated on demand.

Neither layer is required for normal operation; both are opt-in so performance and
determinism of the core analysis pipeline are preserved.

### Model Summary

| Layer | Task | Model | Model ID |
|---|---|---|---|
| Authoring | Single-control generation | Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| Authoring | Multi-control / complex generation | Claude Opus 4.6 | `claude-opus-4-6` |
| Explanation | Per-issue explanations + remediation | Claude Opus 4.7 | `claude-opus-4-7` |
| Explanation | Executive summary narrative | Claude Opus 4.7 | `claude-opus-4-7` |

Rationale: Sonnet 4.6 balances quality and speed for structured-output authoring tasks.
Opus 4.6 is used when inter-control reasoning depth is needed. Opus 4.7 — the most capable
available model — is reserved for the explanation layer where output quality directly affects
how security teams prioritise and action findings; the explanation cache ensures this does
not add latency to repeated scans.

---

## Motivation

### Current pain points

| Area | Problem |
|---|---|
| New control authoring | Requires editing 6+ files (catalog, two profiles, types, evaluator, index, tests) |
| Control logic | Every evaluation rule must be hand-coded in TypeScript |
| Issue explanations | `fallbackExplain` is a hard-coded string map — no context, no remediation steps |
| Executive reporting | No narrative summary; security leads read raw issue lists |

### Goals

- A developer unfamiliar with the codebase should be able to add a new policy control in
  under 10 minutes using the authoring CLI.
- Explanations should include remediation steps tailored to the specific repository and issue.
- Executive summaries should be usable without reading individual issue details.
- AI calls must never block the default analysis pipeline.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI (src/index.ts)                          │
└──────────┬───────────────────────────────────────┬──────────────────┘
           │                                       │
           │  existing                             │  new
           ▼                                       ▼
┌──────────────────────┐              ┌────────────────────────────┐
│   PolicyEngine       │              │   PolicyAuthorService      │
│   (unchanged)        │              │   (src/services/           │
│                      │              │    policy-author.ts)       │
│  evaluate() →        │              │                            │
│  PolicyEngineResult  │              │  author(prompt) →          │
└──────────┬───────────┘              │  AuthoredControl           │
           │                          └────────────────────────────┘
           │                                       │
           ▼                                       ▼
┌──────────────────────┐              ┌────────────────────────────┐
│   Reporters          │              │   PolicyValidator           │
│   (existing)         │              │   (src/policy/             │
│                      │              │    ai-validator.ts)        │
│  + AIExplainer       │              │                            │
│    (opt-in flag)     │              │  validateAgainstSchema()   │
└──────────────────────┘              └────────────────────────────┘
```

---

## Part 1 — AI Policy Authoring

### 1.1 New CLI Command

```
hubhelper author-policy "<natural language requirement>"

Options:
  --output   console | file          (default: console)
  --dir      path to write files to  (default: ./policies/generated/)
  --model    claude model to use     (default: claude-sonnet-4-6)
  --dry-run  print prompt only, do not call API
```

Example:

```bash
hubhelper author-policy \
  "contractors from acme-vendor.com should only be allowed to raise PRs against repos tagged with the 'external' topic"
```

Expected output:

```
✓ Generated control HH-GH-011
  Written to: policies/generated/HH-GH-011.yaml
  Evaluator stub: src/evaluators/generated/topic-scoped-access-evaluator.ts

Next steps:
  1. Review the YAML and evaluator stub
  2. Move files to their canonical locations
  3. Add HH-GH-011 to policies/default.yaml (include list)
  4. Run: npm run lint && npm run build && npm test
```

### 1.2 PolicyAuthorService

**File:** `src/services/policy-author.ts`

**Responsibilities:**
- Build a structured prompt containing:
  - The existing catalog (all current controls as context / few-shot examples)
  - The user's natural-language requirement
  - A JSON schema for the expected output format
- Call the Anthropic API (Claude Sonnet 4.6 by default) with structured output
- Parse and validate the response against `CatalogSchema` (Zod)
- Generate a TypeScript evaluator stub from the returned evaluator config

**Prompt structure:**

```
System:
  You are a security policy author for the HubHelper compliance engine.
  Given a natural-language security requirement, produce:
  1. A YAML catalog entry conforming to the schema below
  2. A TypeScript evaluator stub implementing the generated control

  <schema>...</schema>
  <existing-controls>...</existing-controls>

User:
  Requirement: "<user input>"
```

**Output type:**

```typescript
interface AuthoredControl {
  controlId: string;           // e.g. HH-GH-011
  catalogYaml: string;         // ready to paste into catalog.yaml
  evaluatorStub: string;       // TypeScript skeleton, implements BaseEvaluator
  warnings: string[];          // e.g. "requires orgMembers in context"
}
```

**Validation pipeline:**

```
LLM response (JSON)
  → parse YAML fragment
  → validate with CatalogSchema (Zod)   // reject if schema invalid
  → check control ID uniqueness
  → render evaluator stub from template
  → return AuthoredControl
```

### 1.3 Evaluator Stub Template

The authored evaluator will be a Handlebars (or simple string-interpolation) template that
generates a compilable but `throw new Error('Not implemented')` skeleton:

```typescript
// Generated by hubhelper author-policy — review before use
@registerEvaluator('{{detector}}')
export class {{ClassName}}Evaluator extends BaseEvaluator {
  readonly controlId = '{{controlId}}';
  readonly kind = '{{kind}}' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    // TODO: implement evaluation logic
    // Parameters available:
    {{#each parameters}}
    //   {{id}} ({{type}}): {{label}}
    {{/each}}
    throw new Error('Evaluator not yet implemented');
  }

  validateParameters(parameters: Record<string, unknown>): void {
    {{#each parameters}}
    {{#if required}}
    this.get{{typeHelper type}}Param(parameters, '{{id}}');
    {{/if}}
    {{/each}}
  }
}
```

### 1.4 Model Selection Rationale

| Task | Recommended Model | Model ID | Reason |
|---|---|---|---|
| Single-control authoring | `Claude Sonnet 4.6` | `claude-sonnet-4-6` | Latest Sonnet; strong structured-output quality and instruction-following; fast enough for interactive use |
| Multi-control / complex authoring | `Claude Opus 4.6` | `claude-opus-4-6` | Superior reasoning for controls with inter-dependencies, `depends-on` chains, and cross-cutting parameter design; used when `--complex` flag is passed or when the prompt references multiple existing controls |

The `--model` flag overrides the automatic selection. The default (`claude-sonnet-4-6`) is used
when no flag is passed and the requirement does not reference inter-control dependencies.

---

## Part 2 — AI Explanation Layer

### 2.1 Design Principles

- **Opt-in only.** Default `hubhelper analyze` output is unchanged.  
  Flag: `--ai-explain` enables per-issue AI explanations.  
  Flag: `--ai-summary` enables executive summary generation.
- **Batch, not per-issue calls.** All issues for a run are explained in a single API call
  using a structured prompt, not one call per issue (avoids latency multiplication).
- **Cache by fingerprint.** A SHA-256 of `(controlId, repository, key detail fields)`
  is used as a cache key so repeated runs don't re-explain unchanged issues.
- **Streaming for console output.** Use streaming API so the console reporter can display
  explanations as they arrive rather than waiting for the full batch.

### 2.2 AIExplainerService

**File:** `src/services/ai-explainer.ts`

**Interface:**

```typescript
interface ExplainedIssue {
  issue: SecurityIssue;
  explanation: string;     // 2–3 sentences: what happened and why it matters
  remediation: string[];   // ordered list of concrete fix steps
  references: string[];    // NIST/CIS control IDs + doc links
}

interface ExecutiveSummary {
  headline: string;          // one sentence, e.g. "3 critical access-control gaps found"
  narrative: string;         // 2–3 paragraphs suitable for a non-technical audience
  topRisks: string[];        // top 3 risks in plain English
  positives: string[];       // what is working well
  recommendedActions: string[]; // prioritised action items
}

class AIExplainerService {
  async explainIssues(
    issues: SecurityIssue[],
    policy: ResolvedPolicy
  ): Promise<ExplainedIssue[]>;

  async generateExecutiveSummary(
    result: PolicyEngineResult,
    org: string
  ): Promise<ExecutiveSummary>;
}
```

**Prompt structure for `explainIssues`:**

```
System:
  You are a security advisor. Given a list of compliance issues found in a
  GitHub organisation, explain each one concisely and provide remediation steps.
  Respond with a JSON array matching the ExplainedIssue schema.

User:
  Organisation: <org>
  Policy profile: <profile title>
  Issues (JSON): <issues array>
```

**Model:** `claude-opus-4-7` for both per-issue explanations and executive summaries.

Opus 4.7 is the latest and most capable Claude model. For the explanation layer, output
quality matters more than raw speed — a security advisor reading the report expects accurate
remediation steps and well-reasoned risk narrative. The explanation cache (§2.3) absorbs the
latency cost on repeated runs: Opus 4.7 is only called for issues that are genuinely new or
changed since the last scan.

### 2.3 Caching Strategy

```
src/services/
  explanation-cache.ts   — filesystem cache, keyed by SHA-256(issue fingerprint)
                           TTL: 24 hours (configurable)
                           Location: ~/.hubhelper/cache/explanations/
```

Cache hit rate will be high for recurring issues (same repo, same control violation that
hasn't been remediated). Only new or changed issues incur API calls.

### 2.4 Reporter Integration

**Console reporter changes (`src/reporters/console-reporter.ts`):**

```
Without --ai-explain (current):
  [HIGH] contractor-repo-access: myorg/internal-api
    Contractor alice has pull-request activity...

With --ai-explain:
  [HIGH] contractor-repo-access: myorg/internal-api
    Contractor alice has pull-request activity...
    
    AI Analysis:
      Alice's email (alice@acme-vendor.com) identifies her as a third-party contractor.
      Access to internal-api exposes proprietary business logic to an external party,
      violating least-privilege and your contractor access policy.
    
    Remediation:
      1. Remove alice from the internal-api repository collaborators
      2. Review any code alice has committed to internal-api in the last 30 days
      3. Update the contractor_allowed_repos policy parameter if this access is legitimate
    
    References: NIST AC-6 (Least Privilege), CIS Control 6.1
```

**HTML/JSON reporters:** Add optional `aiExplanation` and `aiRemediation` fields to the
report schema when `--ai-explain` is active. These are nullable so existing consumers don't
break.

### 2.5 Executive Summary Output

When `--ai-summary` is passed, the console reporter appends a formatted executive summary
block at the end of the report. The JSON/HTML reporters include it as a top-level field.

---

## Part 3 — GitHub MCP Considerations

The `@github/copilot-sdk` is already a dependency. The Copilot SDK does **not** expose
GitHub MCP tools directly from within a Node.js evaluator context — MCP is a server-side
transport layer used by IDE/agent surfaces, not a library API. Therefore:

- **Policy authoring and explanations** will use the **Anthropic Claude API directly**
  (via the `anthropic` npm package, consistent with the existing `ai-analyzer.ts` pattern)
  rather than attempting to call MCP tools.
- **GitHub data** needed for context (repo metadata, member emails) is already fetched by
  `GitHubFetcher` and passed through `EvaluationContext` — no MCP calls are needed.
- The `@github/copilot-sdk` may be used if the user is running inside a GitHub Copilot
  agent environment and a chat interface is preferred; this would be an alternative
  transport for the same prompts, configured via a flag.

---

## Files to Create / Modify

### New files

| File | Purpose |
|---|---|
| `src/services/policy-author.ts` | PolicyAuthorService — authoring logic + Anthropic API call |
| `src/services/ai-explainer.ts` | AIExplainerService — batch explanation + executive summary |
| `src/services/explanation-cache.ts` | Filesystem-backed explanation cache |
| `src/templates/evaluator-stub.ts` | Evaluator stub template renderer |
| `src/__tests__/policy-author.test.ts` | Unit tests (mocked API) |
| `src/__tests__/ai-explainer.test.ts` | Unit tests (mocked API) |
| `src/__tests__/explanation-cache.test.ts` | Cache tests |
| `policies/generated/.gitkeep` | Placeholder for generated controls |

### Modified files

| File | Change |
|---|---|
| `src/index.ts` | Add `author-policy` command; add `--ai-explain` and `--ai-summary` flags to `analyze` |
| `src/reporters/console-reporter.ts` | Render AI explanation block when present |
| `src/reporters/json-reporter.ts` | Include `aiExplanation` / `aiRemediation` fields (nullable) |
| `src/reporters/html-reporter.ts` | Render AI explanation section |
| `package.json` | Confirm `anthropic` package is listed (check version, add if missing) |

---

## Phased Delivery

### Phase 1 — AI Explanation Layer (5 days)

Lowest risk; purely additive to existing output. No changes to the analysis pipeline.

1. `AIExplainerService` + mocked tests
2. `ExplanationCache`
3. Console reporter `--ai-explain` flag
4. JSON/HTML reporter schema additions
5. `--ai-summary` flag + executive summary

### Phase 2 — AI Policy Authoring (7 days)

Slightly higher complexity; requires prompt engineering iteration.

1. `PolicyAuthorService` + Zod validation pipeline
2. Evaluator stub template renderer
3. `author-policy` CLI command
4. Tests with mocked Anthropic responses
5. Documentation update

### Phase 3 — Polish (2 days)

1. Streaming output in console reporter for long AI responses
2. Cache TTL configuration via env/profile
3. Model selection flag (`--model`)
4. Rate-limit handling + retry logic

---

## Open Questions for Review

1. **API key management.** Should the Anthropic key be read from `ANTHROPIC_API_KEY` env var
   (same as Claude Code), or should HubHelper have its own `HUBHELPER_AI_KEY`? Using the
   same var reduces friction but may surprise users.

2. **Copilot SDK vs Anthropic SDK.** The `@github/copilot-sdk` is already installed. Do you
   prefer to use it exclusively (keeps vendor surface smaller) or use the Anthropic SDK
   directly (more model flexibility, explicit access to Sonnet 4.6 / Opus 4.6 / Opus 4.7)?

3. **Generated control IDs.** The plan assigns sequential IDs (HH-GH-011 onwards) to
   AI-authored controls. Should there be a different namespace (e.g. `HH-AI-001`) to
   distinguish AI-generated controls from hand-authored ones?

4. **Review gate.** Should the `author-policy` command write to a `policies/generated/`
   staging directory (requiring manual promotion), or should it write directly to
   `policies/catalog.yaml` with a warning?

5. **Test coverage for AI paths.** All AI service tests will mock the Anthropic API. Is
   there a requirement for integration tests against the live API in CI, or is mocking
   sufficient?
