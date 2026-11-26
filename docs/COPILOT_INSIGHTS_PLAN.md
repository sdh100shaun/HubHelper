# Copilot Insights Feature Plan

## Context

HubHelper already uses `@github/copilot-sdk` for AI analysis (`CopilotService`, `SecurityQueryService`,
`PolicyAuthor`). It does **not** yet look at how the organisation itself uses GitHub Copilot.

Security, platform and finance teams need one place to see:

- **Adoption**: who has a seat, who uses it, and how usage changes over time.
- **Engagement depth**: completions vs chat vs agent mode vs the coding agent, per IDE, language,
  model and client.
- **Spend**: premium requests or AI credits per user and model, compared with budget.
- **Governance**: idle seats, policy drift, unapproved models or clients, and Copilot-authored PRs
  merged without human review.
- **Narrative**: an AI-written summary, plus natural-language Q&A over the data
  ("Which teams adopted agent mode last month?").

This plan adds a `copilot` command group. It fetches the data with the GitHub REST API, stores
daily snapshots so trends survive the API's retention window, runs Copilot-specific policy controls
through the existing engine, and uses the Copilot SDK for summaries and Q&A.

---

## Data Sources (GitHub REST, API version `2026-03-10`)

| Area | Endpoint | Notes |
|------|----------|-------|
| Org daily metrics | `GET /orgs/{org}/copilot/metrics/reports/organization-1-day?day=` | Returns **signed download URLs** (NDJSON). Includes active/engaged user counts, `totals_by_ai_adoption_phase`, PR stats |
| Org 28-day metrics | `GET /orgs/{org}/copilot/metrics/reports/organization-28-day` | Rolling window, used for a quick first view |
| Per-user daily metrics | `GET /orgs/{org}/copilot/metrics/reports/users-1-day?day=` | One row per user per day. Per-feature/IDE/language/model counters, `totals_by_client` |
| Team membership | `GET /orgs/{org}/copilot/metrics/reports/user-teams-1-day?day=` | Join on `user_id` + `day` for team rollups (never sum teams back into an org total, because users in several teams would be counted more than once) |
| Seats | `GET /orgs/{org}/copilot/billing/seats` (paginated) | `last_activity_at`, `last_activity_editor`, `assignee`, `assigning_team`, `pending_cancellation_date` |
| Seat summary and policies | `GET /orgs/{org}/copilot/billing` | Seat breakdown, `seat_management_setting`, IDE chat / CLI / public-code-suggestion policies |
| Premium requests (legacy) | `GET /organizations/{org}/settings/billing/premium_request/usage` | Filters: `user`, `model`, `day`, `month`, `year` |
| AI credits (usage-based billing) | `GET /organizations/{org}/settings/billing/ai_credit/usage` | Replaces premium requests for accounts that have moved to AI Credits |
| Copilot-authored PRs | Existing `GitHubFetcher` PR data, filtered on Copilot coding agent author or co-author | Reuses data the tool already fetches |
| Audit log (optional, Enterprise Cloud) | `GET /orgs/{org}/audit-log?phrase=action:copilot` | Seat and policy changes |

**Constraints to design around**

- Metrics reports are only produced for days on which the org has **five or more** active
  licences. Treat a missing day as "suppressed", not as zero usage.
- Report URLs are signed and expire, so download them as soon as they are returned and do not
  cache the URLs.
- Permissions: classic PAT/OAuth needs `read:org` plus `manage_billing:copilot` for seats. A
  fine-grained token needs "Organization Copilot metrics: read", "Copilot business: read" and
  "Administration: read" for billing usage. GitHub App installations work through the existing
  `github-auth.ts`.
- Some schema fields are new or depend on a policy (for example, `totals_by_client` needs the usage
  metrics policy turned on). Parse leniently with Zod `.passthrough()` and optional fields.
- The billing model can be either legacy premium requests or AI credits. Detect which one applies
  by probing the endpoints, and allow an override with `--billing-model`.

---

## Architecture

