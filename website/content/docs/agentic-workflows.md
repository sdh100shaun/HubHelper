---
title: Agentic Workflows
description: Run a weekly HubHelper audit with GitHub Agentic Workflows and have a Copilot agent triage the findings
---

## Overview

HubHelper ships a ready-made [GitHub Agentic Workflow](https://github.github.com/gh-aw/) (gh-aw) that audits your
organisation every week:

1. **HubHelper scans** the organisation with your policy profile. This step is deterministic: the policy engine,
   not the AI, decides what counts as a finding.
2. **A Copilot agent triages** the results. It checks context with read-only GitHub tools, compares with last week,
   and works out what is new, ongoing or resolved.
3. **gh-aw publishes** a weekly digest discussion and up to five issues for new critical or high findings, through
   validated *safe outputs*.

The workflow is called `hubhelper-org-audit`. Its source is in the
[`gh-aw/`](https://github.com/sdh100shaun/HubHelper/tree/main/gh-aw) folder of the HubHelper repository.

::: callout warning "Install it in a private repository"
Findings name private repositories and people. Install the workflow in a **private** repository, for example
`<org>/security-audits`. It gets the issues, the discussion and the Code Scanning results.
:::

## How it works

gh-aw compiles the workflow into four jobs:

| Job | Runs | What it does | Credentials |
|-----|------|--------------|-------------|
| `hubhelper_scan` | Outside the agent sandbox | Runs `hubhelper analyze --no-ai`, uploads SARIF to Code Scanning and saves `findings.json`, `findings.sarif` and `compliance.md` as an artifact | HubHelper GitHub App (read-only, organisation-wide) |
| `agent` | Inside gh-aw's firewalled sandbox | Copilot reads the reports, checks context with the GitHub tools, keeps a fingerprint list in cache memory and asks for outputs | Short-lived read-only App token for the GitHub tools; the model never sees it |
| `detection` | After the agent | gh-aw's threat detection checks the agent's requested outputs | Managed by gh-aw |
| `safe_outputs` | After detection passes | Creates the discussion and issues, within the declared limits | The workflow's own token, scoped to this repository |

The agent job has no write permissions and only the network access gh-aw allows by default (`network: defaults`).
HubHelper's built-in Copilot features are switched off (`--no-ai`), because the gh-aw agent does that work.

## Prerequisites

- **GitHub CLI** with the gh-aw extension, version **1.4.0 or later**:

  ```bash
  gh extension install github/gh-aw
  gh aw version
  ```

- **A private repository** in the organisation you want to audit, with **Discussions** turned on and a
  discussion category called `audits`.
- **GitHub Copilot** for the organisation, with centralised billing. Without it, use a personal access token
  instead (see **Copilot authentication** in step 2 below).
- **HubHelper 1.1.0 or later** on npm. The workflow installs it for you; 1.1.0 is the first release that bundles
  the `default` and `strict` policy profiles.

## Set up

### 1. Create a GitHub App for HubHelper

Create an App owned by the organisation, as described in [GitHub App Setup](/docs/github-app/), with these
**read-only** permissions:

| Permission | Level | Used by |
|------------|-------|---------|
| Repository → Metadata | Read | HubHelper and the agent |
| Repository → Contents | Read | The agent's GitHub tools (PR files) |
| Repository → Pull requests | Read | HubHelper (self-merge, security PR controls) and the agent |
| Repository → Actions | Read | HubHelper (workflow controls) and the agent |
| Organisation → Members | Read | HubHelper (contractor access control) and the agent's `orgs` tools |

Don't give the App any write permissions. Writes are made by the workflow's own token.

Install the App on **all repositories** in the organisation, then note the **App ID** (App settings page) and
the **installation ID** (the number at the end of the installation's settings URL).

### 2. Add variables and secrets

In the private security repository:

| Name | Type | Value |
|------|------|-------|
| `HUBHELPER_APP_ID` | Variable | The App ID |
| `HUBHELPER_APP_INSTALLATION_ID` | Variable | The installation ID |
| `HUBHELPER_APP_PRIVATE_KEY` | Secret | The App's private key (the whole PEM file) |

```bash
gh variable set HUBHELPER_APP_ID --body "<app-id>" --repo <org>/security-audits
gh variable set HUBHELPER_APP_INSTALLATION_ID --body "<installation-id>" --repo <org>/security-audits
gh secret set HUBHELPER_APP_PRIVATE_KEY < hubhelper-app.private-key.pem --repo <org>/security-audits
```

#### Copilot authentication

The workflow asks for `copilot-requests: write`, so Copilot inference uses the workflow's own token and is billed
to the organisation. That needs an organisation-owned repository and Copilot with centralised billing.

If that isn't available, remove `copilot-requests: write` from the workflow's `permissions:` and add a
fine-grained personal access token with **Account permissions → Copilot Requests: Read**, owned by a user with a
Copilot licence:

```bash
gh aw secrets set COPILOT_GITHUB_TOKEN --repo <org>/security-audits
```

### 3. Create the labels

The issues are labelled `security` and `hubhelper`. Create them if they don't exist:

```bash
gh label create security --color d73a4a --description "Security finding" --repo <org>/security-audits
gh label create hubhelper --color 1f6feb --description "Created by the HubHelper agentic audit" --repo <org>/security-audits
```

`gh aw add-wizard sdh100shaun/HubHelper/gh-aw` can create them for you.

### 4. Install the workflow

From a clone of the security repository:

```bash
gh aw add sdh100shaun/HubHelper/gh-aw --create-pull-request
```

This copies `hubhelper-org-audit.md` into `.github/workflows/`, compiles it to `hubhelper-org-audit.lock.yml`, and
opens a pull request. Merge it. Both files must be committed: the `.md` file is the source and the `.lock.yml`
file is what GitHub Actions runs.

#### Security review on install

gh-aw's *safe update mode* asks you to review new secrets and actions before it accepts them. For this workflow it
lists:

| Item | Why it's there | Where it's used |
|------|----------------|-----------------|
| Secret `HUBHELPER_APP_PRIVATE_KEY` | Signs in as the read-only HubHelper App | The `Run HubHelper` step of `hubhelper_scan` (step `env` only), and gh-aw's token minting for the agent's GitHub tools. Never passed to the model |
| Action `github/codeql-action/upload-sarif` | GitHub's official action for uploading SARIF to Code Scanning, pinned by commit SHA | The `hubhelper_scan` job only |

Once you've reviewed them, accept with `gh aw compile hubhelper-org-audit --approve`. Later compiles only ask again
if a secret or action is added.

To pin a HubHelper release, add `@<tag>`, for example `gh aw add sdh100shaun/HubHelper/gh-aw@v1.1.0`.

### 5. Run it once

```bash
gh aw run hubhelper-org-audit
```

Or open the workflow in the **Actions** tab and choose **Run workflow**, where you can also set the look-back window and the
profile. After that it runs every Monday, at a time gh-aw picks for the repository and keeps stable.

## What you get

- **A weekly discussion** in the `audits` category, titled `[hubhelper] Weekly audit <date>`: counts by severity
  and control, new, ongoing and resolved findings, the top three risks, review-state findings and a compliance
  summary. Old digests close automatically after 30 days. If Discussions is off, gh-aw creates an issue instead.
- **Up to five issues** for new critical or high findings, titled `[hubhelper] <control> … in <repository>`, with
  evidence, why it matters, a suggested fix and the context the agent checked. Issues don't close automatically.
  Duplicate titles are skipped, and findings already reported are not raised again.
- **Code Scanning alerts** under the `hubhelper` category (see [known limitations](#known-limitations)).
- **A workflow artifact**, `hubhelper-findings`, with the raw reports, kept for 30 days.

If there are no findings and nothing was resolved, the agent creates nothing and records why.

## Customise

Edit `.github/workflows/hubhelper-org-audit.md` in your security repository, then recompile and commit both files:

```bash
gh aw compile hubhelper-org-audit
git add .github/workflows/hubhelper-org-audit.md .github/workflows/hubhelper-org-audit.lock.yml
```

| To change | Edit |
|-----------|------|
| Schedule | `on.schedule`, for example `daily on weekdays` or `weekly on friday around 5pm` ([gh-aw schedule syntax](https://github.github.com/gh-aw/reference/schedule-syntax/)) |
| Policy profile | The `profile` input default: `default`, `strict`, or a YAML file in the repository such as `.github/hubhelper/policy.yaml` (see [Bring Your Own Policy](/docs/features/bring-your-own-policy/)) |
| Look-back window | The `days` input default |
| HubHelper version | `HUBHELPER_VERSION` in the `hubhelper_scan` job |
| Number of issues | `safe-outputs.create-issue.max` |
| Labels or title prefix | `safe-outputs.create-issue` and `safe-outputs.create-discussion` |
| Discussion category | `safe-outputs.create-discussion.category` |
| What the agent writes | The Markdown instructions below the frontmatter |
| AI engine | `engine:`, for example `claude` with an `ANTHROPIC_API_KEY` secret (and remove `copilot-requests: write`) |

To pick up a newer version of the workflow from HubHelper while keeping your edits:

```bash
gh aw update hubhelper-org-audit
```

## JSON report format

The agent reads `findings.json`, which you can also use in your own automation. From HubHelper 1.1.0 it includes:

| Field | Description |
|-------|-------------|
| `schema_version` | Report layout version, currently `1.0`. The major number changes on breaking changes |
| `generated_at` | ISO 8601 timestamp |
| `issues[]` | Findings from active controls |
| `issues[].control_id` | Catalog control, for example `HH-GH-001` |
| `issues[].fingerprint` | SHA-256 of control ID, repository and subject (PR, workflow, run or contractor). It stays the same while the underlying problem persists, so you can tell new findings from old ones |
| `issues[].severity` | `low`, `medium`, `high` or `critical` |
| `issues[].repository`, `description`, `details`, `detected_at` | As before |
| `reviewIssues[]` | Findings from controls in review state. Informational, same fields |

## Security model

- **Least privilege.** The HubHelper App is read-only. The agent job has read-only permissions and default
  network access. Writes go only through declared safe outputs, capped at one discussion and five issues a run.
- **Secrets stay out of the model.** The App private key is used only in the `hubhelper_scan` job and in gh-aw's
  token minting. gh-aw strict mode rejects secrets in workflow-level `env:`.
- **Untrusted content.** PR titles and bodies, branch names and workflow names are written by other people. The
  agent is told to treat them as data, and gh-aw's threat detection checks outputs before anything is published.
- **Pinned dependencies.** Actions are pinned by commit SHA and HubHelper by exact version.
- **Strict mode.** The workflow compiles with gh-aw strict mode (the default). HubHelper's CI checks this with
  the pinned gh-aw CLI on every change.

## Cost

One run a week, a 20-minute timeout, and no discussion when nothing has changed. Each run uses Copilot premium
requests. To cap spending further, add `max-turns` or `max-daily-ai-credits` to the frontmatter (see the
[gh-aw frontmatter reference](https://github.github.com/gh-aw/reference/frontmatter/)).

## Troubleshooting

### `gh aw compile` fails in strict mode

Read the error: it gives the file, line and rule. Common causes are an unpinned action you added, a secret in
`env:`, or a write permission on the agent job. Keep writes in `safe-outputs`.

### `hubhelper_scan` fails with "Bad credentials" or "Resource not accessible by integration"

Check `HUBHELPER_APP_ID`, `HUBHELPER_APP_INSTALLATION_ID` and the private key (the whole PEM, including the
`BEGIN` and `END` lines). Confirm the App is installed on all repositories with the permissions above. See
[GitHub App troubleshooting](/docs/github-app/).

### "Built-in policy profile is missing" or "Policy profile not found"

`HUBHELPER_VERSION` must be 1.1.0 or later for `default` and `strict`. A custom profile path must point at a
`.yaml` or `.yml` file inside the repository; the scan job checks out the repository for this.

### The agent says it can't see a repository

The GitHub tools use the same App with `repositories: ["*"]`. Install the App on all repositories, or on the ones
you want audited.

### Copilot inference fails

With `copilot-requests: write`, the organisation needs Copilot with centralised billing. Otherwise switch to
`COPILOT_GITHUB_TOKEN` and check that the token owner has a Copilot licence.

### The digest arrived as an issue

Discussions is off, or there's no `audits` category. Turn Discussions on and create the category.

### Every finding is reported as new

The first run has no history. The fingerprint list is kept in gh-aw cache memory, keyed to the organisation; if
the cache expires, findings are reported as new once more.

## Known limitations

- **Code Scanning upload** may reject repository-level findings, which don't have a file location yet. The step
  is allowed to fail so the agent still runs; the findings are still in the artifact, the issues and the digest.
- **Workflow source is checked by CI, not run here.** The workflow is compiled in strict mode in HubHelper's CI,
  but HubHelper's own repository is public, so it doesn't run the audit against an organisation.
