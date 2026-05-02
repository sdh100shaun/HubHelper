# Realtime Watch Feature Plan

## Context

HubHelper's existing `watch` command polls GitHub every 60 minutes for policy violations. Users want a **realtime activity stream** — a live view of GitHub events as they happen, with policy violations flagged immediately. This is a new `stream` command (distinct from `watch`) that polls the GitHub Events API at short intervals (default 30s), maps events to existing domain types, evaluates them against the policy engine, and streams violations to the console in real-time.

True webhooks/server-sent events would require external infrastructure. The GitHub Events API (`/orgs/{org}/events`) supports ETag-based polling with a `X-Poll-Interval` response header that makes it the practical near-realtime solution with only `@octokit/rest` (already installed).

---

## Implementation Plan

### Step 1 — Add new types to `src/types/index.ts`

Add three new interfaces:
- **`GitHubEvent`** — raw shape from the Events API (`id`, `type`, `actor`, `repo`, `payload`, `created_at`). Include typed payload variants `GitHubPullRequestEventPayload` and `GitHubWorkflowRunEventPayload`.
- **`StreamConfig`** — config for the `stream` command (`organization`, `token`, `pollIntervalSeconds` default 30, `minSeverity`, `profilePath`, `showCompliant`, `verbose`).
- **`StreamEventResult`** — result of processing one event (`event: GitHubEvent`, `violations: SecurityIssue[]`, `timestamp: string`).

### Step 2 — Extract `isSecurityRelated` to `src/utils/security-utils.ts`

`GitHubFetcher` has a private `isSecurityRelated(title, body, labels, files)` method. Extract it to a named export in `src/utils/security-utils.ts` and update `github-fetcher.ts` to import it. Both the fetcher and the new event mapper need this logic.

### Step 3 — Create `src/services/github-events-fetcher.ts`

Polls `GET /orgs/{org}/events` using Octokit. Key behaviours:
- Stores `etag` between calls; sends `if-none-match` header; catches `status: 304` RequestError and returns `[]`.
- Reads `x-poll-interval` response header; exposes `getMinPollIntervalSeconds()` so the orchestrator respects GitHub's minimum.
- Maintains `seenEventIds: Set<string>` to filter duplicates.
- `seedSeenIds(events)` — pre-seeds IDs from an initial fetch so historical events are not alerted on startup.
- Type-guards the raw `unknown[]` response via `isGitHubEvent()` helper.

### Step 4 — Create `src/reporters/stream-reporter.ts`

Compact single-line format per event, with indented violation detail lines. No `ora` spinner (it clears lines and breaks scrolling output).

Output format:
```
[HH:MM:SS] PullRequestEvent  org/repo  PR #42 "Fix auth bypass"   OK
[HH:MM:SS] WorkflowRunEvent  org/repo  CI / push                  VIOLATION high: ...
```

Chalk colours: gray timestamps, cyan event types, red/yellow/blue violations by severity.
- `showCompliant: false` → silent on clean events.
- `minSeverity` filter applied before printing violations.
- PR titles truncated to 40 chars to stay within 100-char lines.

Methods: `printBanner()`, `printEvent(result)`, `printShutdown(stats)`, `printInlineError(msg)`.

### Step 5 — Create `src/services/realtime-orchestrator.ts`

Coordinates fetcher → mapper → policy engine → reporter.

**Key design decisions:**

1. **Accumulating history** — appends each mapped `PullRequest` / `WorkflowRun` to in-memory `prHistory` / `workflowRunHistory` (capped at 500 items oldest-first). Calls `policyEngine.evaluate(repoCache, prHistory, workflowRunHistory)` after each append so history-dependent controls (HH-GH-007 repeated-failure, HH-GH-009 security-pr-volume) work correctly.

2. **Result scoping** — filters `PolicyEngineResult.issues` down to only those matching the current event's `repository` (and PR number for PR events) before reporting, to avoid re-alerting on older violations every tick.

3. **Deduplication TTL** — uses a `recentlyReported: Map<fingerprint, timestamp>` with a 5-minute TTL (same SHA-256 fingerprint as `ChangeDetector`) to suppress re-emissions of the same violation on every subsequent event.

4. **Repository cache** — fetches `repoCache` at startup via existing `GitHubFetcher.getRepositories()`; refreshes it every 15 minutes in the background (non-blocking `setTimeout`). Needed for controls that evaluate `Repository` objects (HH-GH-004, -005, -006).

5. **Poll loop** — `while (!isShuttingDown) { await tick(); await sleep(max(0, minInterval*1000 - tickDuration)); }`.

6. **Event mapping** (private `mapEvent()`):
   - `PullRequestEvent` with `action: 'closed'` + `merged: true` → `PullRequest` (with `files_changed: []`, `is_security_related` from `isSecurityRelated()` utility)
   - `WorkflowRunEvent` with `action: 'completed'` → `WorkflowRun`
   - All others → `null` (silently skip or show in `showCompliant` mode)

7. **Signal handling** — SIGINT/SIGTERM call `stop()`, same pattern as `WatchOrchestrator`.

### Step 6 — Add `stream` command to `src/index.ts`

After the `watch` command block. Options:
- `-o, --org` — organization name
- `-t, --token` — GitHub token
- `-i, --interval <seconds>` — poll interval (10–300, default 30)
- `--min-severity` — low|medium|high|critical (default medium)
- `--profile <file>` — policy profile YAML (default `policies/default.yaml`)
- `--show-compliant` — also print clean events
- `-v, --verbose`

Validate token/org/severity same as `watch`. Validate interval as integer 10–300. Build `StreamConfig`, call `new RealtimeOrchestrator(config).start()`.

### Step 7 — Tests

- `src/__tests__/github-events-fetcher.test.ts` — mock `@octokit/rest`; test 200 response, 304 no-op, ETag storage, poll-interval header, seen-ID filtering, seedSeenIds, malformed payload guard.
- `src/__tests__/realtime-orchestrator.test.ts` — mock fetcher/engine/reporter; test tick flow, history accumulation, cap eviction, deduplication TTL, repo cache refresh, stop/signal handling.
- `src/__tests__/stream-reporter.test.ts` — mock chalk; test banner, OK lines, violation lines, minSeverity filter, showCompliant toggle, title truncation, shutdown stats.

---

## Critical Files

| Action | File |
|--------|------|
| Modify | `src/types/index.ts` |
| Create | `src/utils/security-utils.ts` |
| Modify | `src/services/github-fetcher.ts` (import security-utils, remove private method) |
| Create | `src/services/github-events-fetcher.ts` |
| Create | `src/reporters/stream-reporter.ts` |
| Create | `src/services/realtime-orchestrator.ts` |
| Modify | `src/index.ts` (add `stream` command) |
| Create | `src/__tests__/github-events-fetcher.test.ts` |
| Create | `src/__tests__/realtime-orchestrator.test.ts` |
| Create | `src/__tests__/stream-reporter.test.ts` |

---

## Verification

```bash
# 1. Full quality gate
npm run lint && npm run build && npm test

# 2. Manual smoke test (requires GITHUB_TOKEN + GITHUB_ORG env vars)
npm run dev stream --org $GITHUB_ORG --token $GITHUB_TOKEN --interval 30 --show-compliant

# 3. Verify it exits cleanly on Ctrl-C (SIGINT)
# 4. Verify violations appear highlighted in color
# 5. Verify --min-severity high suppresses medium violations
```