```
CopilotMetricsFetcher ──┐
CopilotSeatsFetcher  ───┼─► CopilotSnapshotStore (~/.hubhelper/copilot/<org>/<day>.json.gz)
CopilotBillingFetcher ──┘                │
                                         ▼
                              CopilotUsageAggregator  ──►  CopilotUsageModel
                                         │                  (org / team / user / model /
                                         │                   IDE / language / client / time)
                ┌────────────────────────┼──────────────────────────┐
                ▼                        ▼                          ▼
     PolicyEngine (github.copilot   CopilotInsightsService      Reporters
     evaluators HH-GH-011..017)     (Copilot SDK: narrative,    ├─ console (tables, sparklines)
                                     Q&A tools over the model)  ├─ html (interactive dashboard)
                                                                ├─ json / csv / markdown
                                                                └─ sarif (governance findings)
```

### New files

```
src/types/copilot.ts                       # Zod schemas + interfaces for reports, seats, billing
src/services/copilot/metrics-fetcher.ts    # Report-link fetch + NDJSON download/parse (streamed)
src/services/copilot/seats-fetcher.ts      # Paginated seats + billing/policy summary
src/services/copilot/billing-fetcher.ts    # Premium request / AI credit usage, model detection
src/services/copilot/snapshot-store.ts     # Gzipped daily snapshots, backfill, retention
src/services/copilot/usage-aggregator.ts   # Builds CopilotUsageModel; team joins; derived KPIs
src/services/copilot/insights-service.ts   # Copilot SDK narrative + defineTool-based Q&A
src/evaluators/copilot/*.ts                # One evaluator per control (see below)
src/reporters/copilot-console-reporter.ts
src/reporters/copilot-html-reporter.ts     # Uses src/templates/, reuses html-sanitizer
policies/copilot.yaml                      # Copilot governance profile
website/content/docs/copilot-insights.md   # User guide (UK English)
```

---

## Implementation Plan

### Phase 1: Types and fetchers

1. **`src/types/copilot.ts`**: Zod schemas for `OrgDayReport`, `UserDayReport`, `UserTeamDay`,
   `CopilotSeat`, `CopilotOrgBilling`, `PremiumRequestUsageItem`, `AiCreditUsageItem`. Every
   breakdown array (`totals_by_ide`, `totals_by_feature`, `totals_by_language_feature`,
   `totals_by_model_feature`, `totals_by_client`) is optional, and the schemas use `.passthrough()`
   so new GitHub fields do not break parsing. Export inferred TypeScript interfaces.
2. **`metrics-fetcher.ts`**:
   - `getReportLinks(kind, day?)` calls the report endpoint and returns the signed URLs.
   - `downloadReport(url)` uses `fetch`, splits the NDJSON stream into lines and validates each
     row with Zod. Rows that fail validation are counted and skipped, never thrown.
   - Maps a 404 or empty response for a day to `{ status: 'suppressed' | 'unavailable' }`.
   - Respects rate-limit headers with exponential backoff, with logic shared with `GitHubFetcher`.
3. **`seats-fetcher.ts`**: paginate `billing/seats` with `octokit.paginate`, and fetch
   `copilot/billing` for policy settings.
4. **`billing-fetcher.ts`**: `detectBillingModel()` probes `ai_credit/usage` and falls back to
   `premium_request/usage`. `getUsage({ from, to, groupBy })` returns normalised
   `CopilotSpendItem[]` (`user`, `model`, `day`, `quantity`, `grossAmount`, `netAmount`, `unit`).

### Phase 2: Snapshot store and aggregation

5. **`snapshot-store.ts`**:
   - Stores one gzipped JSON file per org per day: org report, user rows, team rows, seats, spend.
   - `backfill(org, fromDay, toDay)` fetches only the days that are missing, with limited
     concurrency (4).
   - Retention is configurable (default 400 days), so year-on-year views keep working after the
     API's own window has passed.
   - Lives under the existing state directory used by `StateManager`, with paths checked by
     `path-validator.ts`.
