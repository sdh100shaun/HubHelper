---
title: Copilot Insights
description: A deep view of GitHub Copilot usage for an organisation or a whole enterprise, with local history, governance controls, individual profiles and AI summaries.
---

# Copilot Insights

`hubhelper copilot` shows how GitHub Copilot is used across an organisation or an entire enterprise: who has a seat, who uses it, which features, IDEs, languages, models and clients they use, what it costs, and what the Copilot coding agent is merging. It keeps a local history in SQLite so trends outlast GitHub's own retention window, runs ten Copilot governance controls, and uses the Copilot SDK for summaries and plain-English questions.

::: callout info "Usage is not productivity"
These figures describe how people use a tool. They are not a measure of productivity or performance, and they should not be used in performance reviews.
:::

---

## Quick start

```bash
# 1. Fetch 90 days of data for an organisation (or use --enterprise <slug>)
hubhelper copilot sync --org myorg --days 90

# 2. See adoption and how Copilot is used
hubhelper copilot usage --org myorg
hubhelper copilot usage --org myorg --by language

# 3. Build a shareable dashboard without any names in it
hubhelper copilot report --org myorg --anonymise --output copilot.html
```

Every command fetches any missing days before it runs. Add `--offline` to use stored data only.

---

## Organisations and enterprises

Every command takes exactly one of:

| Option | Meaning |
|--------|---------|
| `--org <org>` | One organisation |
| `--enterprise <slug>` | A whole enterprise |
| `--enterprise <slug> --orgs a,b` | An enterprise, narrowed to some member organisations |

`GITHUB_ORG` and `GITHUB_ENTERPRISE` work as defaults.

For enterprises, HubHelper uses the enterprise's own reports for enterprise-wide figures. It never adds up organisation reports, because that would count people with seats in several organisations more than once and would miss organisations with fewer than five licensed users. Settings that only exist per organisation (such as suggestions matching public code) and coding agent pull requests are fetched organisation by organisation; any organisation the token cannot read is listed as "not assessed".

---

## Commands

| Command | What it shows | Names people? |
|---------|---------------|---------------|
| `copilot sync` | Fetches reports, seats, settings, spend, cost centres and coding agent PRs | — |
| `copilot usage` | Seats, active and engaged users, acceptance rate, cohorts and a breakdown (`--by feature\|ide\|language\|model\|client\|day\|team\|org\|cost-centre`) | No |
| `copilot seats` | Seat assignments and idle seats (`--idle`, `--inactive-days`) | Yes, or use `--anonymise` |
| `copilot spend` | AI credit or premium request spend, month to date and forecast (`--budget`) | Only with `--by user` |
| `copilot user <login>` | One person's profile (`--compare <login>`, `--compare-period <from>:<to>`, `--summarise`) | Yes |
| `copilot users` | Sortable list of people (`--sort activity\|acceptance\|spend\|last-active`) | Yes |
| `copilot report` | Full dashboard with findings (`--format html\|json\|md`, `--users a,b`, `--all-profiles`) | Yes, or use `--anonymise` |
| `copilot insights` | AI-written summary of adoption, engagement, spend and risks | No |
| `copilot ask "<question>"` | Plain-English questions, answered with the Copilot SDK | Only with `--reason` |
| `copilot sql "<SELECT …>"` | Read-only SQL over the local database | When it reads per-user tables |
| `copilot db …` | `status`, `vacuum`, `purge-user`, `export`, `access-log` | `export` does |

Most commands accept `--days`, `--from`, `--to`, `--format console|json|csv|md|html` and `--output <file>`.

---

## Looking at an individual's usage

`copilot user` builds a profile for one person:

- **Seat**: the organisations they hold seats in, who assigned them, plan, cost centre and seat history.
- **Activity**: a calendar heatmap, active days per week, streaks, and first and last activity.
- **How they use Copilot**: features over time and the date each was first used, acceptance rate, IDEs, languages, models and clients.
- **Features to try**: features at least half of their peers use that they have not tried yet.
- **Spend**: AI credits used and their share of the team or scope total.
- **Coding agent**: pull requests they started or reviewed, and whether merged ones had a human approval.
- **Compared with peers**: percentile ranks within their teams, organisation and enterprise. Groups of fewer than five people are left out.

```bash
hubhelper copilot user octocat --org myorg \
  --reason "Follow-up after agent mode training" --reason-code enablement --summarise
```

`--summarise` adds a short AI-written summary framed as enablement advice.

### A logged reason is required

Any output that names individuals needs a reason. This cannot be switched off.

- Pass `--reason "<why>"`, and optionally `--reason-code` (`enablement`, `licence-review`, `cost-review`, `security-investigation`, `data-subject-request` or `other`).
- Without `--reason`, a terminal session asks for one; scripts and CI runs stop with an error.
- Reasons must be 10–500 characters, and placeholders such as "test" or "n/a" are rejected.
- The reason is never sent to the AI model.

Every view is written to an access log before anything is shown: who viewed, when, the command (with any token removed), the reason code and reason, and whose data was shown. Output that contains individual data carries the viewer, time and reason code, so a forwarded file still shows why it was produced.

```bash
hubhelper copilot db access-log --subject octocat
hubhelper copilot db access-log --verify
```

