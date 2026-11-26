# Copilot Insights Feature Plan

## Implementation status

Built on branch `claude/dreamy-lamport-fr736x` as one change rather than the seven slices below.
User guide: `website/content/docs/features/copilot-insights.md`.

Differences from this plan:

- **Not built yet**: `watch --copilot`. Copilot controls run through `copilot report` and
  `copilot insights` only.
- **Schema**: `scope_day_metrics` is long format (`metric`, `value`) instead of fixed columns, so new
  report fields need no migration. Scope breakdowns and flags have their own tables
  (`scope_day_breakdown`, `scope_day_flags`), org settings are snapshotted in `org_settings_day`, and
  the access log is split into `access_batch` (reason, hash chain) and `access_log` (one row per
  person viewed).
- **Code layout**: migrations live in `store/migrations.ts` (so they ship in `dist/` without a copy
  step); read queries live in `usage-aggregator.ts` and `user-profile.ts` rather than a separate
  `queries.ts`; the ten evaluators share `src/evaluators/copilot-evaluators.ts`; the CLI lives in
  `src/cli/copilot-command.ts`.
- **Seats**: `copilot seats --anonymise` lists pseudonymised seats without a reason. Named seat
  lists still need one.
- **Billed org**: the API does not say which organisation is billed for a person with seats in
  several organisations, so profiles show it only when the person holds exactly one seat.
- **Field names**: written without access to the live schema reference. Core counters are read by
  name with fallbacks, and every `totals_by_*` array is stored generically, so unknown fields are
  kept rather than lost. Check the names against a real report before relying on specific counters.


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

This plan adds a `copilot` command group. It fetches the data with the GitHub REST API, stores it
in a local **SQLite** database so trends survive the API's retention window and can be queried with
SQL, runs Copilot-specific policy controls through the existing engine, and uses the Copilot SDK for
summaries and Q&A.

**Scope**: both **organisations** and **enterprises** are supported from the first release. Every
fetcher, table, KPI and command takes a `CopilotScope`:

```ts
type CopilotScope =
  | { kind: 'org'; org: string }
  | { kind: 'enterprise'; enterprise: string; orgs?: string[] }; // orgs narrows the view
```

---

## Data Sources (GitHub REST, API version `2026-03-10`)

### Organisation scope

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

### Enterprise scope

| Area | Endpoint | Notes |
|------|----------|-------|
| Enterprise daily metrics | `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-1-day?day=` | One aggregated record for the enterprise per day |
| Enterprise 28-day metrics | `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest` | Rolling window for a quick first view |
| Per-user daily metrics | `GET /enterprises/{enterprise}/copilot/metrics/reports/users-1-day?day=` | Same row shape as the org report, plus `ai_credits_used`. Users are attributed to orgs through seat data |
| Team membership | `GET /enterprises/{enterprise}/copilot/metrics/reports/user-teams-1-day?day=` | Enterprise teams. Same de-duplication rule as for orgs |
| Seats | `GET /enterprises/{enterprise}/copilot/billing/seats` (paginated) | Each seat carries its `organization`, which is how a user is attributed to an org |
| Premium requests (legacy) | `GET /enterprises/{enterprise}/settings/billing/premium_request/usage` | Adds `organization` and `cost_center_id` filters (`none` for usage outside any cost centre) |
| AI credits | `GET /enterprises/{enterprise}/settings/billing/ai_credit/usage` | Same extra filters |
| Cost centres | `GET /enterprises/{enterprise}/settings/billing/cost-centers` | Maps users and orgs to cost centres for chargeback |
| Member orgs | `GET /enterprises/{enterprise}/...` org listing (GraphQL `enterprise.organizations` as a fallback) | Drives per-org fan-out for policy settings and PR data |
| Audit log | `GET /enterprises/{enterprise}/audit-log?phrase=action:copilot` | Enterprise-level Copilot policy changes |

**Enterprise-specific design points**