6. **`usage-aggregator.ts`** builds `CopilotUsageModel` for a date range. Derived KPIs:
   - **Adoption**: seats assigned, active users (daily, weekly, 28-day), active ÷ seats,
     engaged-user ratio, and the adoption-phase distribution.
   - **Depth**: share of interactions by feature (completions, chat, agent mode, edits, CLI, code
     review, coding agent), suggestion acceptance rate, lines accepted, and chat turns per active
     user.
   - **Breadth**: usage by IDE, language, model and client (including third-party clients from
     `totals_by_client`).
   - **Cohorts**: power users (top 10% by interactions), casual users, and dormant seats (no
     activity for N days). Movement between cohorts week on week.
   - **Teams**: per-team rollups built from the `user-teams-1-day` join.
   - **Spend**: cost per active user, cost per model, top spenders, a month-to-date run rate and a
     linear forecast against the configured budget.
   - **Impact**: Copilot coding agent PRs opened, merged and median time to merge (from
     `GitHubFetcher`), plus the report's PR counters.
   - Time series at day, week and month granularity, with "suppressed" gaps kept rather than
     filled in.

### Phase 3: Policy controls (`kind: github.copilot`)

7. Add `github.copilot` to `EvaluatorKindSchema` (`src/policy/types.ts`). Extend the engine context
   with an optional `copilot?: CopilotUsageModel`. Evaluators of this kind return
   `not-applicable` when it is absent, so `analyze` keeps working unchanged.
8. Add the controls to `policies/catalog.yaml` and implement them under
   `src/evaluators/copilot/`:

| ID | Detector | Statement | Default severity | Mappings |
|----|----------|-----------|------------------|----------|
| HH-GH-011 | `copilot-idle-seat` | Seats with no activity for more than `inactive-days` (default 30) | low | CIS 5.3, NIST AC-2(3) |
| HH-GH-012 | `copilot-public-code-matching` | Suggestions matching public code are allowed when org policy should block them | high | NIST SA-4, CM-10 |
| HH-GH-013 | `copilot-unapproved-model` | Usage of models outside the `allowed-models` list | medium | NIST CM-7, SA-9 |
| HH-GH-014 | `copilot-unapproved-client` | Usage from clients or IDEs outside `allowed-clients` | medium | NIST CM-7(5) |
| HH-GH-015 | `copilot-agent-pr-unreviewed` | Copilot coding agent PRs merged without an approving human review | high | NIST CM-3, SA-11 |
| HH-GH-016 | `copilot-spend-threshold` | Spend forecast exceeds `monthly-budget`, or one user exceeds `per-user-cap` | medium | NIST SA-9 |
| HH-GH-017 | `copilot-seat-sprawl` | Seats assigned directly to users rather than through teams, beyond `max-direct-pct` | low | NIST AC-2 |

9. Add a `policies/copilot.yaml` profile. `default.yaml` and `strict.yaml` include HH-GH-011,
   HH-GH-012 and HH-GH-015, because those apply to every org.

### Phase 4: AI insights with the Copilot SDK

10. **`insights-service.ts`** follows the `SecurityQueryService` patterns: a lazy `CopilotClient`,
    the shared `SESSION_IDLE_TIMEOUT_SECONDS`, rate limiting, timeouts and a deterministic fallback
    when the SDK is unavailable.
    - **Narrative** (`summarise(model)`): sends a compact, aggregated JSON summary, never raw
      per-user rows, and returns validated JSON:
      `{ headline, adoption, engagement, spend, risks[], recommendations[] }`.
    - **Q&A** (`ask(question)`): registers `defineTool` tools so the model pulls only what it
      needs, instead of receiving the whole dataset in the prompt:
      `get_adoption_trend(granularity, from, to)`, `get_breakdown(dimension, metric, filter)`,
      `get_team_summary(team)`, `get_user_activity(login)`, `get_spend(groupBy, from, to)`,
      `list_findings(minSeverity)`, `compare_periods(metric, a, b)`.
    - **Anomaly explanation**: z-score detection over daily series in the aggregator. The SDK then
      explains the top anomalies, for example "agent-mode usage up 3× on Tuesday".
    - **Privacy**: a `--anonymise` flag replaces logins with stable hashes in prompts and reports.
      Logins are never sent to the model unless the user asks about a named user.

### Phase 5: CLI (`src/index.ts`)

