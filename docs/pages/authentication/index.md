---
layout: page.njk
title: Authentication
description: Configure Personal Access Token or GitHub App authentication for HubHelper
githubEdit: true
---

## Authentication

HubHelper supports three authentication modes. GitHub App auth is recommended for
automated and CI workflows; the GitHub CLI is the quickest option for local use;
a PAT sits in between.

| Feature | GitHub CLI | PAT | GitHub App |
|---|---|---|---|
| **Best for** | Local dev | Local dev, one-off scans | CI/CD, scheduled automation |
| **Setup** | `gh auth login` | Mint and paste a token | App + private key + install |
| **Identity** | Your user account | Your user account | Bot account |
| **Token expiry** | Managed by `gh` | Manual (90 days max) | Auto-refreshed (1 hour) |
| **Least privilege** | Classic scopes only | Fine-grained available | Fine-grained |
| **Rate limit** | 5 000 req/hr | 5 000 req/hr | 5 000 req/hr per installation |
| **Audit trail** | Personal | Personal | Separate from users |

---

## Option 0 — GitHub CLI

If you already use the [GitHub CLI](https://cli.github.com), HubHelper will borrow
its credential automatically when neither `GITHUB_APP_ID` nor `GITHUB_TOKEN` is set:

```bash
gh auth login
hubhelper auth status --org your-org
hubhelper analyze --org your-org
```

`gh auth login` grants `repo`, `read:org` and `gist` by default, which covers everything
HubHelper needs. Top up an older login with:

```bash
gh auth refresh -h github.com -s read:org
```

### Trade-off

A `gh` credential is a **classic** OAuth token, and the `repo` scope includes **write**
access. It is deliberately broader than the fine-grained read-only token in Option 1.
Use it for local development convenience; prefer a fine-grained PAT or a GitHub App
for CI and scheduled scans.

### Gotchas

- **SAML SSO** — organisations enforcing SSO require the credential to be authorised for
  that organisation. If `hubhelper auth status --org your-org` reports HTTP 403 on the
  members check, re-run `gh auth login` and approve the organisation.
- **Opting out** — set `HUBHELPER_NO_GH_CLI=1` to disable GitHub CLI discovery entirely.
  Useful when you want a run to fail loudly rather than fall back to an ambient login.
- **GitHub Enterprise Server** — `GH_HOST` is honoured when *retrieving* the token, but
  HubHelper still talks to `api.github.com`. Full GHES support is not yet available.

---

## Option 1 — Personal Access Token

### 1. Create a token

Go to **GitHub → Settings → Developer settings → Personal access tokens**.

**Fine-grained token (recommended)**

| Permission | Access |
|---|---|
| Repository → Actions | Read |
| Repository → Pull requests | Read |
| Repository → Metadata | Read |
| Repository → Administration | Read |
| Organization → Members | Read |

**Classic token** — scopes: `repo`, `read:org`

### 2. Configure

```bash
# .env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=your-org
```

Or pass it inline:

```bash
hubhelper analyze --org your-org --token ghp_xxxxxxxxxxxxxxxxxxxx
```

---

## Option 2 — GitHub App

When `GITHUB_APP_ID` is present in the environment it takes precedence over
`GITHUB_TOKEN`. Installation tokens are refreshed automatically, so long-running
processes (watch mode) never expire mid-run.

### 1. Create the App

1. Navigate to **GitHub → Settings → Developer settings → GitHub Apps** (personal)
   or **org → Settings → Developer settings → GitHub Apps** (organization).
2. Click **New GitHub App**.
3. Set a name and homepage URL; uncheck **Active** under Webhooks.
4. Under **Repository permissions** grant Read access to: Actions, Pull requests,
   Metadata, Administration (optional).
5. Under **Organization permissions** grant Read access to: Members.
6. Click **Create GitHub App**.

### 2. Generate a private key

On the App's settings page, scroll to **Private keys** and click
**Generate a private key**. Save the downloaded `.pem` file securely.

### 3. Install the App on your organization

Go to the App's **Install App** tab, choose your organization, and click **Install**.

### 4. Find the installation ID

After installing, the URL in your browser contains the installation ID:
`https://github.com/organizations/<org>/settings/installations/<installation-id>`

### 5. Configure

```bash
# .env
GITHUB_APP_ID=123456
GITHUB_APP_INSTALLATION_ID=78901234

# Inline PEM (good for CI secrets)
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEo...
-----END RSA PRIVATE KEY-----"

# Or a path to the .pem file (good for local dev)
# GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem

GITHUB_ORG=your-org
```

---

## Environment variable reference

| Variable | Required for | Description |
|---|---|---|
| `GITHUB_TOKEN` | PAT auth | Personal access token |
| `GITHUB_APP_ID` | App auth | Numeric App ID |
| `GITHUB_APP_INSTALLATION_ID` | App auth | Installation ID for the org |
| `GITHUB_APP_PRIVATE_KEY` | App auth | PEM contents (inline) |
| `GITHUB_APP_PRIVATE_KEY_PATH` | App auth | Path to `.pem` file |
| `GITHUB_ORG` | All | Organisation to scan |
| `HUBHELPER_NO_GH_CLI` | GitHub CLI | Set to any value to disable GitHub CLI discovery |
| `GH_HOST` | GitHub CLI | Hostname passed to `gh auth token` (token retrieval only) |

`GITHUB_APP_PRIVATE_KEY` and `GITHUB_APP_PRIVATE_KEY_PATH` may both be set;
when both are present, the inline key in `GITHUB_APP_PRIVATE_KEY` wins.

---

## Priority rules

1. If `--token` is passed on the CLI, it is always used as a PAT and
   environment variables are ignored.
2. If `GITHUB_APP_ID` is set in the environment, GitHub App auth is used
   (even if `GITHUB_TOKEN` is also set).
3. If only `GITHUB_TOKEN` is set, PAT auth is used.
4. If none of the above are set, the GitHub CLI is consulted via `gh auth token`.
5. If that also fails, HubHelper exits with a clear error message naming the reason
   (`gh` not installed, or installed but not logged in).

The GitHub CLI is tried last on purpose: CI sets `GITHUB_TOKEN` explicitly, so a build
can never silently pick up a developer's ambient `gh auth login`.

---

## Permissions HubHelper needs

| Feature | Classic scope | Fine-grained permission |
|---|---|---|
| Repositories, pull requests, workflow runs, file contents | `repo` | Metadata, Pull requests, Actions, Contents — all Read |
| Organisation members and the org event stream (`watch`, `stream`) | `read:org` | Organisation → Members: Read |
| Actions-enabled and security-features-enabled status | `repo` **+ repository admin** | Administration: Read |

Without repository admin, the Actions permissions endpoint and the `security_and_analysis`
block of the repository response are not returned. HubHelper then reports `actions_enabled`
and `security_enabled` as `false` for every repository you do not administer — findings become
**incomplete rather than wrong**, and an incomplete report is indistinguishable from a clean one.

## Checking what you actually have

```bash
hubhelper auth status --org your-org
```

Reports the active credential, your identity, the granted scopes, whether the required access
works against your organisation, and whether the admin-only extras above are available. Exits
non-zero when something required is missing.

---

## See also

- [GitHub App Setup Guide](/pages/github-app/) — detailed walkthrough with
  screenshots for creating and installing a GitHub App.
- [Getting Started](/pages/getting-started/) — quick-start guide.