- Enterprise access needs an enterprise owner, a billing manager, or the fine-grained "View
  Enterprise Copilot Metrics" permission. GitHub App installations need "Enterprise Copilot
  metrics: read". Detect missing permissions per endpoint and degrade, for example by showing
  metrics without spend, rather than failing the whole run.
- One user can hold seats in several orgs, and for multi-org licences GitHub bills one org per
  cycle. Store seat-to-org assignments per day, and report "billed org" separately from "orgs the
  user is active in".
- Settings that only exist per org (public-code matching, policy settings) and PR data are fetched
  by fanning out to each member org with limited concurrency. Orgs the token cannot read are
  listed as "not assessed", not silently skipped.
- Enterprise rollups come from the enterprise reports, never from adding up org reports. That
  would double-count users with seats in several orgs, and would miss orgs below the five-licence
  threshold.

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
  metrics policy turned on). Parse leniently with Zod `.passthrough()` and optional fields. Keep the
  raw row as JSON in SQLite as well, so fields added later can be backfilled without fetching again.
- Reports now flag telemetry gaps and outdated client versions. Store these flags and show them
  next to the affected numbers, so under-reported usage is not mistaken for low adoption.
- The billing model can be either legacy premium requests or AI credits. Detect which one applies
  by probing the endpoints, and allow an override with `--billing-model`.

---

## Architecture

