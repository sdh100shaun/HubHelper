# Plan: Run HubHelper as a GitHub Action

Status: **Superseded** by [`AGENTIC_WORKFLOW_PLAN.md`](./AGENTIC_WORKFLOW_PLAN.md) (decided 2026-11-26)

> The composite `action.yml` described here won't be built: HubHelper will run through GitHub Agentic
> Workflows only. The "Current state" findings and the CLI changes (bundled policies, SARIF fixes, CI-friendly
> output) still apply, and the agentic plan refers to them. `--fail-on` and the Actions reporter are no
> longer planned.

## Goal

Let any organisation run HubHelper's policy-driven analysis from a workflow with a few lines of YAML:

```yaml
- uses: sdh100shaun/HubHelper@v1
  with:
    token: ${{ steps.app-token.outputs.token }}
    org: <org>
    days: 7
    profile: strict
    fail-on: high
```

The result should be: reports as workflow artifacts, findings in GitHub Code Scanning (SARIF), a Markdown
job summary, step outputs for later steps, and a non-zero exit when findings breach a threshold.

## Current state (findings from the codebase)

| # | Finding | Impact on an Action |
|---|---------|---------------------|
| 1 | `package.json` `files` ships only `dist`, `README.md` and `LICENSE`, not `policies/` | An installed package has **no catalog or profiles**, so `analyze` fails unless the caller checks out a copy of `policies/` |
| 2 | The default profile is `policies/default.yaml`, resolved against the **current working directory** (`src/index.ts:170`) | Works only when run from this repository's root |
| 3 | No exit code reflects findings: the CLI exits `1` only on errors | A workflow can't gate on severity without parsing JSON |
| 4 | `.github/workflows/scheduled-security-scan.yml` installs `@sdh100shaun/gh-security-tools`, runs `gh-security`, and reads legacy JSON fields (`summary.totalSelfMerges`) | The example workflow is broken: wrong package, wrong binary, wrong schema |
| 5 | SARIF results for repository-level issues carry only `logicalLocations` (`sarif-reporter.ts:237`) | Code Scanning requires a physical location, so these results are rejected or dropped on upload |
| 6 | AI insights are **on by default** (`--no-ai` to disable) and need the Copilot CLI/SDK | A runner without Copilot gets noise or failures unless AI is switched off |
| 7 | Auth already supports a PAT (`GITHUB_TOKEN`) or a GitHub App (`GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY[_PATH]`) via `resolveAuthFromEnv()` | Good: the Action can pass these straight through |
| 8 | Output paths are restricted to the working directory by `validateFilePath` | Fine on runners (`$GITHUB_WORKSPACE`), but outputs must be relative paths |
| 9 | `package.json` `repository`/`bugs`/`homepage` point at `sdh100shaun/gh-tools` | Wrong links in npm and provenance metadata |
| 10 | `check-repo` is a stub ("coming soon") | Out of scope; don't expose it from the Action yet |
| 11 | The Octokit client has no `baseUrl` override | GitHub Enterprise Server isn't supported (optional, phase 3) |

## Design decisions

### Action type: composite action (recommended)

| Option | Pros | Cons |
|--------|------|------|
| **Composite** (`runs.using: composite`) that sets up Node 24 and installs the published npm package at a pinned version | Reuses the npm release; no bundling; easy to read | Needs `npm install` on each run (~10–20 s, cacheable) |
| JavaScript action (`node24`) with an `ncc`/esbuild bundle committed to the release tag | Fastest start-up | Bundling ESM, decorators and `@github/copilot-sdk` is fragile; `dist/` has to be committed on tags |
| Docker action | Fully isolated | Linux runners only; slow image build or a registry to maintain |

The composite action pins the npm version that matches its own tag (for example `action.yml` on `v1.1.0` installs
`@sdh100shaun/hubhelper@1.1.0`). The release workflow updates the pin. A `version` input allows an override.

### Where `action.yml` lives

