# `hubhelper search-code` CLI — Deferred Design

**Status:** Deferred — tracked in issue [#27](https://github.com/sdh100shaun/HubHelper/issues/27).
**Build trigger:** Pick up when one of the use cases below has a concrete consumer (CI gate, review bot, compliance pipeline, etc.).

---

## Context

After the `code-search-explanation-hpqka` work landed, two primitives were left in place but currently have no non-AI consumer:

- `GitHubFetcher.searchCode(query, maxResults?)` — `src/services/github-fetcher.ts`
- `CopilotService.explainCode(result)` — `src/services/copilot-service.ts`

The interactive `hubhelper query` command covers code search by routing through the GitHub MCP server's `search_code` tool, but it returns AI prose — not structured records. A dedicated CLI command that composes the two primitives would expose the capability to scripts and CI pipelines.

Building speculatively was rejected: the unique slice (scriptable structured JSON of code-search results with AI explanations) is real but niche, and the primitives compose in ~8 lines if a caller really needs them. This plan exists so the design isn't lost when a consumer eventually appears.

---

## Proposed Command

```
hubhelper search-code <pattern>
  -o, --org <organization>   GitHub organisation (default: $GITHUB_ORG)
  -t, --token <token>        GitHub PAT (default: $GITHUB_TOKEN)
  -n, --max <number>         Max results, capped at 30 (default: 10)
      --no-explain           Skip AI explanation step (faster, no Copilot needed)
      --output <fmt>         console | json (default: console)
```

### Output

- **JSON mode** — array of `CodeSearchResult` (see `src/types/index.ts`). Each entry has `repository`, `path`, `url`, `sha`, `snippet`, and (unless `--no-explain`) `explanation`.
- **Console mode** — grouped per-repo printout: file path + URL, truncated snippet, explanation paragraph below.

---

## Use Cases

1. **CI security gate** — fail builds when risky patterns (`eval(`, hard-coded secrets, deprecated crypto APIs) appear anywhere in the org, with AI rationale in the failure log.
2. **Code-review automation** — bots post per-match explanations on PRs without spinning up a full Copilot session per query.
3. **Compliance evidence** — auditors get structured, AI-explained findings exportable to JSON for evidence packs.
4. **Deprecation / migration tracking** — find every call site of a deprecated API with a one-line explanation, so migration work can be prioritised by risk.
5. **Documentation generation** — periodic scans for "interesting" patterns (custom auth flows, feature-flag check sites) emit human-readable inventories.
6. **Ad-hoc developer scripting** — `hubhelper search-code "TODO security" --output json | jq` for quick triage without entering an interactive session.

---

## Files to Modify

| File | Change |
|---|---|
| `src/index.ts` | Register new `search-code` command (~50 LoC handler) |
| `src/__tests__/index-search-code.test.ts` *(new)* | Mock `GitHubFetcher` and `CopilotService`, verify orchestration + output formatting (~30 LoC) |

### Reused Components

- `GitHubFetcher.searchCode(pattern, max)` — `src/services/github-fetcher.ts`
- `CopilotService.explainCode(result)` — `src/services/copilot-service.ts` (always pair with `dispose()` in `finally`)
- `validateGitHubToken`, `validateOrganizationName` — `src/utils/input-validator.ts`
- `ConsoleReporter` — `src/reporters/console-reporter.ts` for pretty output
- Pattern of action handler — see existing `query` command in `src/index.ts:430`

---

## Implementation Sketch (`src/index.ts`)

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

---

## Test Plan

In `src/__tests__/index-search-code.test.ts`:

- Mock `GitHubFetcher.searchCode` to return a fixture array
- Mock `CopilotService.explainCode` to return a fixture string
- Assert: enriched results contain `explanation` for each entry
- Assert: `--no-explain` skips Copilot entirely (no `explainCode` calls, no session spun up, no `dispose`)
- Assert: `CopilotService.dispose()` is called even when `explainCode` throws
- Assert: `--output json` emits parseable JSON
- Assert: `--max 999` is capped at 30 (matches primitive's behaviour)

---

## Verification

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