```
CopilotMetricsFetcher ──┐   (org or enterprise scope)
CopilotSeatsFetcher  ───┼─► CopilotStore (SQLite via node:sqlite, ~/.hubhelper/copilot.db)
CopilotBillingFetcher ──┘                │   raw JSON + normalised fact tables + SQL views
                                         ▼
                              CopilotUsageAggregator  ──►  CopilotUsageModel
                                         │                  (enterprise / org / cost centre /
                                         │                   team / user / model / IDE /
                                         │                   language / client / time)
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
src/services/copilot/scope.ts              # CopilotScope, path builders, permission probing
src/services/copilot/metrics-fetcher.ts    # Report-link fetch + NDJSON download/parse (streamed)
src/services/copilot/seats-fetcher.ts      # Paginated seats + billing/policy summary
src/services/copilot/billing-fetcher.ts    # Premium request / AI credit usage, cost centres
src/services/copilot/store/                # SQLite store
  ├─ database.ts                           #   open/configure node:sqlite (WAL, foreign keys)
  ├─ migrations/0001_init.sql …            #   versioned schema migrations
  ├─ migrator.ts                           #   applies migrations, tracks user_version
  ├─ copilot-store.ts                      #   ingest (upsert), sync bookkeeping, retention
  └─ queries.ts                            #   typed, parameterised read queries for the aggregator
src/services/copilot/user-profile.ts      # Individual usage profile (see "Individual usage")
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

### Phase 1: Types, scope and fetchers

0. **`scope.ts`**: `CopilotScope`, plus helpers that build the correct REST path for each scope
   (`reportPath(scope, 'users-1-day')` returns `/orgs/...` or `/enterprises/...`).
   `probeAccess(scope)` calls each endpoint once and returns a capability map (`metrics`, `seats`,
   `spend`, `costCentres`, `auditLog`), which commands use to degrade gracefully.
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

### Phase 2: SQLite store and aggregation

5. **Engine choice: `node:sqlite` (`DatabaseSync`).** It is built into Node, so there is no
   native build step and no new dependency for the SBOM. It is a release candidate from
   **v24.15.0**, so raise `engines.node` to `>=24.15.0`. Node 26 is already covered. The
   experimental warning is suppressed only for this module, and all access goes through a
   `CopilotStore` interface so `better-sqlite3` could be swapped in if ever needed.
6. **Schema** (`migrations/0001_init.sql`). Every fact table is keyed by `scope_id`, so one database
   can hold several orgs and enterprises:

   ```sql
   scopes(id PK, kind, slug, UNIQUE(kind, slug))
   sync_runs(id PK, scope_id, started_at, finished_at, status, error)
   sync_days(scope_id, report_kind, day, status, row_count, fetched_at,
             PRIMARY KEY(scope_id, report_kind, day))  -- status: ok|suppressed|unavailable|error
   raw_reports(scope_id, report_kind, day, payload_json, PRIMARY KEY(scope_id, report_kind, day))

   users(id PK /* GitHub user_id */, login, first_seen, last_seen)
   orgs(id PK, scope_id, login)                      -- enterprise member orgs
   teams(id PK, scope_id, slug, name)
   cost_centres(id PK, scope_id, name)
   cost_centre_members(cost_centre_id, member_type /* user|org */, member_ref, valid_from, valid_to)

   scope_day_metrics(scope_id, day, active_users, engaged_users, …, flags_json,
                     PRIMARY KEY(scope_id, day))
   user_day_metrics(scope_id, day, user_id, interactions, code_gen, code_accept,
                    loc_suggested, loc_accepted, chat_turns, agent_turns, ai_credits_used,
                    flags_json, PRIMARY KEY(scope_id, day, user_id))
   user_day_breakdown(scope_id, day, user_id, dimension /* ide|feature|language|model|client */,
                      key, sub_key, metric, value,
                      PRIMARY KEY(scope_id, day, user_id, dimension, key, sub_key, metric))
   user_team_day(scope_id, day, user_id, team_id, PRIMARY KEY(scope_id, day, user_id, team_id))
   seat_day(scope_id, day, user_id, org_id, assigning_team_id, plan_type, last_activity_at,
            last_activity_editor, pending_cancellation, PRIMARY KEY(scope_id, day, user_id, org_id))
   spend_day(scope_id, day, user_id, org_id, cost_centre_id, model, product, unit,
             quantity, gross_amount, discount_amount, net_amount)
   agent_prs(scope_id, repo, number, org_id, opened_at, merged_at, human_approved, …)
   findings(scope_id, run_id, control_id, severity, fingerprint, subject, detected_at)
   access_batch(id PK, viewed_at, viewer /* token's GitHub login */, scope_id, command,
                reason_code, reason, prev_hash, row_hash)
   access_log(id PK, batch_id FK, subject_user_id)
   ```

   - The long-format `user_day_breakdown` table means new breakdown dimensions from GitHub need
     no schema change.
   - Seats are snapshotted daily (`seat_day`) so idle-seat and seat-churn history can be
     rebuilt. The API itself only shows current state.
   - Indexes go on `(scope_id, day)`, `(user_id, day)` and `(dimension, key, day)`.
   - **SQL views** for common analysis: `v_daily_adoption`, `v_weekly_active`, `v_feature_mix`,
     `v_team_day` (with the de-duplication rule built in), `v_cost_per_active_user`, `v_idle_seats`
     and `v_org_rollup`.
7. **`copilot-store.ts`**:
   - `ingest*()` methods upsert inside one transaction per report-day, so a re-sync is idempotent.
   - `missingDays(scope, kind, from, to)` reads `sync_days`, and `sync` fetches only those days
     (concurrency 4). Errored days are retried and suppressed days are not.
   - Retention is configurable (default 400 days for per-user rows, kept indefinitely for
     scope-level aggregates). `--purge-user <login>` deletes one person's data for privacy
     requests.
   - The database lives under the existing HubHelper state directory, with its path checked by
     `path-validator.ts` and file mode `0600`. Override it with `--db <path>`.
   - Every query is parameterised, and no SQL is built from user input.
   - `hubhelper copilot sql "<SELECT …>"` opens the database **read-only** (only `SELECT` is
     allowed, enforced by opening with `readOnly: true`) for ad-hoc analysis, with output in
     table, CSV or JSON. Power users can also open `copilot.db` in any SQLite tool.
8. **`usage-aggregator.ts`** builds `CopilotUsageModel` for a date range from `queries.ts`. Derived KPIs:
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
   - **Enterprise**: per-org league table (adoption, depth, spend per active user), per-cost-centre
     chargeback, users with seats in several orgs, and the billed org vs the orgs a user is active
     in.
   - **Spend**: cost per active user, cost per model, top spenders, a month-to-date run rate and a
     linear forecast against the configured budget.
   - **Impact**: Copilot coding agent PRs opened, merged and median time to merge (from
     `GitHubFetcher`), plus the report's PR counters.
   - Time series at day, week and month granularity, with "suppressed" gaps kept rather than
     filled in.

#### Individual usage (`user-profile.ts`)

`buildUserProfile(scope, login, range)` returns a `CopilotUserProfile` for one person. Everything
comes from tables that already exist, so this needs no new fetching:

- **Identity and seat**: login, the orgs where they hold a seat, the billed org, assigning team or
  direct assignment, plan type, cost centre(s), and seat start and cancellation dates. Includes
  seat history from `seat_day` (assigned, moved between orgs, removed).
- **Activity timeline**: a daily series of interactions, code generations and acceptances, lines
  suggested and accepted, chat turns and agent turns. Also active days per week, current and
  longest active streak, first and last activity, and days since last activity (from both the
  reports and the seat's `last_activity_at`).
- **How they use Copilot**: feature mix over time (completions, chat, agent mode, edits, CLI, code
  review, coding agent), acceptance rate by language, and their IDEs, models and clients
  (including third-party clients). Also the date each feature was first used, which shows how
  their adoption has progressed.
- **Spend**: AI credits or premium requests per day and per model, month to date, and their share
  of the team, org and enterprise total.
- **Coding agent work**: Copilot coding agent PRs they started or reviewed, merge rate, median time
  to merge, and whether each had a human approval.
- **Context against peers**: percentile rank against their team(s), their org and the enterprise
  for activity, acceptance rate and spend. Peer groups smaller than five people are left out, to
  match GitHub's own threshold and avoid comparisons that identify individuals.
- **Findings**: any HH-GH-0xx findings for this user, such as an idle seat, an unapproved model or
  client, being over the per-user spend cap, or holding seats in several orgs.
- **Data quality**: days where telemetry gaps or outdated-client flags apply, so low numbers are
  not misread.
- **Comparison**: `compareUsers(a, b)` and `compareToSelf(login, periodA, periodB)`, for example
  usage before and after enablement training.

**Safeguards for looking at individuals**

- **A logged reason is required to see any named individual's data.** This cannot be switched
  off. It applies to every route that shows per-user data with logins:

  | Route | When a reason is needed |
  |-------|-------------------------|
  | `copilot user`, `copilot users` | Always |
  | `copilot usage --user`, `copilot seats`, `copilot spend --by user` | Always (these list named people) |
  | `copilot report` | Only when it includes individual pages or named-user tables. `--anonymise` builds a report that needs no reason |
  | `copilot ask` | When the model calls `get_user_profile` or `compare_users`. The tool returns "reason required" unless the session was started with `--reason`, and the model passes that on to the user |
  | `copilot sql` | When the query reads a table or view with per-user rows (checked against the list of user-level objects) |
  | `copilot db export` | Always, because the export contains per-user rows |

- **How the reason is given**:
  - `--reason "<text>"` with an optional `--reason-code`
    (`enablement | licence-review | cost-review | security-investigation | data-subject-request |
    other`, default `other`).
  - Without `--reason`, an interactive terminal prompts for one. A non-interactive run (CI,
    scripts) fails with a clear error instead of continuing.
  - Validation: 10–500 characters after trimming. Control characters and newlines are stripped,
    and obvious placeholders (`test`, `n/a`, `asdf`, repeated characters) are rejected. The
    reason is stored as written. It is never sent to the Copilot model and never written to the
    console log.
- **What is logged**: every such view writes one `access_log` row per subject user, holding the
  viewer, time, scope, command (with its arguments, minus any token), `reason_code` and `reason`.
  For multi-user views (`users`, `seats`, reports), one `access_batch` row holds the reason, and
  each subject row points at it, so the log stays small.
- **Seeing the log**: `hubhelper copilot db access-log [--viewer <login>] [--subject <login>]
  [--since <day>] [--format table|csv|json]`. `copilot user` also shows the subject's five most
  recent views (viewer, date, reason code), so access stays visible.
- **The reason travels with the output**: HTML, Markdown and JSON outputs that contain individual
  data carry a footer or field with the viewer, time and reason code, so a forwarded file shows
  why it was produced.
- **Tamper evidence**: each `access_log` row stores a SHA-256 hash chained to the previous row.
  `copilot db access-log --verify` reports any break. This cannot stop someone from deleting the
  local database, but it does show edits.
- `--anonymise` cannot be combined with `copilot user`. In org and team reports it hides logins
  as before.
- The docs page explains that these metrics show tool usage, not productivity or performance, and
  advises against using them for performance reviews.
- `purge-user` also deletes cached AI summaries about that user. Their `access_log` entries are
  kept with the login replaced by a hash, so the record of who looked at the data survives.

### Phase 3: Policy controls (`kind: github.copilot`)

9. Add `github.copilot` to `EvaluatorKindSchema` (`src/policy/types.ts`). Extend the engine context
   with an optional `copilot?: CopilotUsageModel`. Evaluators of this kind return
   `not-applicable` when it is absent, so `analyze` keeps working unchanged.
10. Add the controls to `policies/catalog.yaml` and implement them under
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
| HH-GH-018 | `copilot-duplicate-seat` | Enterprise only: one user holds Copilot seats in more than one member org | medium | NIST AC-2, SA-9 |
| HH-GH-019 | `copilot-org-policy-drift` | Enterprise only: a member org's Copilot settings differ from the `baseline` in the profile | medium | NIST CM-2, CM-6 |
| HH-GH-020 | `copilot-unallocated-spend` | Enterprise only: spend not assigned to any cost centre is above `max-unallocated-pct` | low | NIST SA-9 |

    In enterprise scope, findings from org-level controls (HH-GH-011 to HH-GH-017) carry the
    member org, so the reports can group and filter them by org.

11. Add a `policies/copilot.yaml` profile. `default.yaml` and `strict.yaml` include HH-GH-011,
   HH-GH-012 and HH-GH-015, because those apply to every org.

### Phase 4: AI insights with the Copilot SDK

12. **`insights-service.ts`** follows the `SecurityQueryService` patterns: a lazy `CopilotClient`,
    the shared `SESSION_IDLE_TIMEOUT_SECONDS`, rate limiting, timeouts and a deterministic fallback
    when the SDK is unavailable.
    - **Narrative** (`summarise(model)`): sends a compact, aggregated JSON summary, never raw
      per-user rows, and returns validated JSON:
      `{ headline, adoption, engagement, spend, risks[], recommendations[] }`.
    - **Q&A** (`ask(question)`): registers `defineTool` tools so the model pulls only what it
      needs, instead of receiving the whole dataset in the prompt:
      `get_adoption_trend(granularity, from, to)`, `get_breakdown(dimension, metric, filter)`,
      `get_team_summary(team)`, `get_user_profile(login, from, to)`,
      `compare_users(a, b, metric)`, `get_spend(groupBy, from, to)`,
      `list_findings(minSeverity)`, `compare_periods(metric, a, b)`, and in enterprise scope
      `get_org_league_table(metric)` and `get_cost_centre_spend(from, to)`.
    - Each tool calls a fixed, parameterised query in `queries.ts`. The model **never writes
      SQL**, which keeps prompt injection away from the database.
    - **Anomaly explanation**: z-score detection over daily series in the aggregator. The SDK then
      explains the top anomalies, for example "agent-mode usage up 3× on Tuesday".
    - **Privacy**: a `--anonymise` flag replaces logins with stable hashes in prompts and reports.
      Logins are never sent to the model unless the user asks about a named user.
    - **Individual summary** (`summariseUser(profile)`): a short narrative for one person: how
      their usage has changed, which features they have not tried yet that their peers use
      (for example "uses chat daily but has never used agent mode"), and practical next steps such
      as training or a client upgrade. It is written as enablement advice, not as an assessment of
      the person. Questions such as "how has @dev's usage changed since March?" go through
      `ask`, which uses `get_user_profile`.

### Phase 5: CLI (`src/index.ts`)

Every command takes exactly one of `--org <org>` or `--enterprise <slug>`. With `--enterprise`,
`--orgs a,b` narrows the view to some member orgs. `<scope>` below stands for either.

```
hubhelper copilot sync      <scope> [--from <day>] [--to <day>]      # backfill the SQLite store
hubhelper copilot usage     <scope> [--days 28]
                            [--by org|cost-centre|team|ide|language|model|client|feature]
                            [--team <slug>] [--user <login>] [--format console|json|csv|md|html]