- **Phase 1:** `action.yml` at the root of this repository, so `uses: sdh100shaun/HubHelper@v1` works straight away.
- **Marketplace (optional):** GitHub Marketplace listing has extra requirements (one action per repository, metadata
  at the root, and restrictions on the repository's own workflow files). Check the current rules at release time.
  If they conflict with this repository's CI, publish a thin `sdh100shaun/hubhelper-action` repository that holds
  only `action.yml` and the README.

### Authentication

The default `${{ github.token }}` can only see the repository the workflow runs in, which is not enough for
organisation-wide analysis. Document three modes, recommended first:

1. **GitHub App (recommended).** Use `actions/create-github-app-token` before HubHelper and pass `token:`, or pass
   `app-id`, `app-installation-id` and `app-private-key` inputs, which the Action maps to the existing `GITHUB_APP_*`
   environment variables. Permissions are those in `website/content/docs/github-app.md` (read-only metadata,
   contents, pull requests, actions, plus organisation members if needed).
2. **Fine-grained PAT** stored as a secret, read-only.
3. **`github.token`:** single-repository and public data only. Warn in the docs and log a notice when it's in use.

Secrets are passed through `env:` only, never on the command line, so they don't show up in process listings or logs.

## Action interface (`action.yml`)

### Inputs

| Input | Default | Maps to |
|-------|---------|---------|
| `org` | `${{ github.repository_owner }}` | `--org` / `GITHUB_ORG` |
| `token` | *(none)* | `GITHUB_TOKEN` env |
| `app-id`, `app-installation-id`, `app-private-key` | *(none)* | `GITHUB_APP_*` env |
| `days` | `7` | `--days` |
| `profile` | `default` | `--profile`; accepts `default`, `strict` (bundled) or a path in the workspace |
| `fail-on` | `none` | new `--fail-on <critical\|high\|medium\|low\|none>` |
| `output-dir` | `hubhelper-reports` | base directory for the report files |
| `formats` | `json,sarif,markdown` | which of `json`, `html`, `sarif`, `compliance`, `markdown` to write |
| `upload-sarif` | `true` | runs `github/codeql-action/upload-sarif` |
| `sarif-category` | `hubhelper` | SARIF `category`, so runs don't overwrite other tools' results |
| `upload-artifact` | `true` | runs `actions/upload-artifact` |
| `job-summary` | `true` | writes Markdown to `$GITHUB_STEP_SUMMARY` |
| `ai` | `false` | `--no-ai` unless `true`; `ai-summary`/`ai-model` are passed through when set |
| `version` | pinned to the release | npm package version to install |

### Outputs

| Output | Description |
|--------|-------------|
| `total-findings` | Count of failed controls/issues |
| `critical`, `high`, `medium`, `low` | Counts by severity |
| `breached` | `true` if `fail-on` was exceeded |
| `json-report`, `sarif-report`, `html-report`, `summary-report` | Paths to the written files |

### Composite steps (sketch)

```yaml
runs:
  using: composite
  steps:
    - uses: actions/setup-node@<sha> # pinned by SHA
      with: { node-version: '24' }
    - shell: bash
      run: npm install --global --no-audit --no-fund "@sdh100shaun/hubhelper@${{ inputs.version }}"
    - id: run
      shell: bash
      env:
        GITHUB_TOKEN: ${{ inputs.token }}
        GITHUB_APP_ID: ${{ inputs.app-id }}
        GITHUB_APP_INSTALLATION_ID: ${{ inputs.app-installation-id }}
        GITHUB_APP_PRIVATE_KEY: ${{ inputs.app-private-key }}
        GITHUB_ORG: ${{ inputs.org }}
        INPUT_DAYS: ${{ inputs.days }}
        # ...all inputs go through env, never interpolated into the script (prevents script injection)
      run: '"$GITHUB_ACTION_PATH/scripts/run-action.sh"'
    - if: inputs.upload-sarif == 'true' && steps.run.outputs.sarif-report != ''
      uses: github/codeql-action/upload-sarif@<sha>
      with:
        sarif_file: ${{ steps.run.outputs.sarif-report }}
        category: ${{ inputs.sarif-category }}
    - if: always() && inputs.upload-artifact == 'true'
      uses: actions/upload-artifact@<sha>
      with:
        name: hubhelper-${{ github.run_id }}
        path: ${{ inputs.output-dir }}
    - if: steps.run.outputs.breached == 'true'
      shell: bash
      run: exit 2
```

Failing on the threshold happens in the **last** step, so SARIF and artifacts are uploaded even when the gate fails.
`scripts/run-action.sh` builds the `hubhelper analyze` argument list from `INPUT_*` variables, using bash arrays
with no `eval`.

## CLI changes needed (in `src/`)

1. **Bundle policies with the package.** Add `policies` to `files` in `package.json`. Add
   `src/policy/profile-resolver.ts`: `resolveProfilePath(input)` takes `default` or `strict` (or no value) and returns
   the bundled file found via `import.meta.url`. Any other value is treated as a path and checked with
   `validateFilePath`. If `./policies/default.yaml` exists in the working directory, keep using it when no
   profile is given (backwards compatible). Use it in `analyze` and `stream`.
2. **`--fail-on <severity>`.** After evaluation, count findings at or above the threshold and exit with code **2**
   if any exist. Exit code `1` stays for errors, so workflows can tell "findings" apart from "broken".
3. **Actions integration (`src/reporters/actions-reporter.ts`).** Turned on by `--github-actions` or automatically
   when `GITHUB_ACTIONS=true`:
   - writes `key=value` outputs to `$GITHUB_OUTPUT` (counts, breached, report paths), using the heredoc delimiter
     format with a random delimiter;
   - appends the Markdown compliance report (reusing `ComplianceReporter` `markdown`) to `$GITHUB_STEP_SUMMARY`;
   - emits `::error`/`::warning`/`::notice` annotations per finding, capped (for example 50) to avoid log spam, with
     values escaped (`%`, `\r`, `\n`, `:` and `,` in properties);
   - masks nothing secret itself, but never prints tokens. Add a test that asserts this.
4. **SARIF fixes.** For results with no file, add a fallback `physicalLocation` (the profile file path relative to
   the repository, or `.github/hubhelper` as a placeholder URI) and keep the repository in `logicalLocations` and
   `properties.repository`. Add stable `partialFingerprints` (control ID, repository, subject such as the PR
   number) so Code Scanning de-duplicates alerts between runs.
5. **CI-friendly output.** Turn off ora spinners and chalk colour when `CI=true` or there's no TTY (check what ora
   already does), so logs stay readable.