Entries are chained with SHA-256 hashes; `--verify` reports any entry that has been edited or removed. This cannot stop someone deleting the whole database file, but it does make edits detectable.

::: callout warning "The access log is local"
The access log lives in the viewer's own database. If someone other than the viewer needs to review it, export it (`--format csv` or `json`) and store it centrally.
:::

### Data-subject requests

```bash
hubhelper copilot db purge-user octocat --yes
```

This deletes the person's stored metrics, seats, spend rows and AI summaries, and removes them from stored raw reports. Access-log entries are kept with the login replaced by a hash, so the record of who viewed their data survives.

---

## Governance controls

`copilot report` and `copilot insights` evaluate `policies/copilot.yaml`. The default and strict profiles also include HH-GH-011, HH-GH-012 and HH-GH-015; other commands skip these controls because they have no Copilot data.

| ID | Checks | Default severity | Key parameters |
|----|--------|------------------|----------------|
| HH-GH-011 | Idle seats | low | `inactive_days` (30) |
| HH-GH-012 | Suggestions matching public code allowed | high | `required_setting` (`block`) |
| HH-GH-013 | Models outside the approved list | medium | `allowed_models` (empty = off) |
| HH-GH-014 | IDEs or clients outside the approved list | medium | `allowed_clients` (empty = off) |
| HH-GH-015 | Coding agent PRs merged without a human approval | high | — |
| HH-GH-016 | Spend forecast over budget, or a person over the cap | medium | `monthly_budget`, `per_user_cap` (0 = off) |
| HH-GH-017 | Too many seats assigned directly rather than through teams | low | `max_direct_pct` (50) |
| HH-GH-018 | People with seats in several organisations (enterprise) | medium | — |
| HH-GH-019 | Organisation settings that differ from the baseline (enterprise) | medium | `baseline` (`setting=value` list) |
| HH-GH-020 | Usage not assigned to a cost centre (enterprise) | low | `max_unallocated_pct` (10) |

An approved model also approves its variants: `gpt-5` allows `gpt-5-mini`.

---

## AI summaries and questions

`copilot insights` sends only aggregated figures to the Copilot SDK — never per-user rows or logins — and asks for a summary, risks and recommendations. `copilot ask` gives the model a set of tools (KPIs, trends, breakdowns, teams, organisations, spend, anomalies, data quality) so it looks up figures instead of guessing. The model never writes SQL.

Questions about named people only work when you pass `--reason`; without it, per-user lists are shown with pseudonyms and profile tools refuse. Each profile the model looks up is written to the access log.

When the Copilot SDK is unavailable, both commands fall back to a deterministic summary.

---

## Data quality

- GitHub only produces a day's report when five or more people held a licence that day. HubHelper records those days as **suppressed** and shows them as gaps, never as zero usage.
- Days that GitHub flags for telemetry gaps or outdated clients are marked, so low numbers are not mistaken for low adoption.
- Reports arrive as short-lived signed links. HubHelper downloads them immediately and never stores or prints the links.
- Report fields change regularly. Every `totals_by_*` breakdown is stored generically, and the raw rows are kept, so new fields can be used later without fetching again.

---

## Permissions

| Data | Organisation | Enterprise |
|------|--------------|------------|
| Usage reports | Organisation owner, or fine-grained "Organization Copilot metrics: read" (classic: `read:org`) | Enterprise owner or billing manager, or "View Enterprise Copilot Metrics" |
| Seats and settings | "Copilot business: read" (classic: `manage_billing:copilot`) | Same, per member organisation |
| Spend | "Administration: read" on the organisation | Enterprise billing access |
| Coding agent PRs | Read access to the repositories | Same, per member organisation |

GitHub App installations work through the usual `GITHUB_APP_*` variables. When the token cannot reach part of the data, `sync` records a warning and carries on with the rest.

---

## The database

Data lives in `~/.hubhelper/copilot.db` (override with `--db` or `HUBHELPER_COPILOT_DB`). The file is created with owner-only permissions. Per-user rows are kept for 400 days by default (`copilot sync --retention-days`); scope-wide figures are kept indefinitely.

Useful views for your own analysis:

| View | Contents |
|------|----------|
| `v_daily_adoption` | Active and engaged users, interactions and credits per day |
| `v_weekly_active` | Distinct active users per week |
| `v_feature_mix` | Activity per feature per day |
| `v_cost_per_active_user` | AI credits per active user per day |
| `v_org_rollup` | Per-organisation daily figures |
| `v_team_day` | Per-team daily figures (people in several teams count once per team) |
| `v_idle_seats` | Seats and days since last activity |

```bash
hubhelper copilot sql "SELECT day, active_users FROM v_daily_adoption ORDER BY day DESC LIMIT 7"
```

`copilot sql` opens the database read-only and accepts a single `SELECT` statement. Queries that read per-user tables or views need `--reason` and are logged.

---

## Troubleshooting

**"No Copilot data stored for this scope"** — run `copilot sync` for the same `--org` or `--enterprise` first, or drop `--offline`.

**Every day is suppressed** — the organisation had fewer than five licensed users on those days, so GitHub produces no report.

**"… not synced: the token lacks permission"** — see [Permissions](#permissions). The rest of the data is still synced.

**"Profile file not found"** — `copilot report` looks for `policies/copilot.yaml` in the current directory; pass `--profile <file>` to use another.