hubhelper copilot seats     <scope> [--inactive-days 30] [--format ...]
hubhelper copilot spend     <scope> [--month YYYY-MM] [--by user|model|org|cost-centre]
                            [--budget <n>]
hubhelper copilot insights  <scope> [--days 90] [--anonymise] [--model <id>]
hubhelper copilot ask       "which teams adopted agent mode fastest?" <scope>
hubhelper copilot user      <login> <scope> [--days 90 | --from <day> --to <day>]
                            [--compare <login> | --compare-period <from>:<to>]
                            [--summarise] [--format console|json|csv|md|html]
                            --reason "<why>" [--reason-code <code>]
hubhelper copilot users     <scope> [--sort activity|acceptance|spend|last-active]
                            [--team <slug>] [--idle] [--limit 50]   # find people to drill into
                            --reason "<why>" [--reason-code <code>]
hubhelper copilot report    <scope> --output copilot.html [--profile policies/copilot.yaml]
hubhelper copilot sql       "SELECT … FROM v_daily_adoption" [--format table|csv|json]
hubhelper copilot db        status | vacuum | purge-user <login> | export <dir> | access-log
```

- `GITHUB_ENTERPRISE` joins `GITHUB_ORG` as an environment default, and `.env.example` is updated.

- Every command syncs any missing days first, unless `--offline` is passed.
- Inputs are validated with `input-validator.ts`, with new validators for day and month formats
  and the date range.
- `watch` gains an optional `--copilot` flag that runs the Copilot controls on every cycle.

### Phase 6: Reporting

13. **Console**: KPI header (seats, active, engaged, acceptance rate, MTD spend), Unicode sparklines
    for 28-day trends, top-N tables per breakdown, then findings.
14. **HTML dashboard**: self-contained file with inline JS and no CDN, consistent with the existing
    reporter. Sections:
    - Adoption funnel: seats, then active, then engaged, then power users.
    - Stacked feature-mix area chart over time.
    - Heatmaps: language × feature, and team × week.
    - Model and client share charts, and a spend vs budget burn-down.
    - Seat table with filters (idle, team, editor), PR impact panel, AI narrative and findings.
    - Enterprise view: an org league table, cost-centre chargeback, users with seats in several
      orgs, and per-org policy drift. The scope selector filters every chart.
    - **Individual page**: clicking a login anywhere in the dashboard opens that person's profile,
      as does running `copilot user --format html`. It shows a seat card, an activity heatmap
      (calendar style), feature mix over time, IDE, language, model and client breakdowns, spend
      by model, coding agent PRs, peer percentiles, findings and the AI summary. The console view
      has the same sections, using sparklines and tables.
    - Every value is escaped with `html-sanitizer.ts`, and the dashboard must meet WCAG AAA
      contrast, as the docs site does.
15. **JSON, CSV and Markdown**: the full `CopilotUsageModel` plus findings. CSV gives one table per
    breakdown, which is useful in BI tools.
16. **SARIF**: governance findings only, so they show up in Code Scanning.

### Phase 7: Tests, docs and quality gates

17. Fixtures in `src/__tests__/fixtures/copilot/` based on GitHub's published example schema, with
    edge cases: a suppressed day, a missing `totals_by_client`, an unknown field, a malformed
    NDJSON line, an expired signed URL (403), a user in several teams, an enterprise user with seats
    in two orgs, a member org the token cannot read, and spend with no cost centre.
18. Unit tests, keeping coverage above 75% per file:
    - The three fetchers in both scopes, with mocked Octokit and `fetch`, plus `probeAccess`.
    - The store, using an **in-memory** `:memory:` database:
      - migrations apply cleanly from an empty database and from each earlier version;
      - an ingest repeated for the same day is idempotent;
      - `missingDays`, retention and `purge-user` work;
      - each view returns expected rows for fixture data;
      - `copilot sql` rejects writes.
    - Aggregator KPIs and the team de-duplication rule.
    - Each evaluator, with compliant, violating and not-applicable cases.
    - Insights service with the mocked SDK, extending `src/__mocks__/@github/copilot-sdk.ts`, and
      its fallback path.
    - `user-profile.ts`: a user with no activity, a user in several orgs and teams, a peer group
      below five (comparison left out), suppressed days, a period comparison, and every profile
      view being written to `access_log`.
    - Reason enforcement:
      - every route in the table fails without a reason when not in a terminal, and prompts when
        in one;
      - reason validation (length, control characters, placeholders);
      - `ask` tools refuse when no reason is set;
      - `copilot sql` detects user-level tables, including through views and subqueries;
      - the hash chain verifies, and detects an edited row;
      - the reason never appears in prompts sent to the mocked SDK.
    - The reporters, including the individual page.
19. Docs: `website/content/docs/copilot-insights.md`, covering permissions, the five-licence
    threshold, the privacy flags and example output. Add it to `navigation` in
    `website/docmd.config.js`. The guide covers enterprise permissions and the SQLite schema and
    views, with example `copilot sql` queries. Also update the README feature list and the
    CHANGELOG, and regenerate the SBOM (the only change is the `engines` bump).
20. Run `npm run lint && npm run build && npm test`, and `npm run docs:validate && npm run
    docs:build`.

---

## Delivery Slices (one PR each)

1. `feat(copilot): add sqlite store with schema migrations` (Phase 2, steps 5–7, plus the
   `engines` bump)
2. `feat(copilot): add org and enterprise copilot metrics, seats and billing fetchers` (Phase 1)
3. `feat(copilot): add copilot sync, usage, seats, spend and sql commands` (aggregator and Phase 5)
4. `feat(copilot): add individual user profiles and copilot user command` (`user-profile.ts`,
   `copilot user`/`users`, mandatory logged reasons, `access_log`)
5. `feat(policy): add github.copilot governance controls HH-GH-011..020` (Phase 3)
6. `feat(copilot): add AI insights and natural-language queries via copilot sdk` (Phase 4)
7. `feat(reporters): add copilot html dashboard` (Phase 6) plus docs

## Open Questions

- **Decided**: enterprise scope is supported from the start, and storage is SQLite through
  `node:sqlite`.
- **Store sizing**: for 10k users × 400 days, `user_day_breakdown` is the largest table (an
  estimated tens of millions of rows). Check write speed and file size with synthetic data in
  slice 1. If needed, roll per-user breakdowns older than 90 days up into weekly rows.
- **Shared database**: is a single-user local file enough, or will teams want a shared database
  (Postgres, for example) later? The `CopilotStore` interface leaves room for that, but it is out
  of scope here.
- **Coding agent detection**: confirm the exact author or co-author signature of Copilot coding
  agent PRs, and whether a sessions or tasks API is available to the org's plan.
- **Retention and privacy**: per-user history is personal data. Decide the default retention, and
  whether `--anonymise` should be on by default for HTML reports that are shared.
- **Decided**: viewing individuals needs a logged reason (see "Safeguards for looking at
  individuals").
- **Shared audit trail**: the access log lives in the viewer's local database. Should it also be
  sent somewhere central (for example a webhook, a file in a repository, or the org audit log
  through a custom event) so that a reviewer other than the viewer can see it?
- **`copilot sql` detection**: checking SQL for user-level tables is a best-effort guard. The
  simpler alternative is to ask for a reason on every `copilot sql` run.