6. **Exit cleanly on missing AI.** When `--ai-*` is requested but Copilot isn't available, log a warning and carry on.
7. *(Phase 3)* **GHES:** read `GITHUB_API_URL` and pass it to Octokit as `baseUrl`.

Each change needs unit tests in `src/__tests__/` (coverage above 75% per file), covering success and failure paths:
profile resolution (bundled, workspace path, traversal rejected), exit codes per threshold, the `GITHUB_OUTPUT`
and summary format, annotation escaping, and SARIF location and fingerprint shape.

## Repository changes

| File | Change |
|------|--------|
| `action.yml` | New composite action (above), with `branding` (icon `shield`, colour `blue`) |
| `scripts/run-action.sh` | New input-to-arguments wrapper |
| `package.json` | Add `policies` to `files`; fix `repository`/`bugs`/`homepage` URLs |
| `.github/workflows/scheduled-security-scan.yml` | Rewrite to use `uses: ./` with GitHub App auth; drop the legacy `jq` parsing in favour of Action outputs |
| `.github/workflows/action-test.yml` | New. On PRs: `actionlint`, a run against a fixture/mock using `--version` from a local `npm pack` tarball. On `main`/dispatch (not forks): a real run against a test organisation using an App secret |
| `.github/workflows/npm-publish.yml` | After publishing, bump the version pin in `action.yml`, then move the major tag (`v1`) to the release |
| `.github/workflows/README.md` | Document the new workflows; remove the old `gh-security-tools` references |
| `website/content/docs/github-action.md` | New user guide: quick start, auth modes, inputs/outputs, gating, Code Scanning, troubleshooting. Add to `navigation` in `website/docmd.config.js` |
| `README.md` | "Run as a GitHub Action" section |
| `CHANGELOG.md` | Create, and record the feature |

## Example consumer workflow (for the docs)

```yaml
name: HubHelper
on:
  schedule: [{ cron: '17 6 * * 1' }]
  workflow_dispatch:

permissions:
  contents: read
  security-events: write # SARIF upload
  actions: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # only needed for a custom profile in the repository
      - id: app-token
        uses: actions/create-github-app-token@<sha>
        with:
          app-id: ${{ vars.HUBHELPER_APP_ID }}
          private-key: ${{ secrets.HUBHELPER_APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}
      - id: hubhelper
        uses: sdh100shaun/HubHelper@v1
        with:
          token: ${{ steps.app-token.outputs.token }}
          profile: .github/hubhelper/policy.yaml
          fail-on: high
      - if: failure() && steps.hubhelper.outputs.breached == 'true'
        run: echo "High-severity findings: ${{ steps.hubhelper.outputs.high }}"
```

## Security considerations

- Pin every third-party action in `action.yml` by commit SHA. Dependabot (`github-actions` ecosystem) keeps them current.
- All inputs go through `env:` and are quoted in the script, never `${{ }}` inside `run:` (script injection).
- The installed package is pinned to an exact version and published with `--provenance`. Consider
  `npm install --ignore-scripts`.
- Default workflow permissions in the docs are read-only, plus `security-events: write` only when uploading SARIF.
- Reports can name private repositories and people. Say so in the docs and default artifact retention to 30 days.
- With Code Scanning on a public repository, findings about *other* (private) repositories become visible. Docs
  must recommend uploading SARIF only to a private repository.

## Phases

1. **MVP:** CLI changes 1–3, `action.yml`, wrapper script, fixed scheduled workflow, docs page, tests.
2. **Code Scanning quality:** SARIF fixes (4), annotations, `action-test.yml` real-run job, release tag automation.
3. **Extras:** GHES support, Marketplace listing (separate repository if needed), optional "open an issue on
   breach" input (replacing the `github-script` block in the current scheduled workflow), `watch --once` mode
   with state cached through `actions/cache` for "new findings only" runs.

## Open questions

1. Should the Action open or update an issue on breach itself, or leave that to the caller's workflow?
2. Is a Marketplace listing wanted? If yes, should it be from this repository or a separate action repository?
3. Should SARIF go to the repository running the workflow, or should we recommend a dedicated private "security"
   repository as the standard pattern?
4. Is GHES support needed for any known users?
