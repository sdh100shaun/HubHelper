# RFC 0001: `hubhelper search-code` CLI command

| Field    | Value |
|----------|-------|
| Number   | 0001 |
| Title    | `hubhelper search-code` CLI command |
| Status   | Deferred |
| Tracking | [#27](https://github.com/sdh100shaun/HubHelper/issues/27) |
| Authors  | sdh100shaun |
| Created  | 2026-05-02 |

## Summary

Add a one-shot CLI command — `hubhelper search-code <pattern>` — that composes the existing `GitHubFetcher.searchCode` and `CopilotService.explainCode` primitives into structured, scriptable output (JSON or pretty-printed console). The command returns code-search matches across all org repositories with a per-result AI-generated `explanation` field, suitable for downstream automation that can't easily consume the prose output of an interactive Copilot session.

## Motivation

Two primitives currently exist with no non-AI consumer:

- `GitHubFetcher.searchCode(query, maxResults?)` — `src/services/github-fetcher.ts`
- `CopilotService.explainCode(result)` — `src/services/copilot-service.ts`

The interactive `hubhelper query` command covers code search by routing through the GitHub MCP server's `search_code` tool, but it returns AI prose — not structured records. Downstream consumers (CI gates, review bots, compliance pipelines) need machine-readable output with explanations baked in.

### Gap analysis

| Existing path | Gap |
|---|---|
| `gh search code "<pattern> org:<org>"` | No AI explanation — just file paths and snippets. |
| `hubhelper query --interactive` | Returns prose, not structured records; requires a live AI session per query. |
| Programmatic use of `searchCode` + `explainCode` primitives | Possible today, but every consumer has to write the orchestration glue (~8 lines including session disposal). |

## Use cases

1. **CI security gate** — fail builds when risky patterns (`eval(`, hard-coded secrets, deprecated crypto APIs) appear anywhere in the org, with AI rationale embedded in the failure log so the on-call engineer sees *why* it matters.
2. **Code-review automation** — bots post per-match explanations on PRs touching sensitive areas without spinning up an interactive Copilot session for each review.
3. **Compliance evidence** — auditors get structured, AI-explained findings of policy-relevant code patterns (encryption usage, PII handling) exportable to JSON for evidence packs.
4. **Deprecation / migration tracking** — find every call site of a deprecated API across all repos with a one-line explanation of each usage, prioritising migration work by risk and complexity.
5. **Documentation generation** — periodic scans for "interesting" patterns (custom auth flows, feature-flag check sites) emit human-readable inventories that stay in sync with the code.
6. **Ad-hoc developer scripting** — `hubhelper search-code "TODO security" --output json | jq '.[] | select(.repository | contains("payments"))'` for quick triage without entering an interactive session.

## Detailed design

### Command shape

```
hubhelper search-code <pattern>
  -o, --org <organization>   GitHub organisation (default: $GITHUB_ORG)
  -t, --token <token>        GitHub PAT (default: $GITHUB_TOKEN)
  -n, --max <number>         Max results, capped at 30 (default: 10)
      --no-explain           Skip AI explanation step (faster, no Copilot needed)
      --output <fmt>         console | json (default: console)
```

### Output

- **JSON mode** — array of `CodeSearchResult` (see `src/types/index.ts`). Each entry has `repository`, `path`, `url`, `sha`, `snippet`, and — unless `--no-explain` was set — `explanation`.
- **Console mode** — grouped per-repo printout: file path + URL, truncated snippet, explanation paragraph below.

### Files to add

| File | Change |
|---|---|
| `src/index.ts` | Register new `search-code` command (~50 LoC handler) |
| `src/__tests__/index-search-code.test.ts` *(new)* | Mock `GitHubFetcher` and `CopilotService`, verify orchestration + output formatting (~30 LoC) |

### Reused components

- `GitHubFetcher.searchCode(pattern, max)` — `src/services/github-fetcher.ts`
- `CopilotService.explainCode(result)` — `src/services/copilot-service.ts` (always pair with `dispose()` in `finally`)
- `validateGitHubToken`, `validateOrganizationName` — `src/utils/input-validator.ts`
- `ConsoleReporter` — `src/reporters/console-reporter.ts` for pretty output
- Pattern of action handler — see existing `query` command in `src/index.ts:430`

### Implementation sketch

```typescript
program
  .command('search-code <pattern>')
  .description('Search for a code pattern across all org repositories with AI explanations')
  .option('-o, --org <organization>', 'GitHub organization name')
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-n, --max <number>', 'Max results (default 10, cap 30)', '10')
  .option('--no-explain', 'Skip AI explanation step')
  .option('--output <fmt>', 'Output format: console|json', 'console')
  .action(async (pattern, options) => {
    // 1. Validate token + org via existing input-validator helpers
    // 2. const fetcher = new GitHubFetcher(token, org);
    // 3. const results = await fetcher.searchCode(pattern, Number(options.max));
    // 4. if (options.explain) {
    //      const copilot = new CopilotService();
    //      try {
    //        for (const r of results) r.explanation = await copilot.explainCode(r);
    //      } finally { await copilot.dispose(); }
    //    }
    // 5. Output: --output json → console.log(JSON.stringify(results, null, 2))
    //            else → ConsoleReporter pretty print
  });
```

### Test plan

In `src/__tests__/index-search-code.test.ts`:

- Mock `GitHubFetcher.searchCode` to return a fixture array
- Mock `CopilotService.explainCode` to return a fixture string
- Assert: enriched results contain `explanation` for each entry
- Assert: `--no-explain` skips Copilot entirely (no `explainCode` calls, no session spun up, no `dispose`)
- Assert: `CopilotService.dispose()` is called even when `explainCode` throws
- Assert: `--output json` emits parseable JSON
- Assert: `--max 999` is capped at 30 (matches primitive's behaviour)

## Drawbacks

- Another command to test, document, and version.
- Overlaps significantly with `gh search code` — only the per-result AI explanation differentiates it.
- Requires the Copilot SDK to be available unless `--no-explain` is used.

## Alternatives considered

1. **Do nothing** — leave the primitives in place and let internal consumers compose them with ~8 lines of glue. This is the current state.
2. **Thin helper function** — export a `searchAndExplainCode(fetcher, query)` helper from `copilot-service.ts` to spare callers the orchestration. Smaller surface than a CLI command but doesn't address scriptability.
3. **Reporter integration** — surface code-search-with-explanation as a section in existing `analyze` reports rather than a standalone command. Couples it to the analysis pipeline; less flexible.

## Unresolved questions

- Should `--no-explain` be the default to avoid surprising users who don't have Copilot configured?
- Should rate limiting be applied across the per-result `explainCode` calls, or rely on the SDK's own throttling?
- Should output include a summary line (count, repos covered) before the per-result entries in console mode?

## Verification (when built)

```bash
npm run lint && npm run build && npm test

# Smoke tests (real token required)
GITHUB_TOKEN=<token> npm run dev -- search-code "eval(" --org <org> --max 5 --output json | jq
GITHUB_TOKEN=<token> npm run dev -- search-code "eval(" --org <org> --no-explain
GITHUB_TOKEN=<token> npm run dev -- search-code "process.env.SECRET" --org <org>
```

Expected:
- **JSON mode** — array of objects with `repository`, `path`, `url`, `sha`, `snippet`, `explanation`.
- **Console mode** — grouped per-repo output with explanations underneath each match.
- **`--no-explain`** — same shape minus `explanation`, no Copilot session opened.

## Estimated effort

~80 LoC total (≈50 for the command handler, ≈30 for tests). Roughly half a day including manual smoke testing.