```
hubhelper copilot sync      --org <org> [--from <day>] [--to <day>]   # backfill snapshots
hubhelper copilot usage     --org <org> [--days 28] [--by team|ide|language|model|client|feature]
                            [--team <slug>] [--user <login>] [--format console|json|csv|md|html]
hubhelper copilot seats     --org <org> [--inactive-days 30] [--format ...]
hubhelper copilot spend     --org <org> [--month YYYY-MM] [--by user|model] [--budget <n>]
hubhelper copilot insights  --org <org> [--days 90] [--anonymise] [--model <id>]
hubhelper copilot ask       "which teams adopted agent mode fastest?" --org <org>
hubhelper copilot report    --org <org> --output copilot.html [--profile policies/copilot.yaml]
```

- Every command syncs any missing days first, unless `--offline` is passed.
- Inputs are validated with `input-validator.ts`, with new validators for day and month formats
  and the date range.
- `watch` gains an optional `--copilot` flag that runs the Copilot controls on every cycle.

### Phase 6: Reporting

11. **Console**: KPI header (seats, active, engaged, acceptance rate, MTD spend), Unicode sparklines
    for 28-day trends, top-N tables per breakdown, then findings.
12. **HTML dashboard**: self-contained file with inline JS and no CDN, consistent with the existing
    reporter. Sections:
    - Adoption funnel: seats, then active, then engaged, then power users.
    - Stacked feature-mix area chart over time.
    - Heatmaps: language × feature, and team × week.
    - Model and client share charts, and a spend vs budget burn-down.
    - Seat table with filters (idle, team, editor), PR impact panel, AI narrative and findings.
    - Every value is escaped with `html-sanitizer.ts`, and the dashboard must meet WCAG AAA
      contrast, as the docs site does.
13. **JSON, CSV and Markdown**: the full `CopilotUsageModel` plus findings. CSV gives one table per
    breakdown, which is useful in BI tools.
14. **SARIF**: governance findings only, so they show up in Code Scanning.

### Phase 7: Tests, docs and quality gates

15. Fixtures in `src/__tests__/fixtures/copilot/` based on GitHub's published example schema, with
    edge cases: a suppressed day, a missing `totals_by_client`, an unknown field, a malformed
    NDJSON line, an expired signed URL (403) and a user in several teams.
16. Unit tests, keeping coverage above 75% per file:
    - The three fetchers, with mocked Octokit and `fetch`.
    - The snapshot store, using a temporary directory.
    - Aggregator KPIs and the team de-duplication rule.
    - Each evaluator, with compliant, violating and not-applicable cases.
    - Insights service with the mocked SDK, extending `src/__mocks__/@github/copilot-sdk.ts`, and
      its fallback path.
    - The reporters.
17. Docs: `website/content/docs/copilot-insights.md`, covering permissions, the five-licence
    threshold, the privacy flags and example output. Add it to `navigation` in
    `website/docmd.config.js`. Also update the README feature list and the CHANGELOG.
18. Run `npm run lint && npm run build && npm test`, and `npm run docs:validate && npm run
    docs:build`.

---

## Delivery Slices (one PR each)

1. `feat(copilot): add copilot metrics, seats and billing fetchers` (Phases 1–2)
2. `feat(copilot): add copilot usage command with console and json output` (Phase 5, `usage`,
   `seats`, `spend`, `sync`)
3. `feat(policy): add github.copilot governance controls HH-GH-011..017` (Phase 3)
4. `feat(copilot): add AI insights and natural-language queries via copilot sdk` (Phase 4)
5. `feat(reporters): add copilot html dashboard` (Phase 6) plus docs

## Open Questions

- **Enterprise scope**: should `--enterprise <slug>` be included from the start? The same report
  endpoints exist under `/enterprises/{enterprise}/copilot/metrics/reports/*`, and enterprise
  billing adds organisation and cost-centre dimensions.
- **Storage**: are gzipped JSON snapshots enough, or is SQLite needed for large orgs (more than
  10k seats × 400 days)? Start with JSON behind a `SnapshotStore` interface.
- **Coding agent detection**: confirm the exact author or co-author signature of Copilot coding
  agent PRs, and whether a sessions or tasks API is available to the org's plan.
- **Retention and privacy**: per-user history is personal data. Decide the default retention, and
  whether `--anonymise` should be on by default for HTML reports that are shared.
