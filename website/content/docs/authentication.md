---
title: Authentication
description: Configure personal access token or GitHub App authentication for HubHelper
---

# Authentication

HubHelper supports two authentication modes. A **personal access token (PAT)** is the
simplest option for local use; a **GitHub App** is recommended for CI and scheduled
automation.

| Feature | PAT | GitHub App |
|---|---|---|
| **Best for** | Local use, one-off scans | CI/CD, scheduled automation, watch mode |
| **Identity** | Your user account | The App's bot account |
| **Token lifetime** | Set when created; you rotate it | Installation tokens refreshed automatically (1 hour) |
| **Rate limit** | 5,000 requests/hour | At least 5,000 requests/hour per installation, scaling with organisation size |
| **Audit trail** | Attributed to you | Separate from users |

::: callout info "Which commands support GitHub App auth"
`analyze`, `watch` and `query` accept either mode. `stream` and `list report` currently
use a personal access token only (`--token` or `GITHUB_TOKEN`).
:::

---

## Option 1 — Personal access token

### 1. Create a token

Go to **GitHub → Settings → Developer settings → Personal access tokens**.

**Fine-grained token (recommended)**

| Permission | Access |
|---|---|
| Repository → Actions | Read |
| Repository → Pull requests | Read |
| Repository → Metadata | Read |
| Repository → Administration | Read |
| Organisation → Members | Read |

**Classic token**: scopes `repo` and `read:org`.

See [Creating a GitHub Token](/docs/getting-started/#creating-a-github-token) for a
step-by-step walkthrough.

### 2. Configure

```bash
# .env
GITHUB_TOKEN=<token>
GITHUB_ORG=<org>
```

Or pass the token inline:

```bash
hubhelper analyze --org <org> --token <token>
```

---

## Option 2 — GitHub App

When `GITHUB_APP_ID` is set, GitHub App authentication takes precedence over
`GITHUB_TOKEN`. Installation tokens are refreshed automatically, so long-running
processes such as watch mode never expire mid-run.

### 1. Create the App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps** (personal account)
   or **your organisation → Settings → Developer settings → GitHub Apps**.
2. Click **New GitHub App**.
3. Set a name and homepage URL, and untick **Active** under Webhooks.
4. Under **Repository permissions**, grant Read access to Actions, Pull requests and
   Metadata (and Administration, optionally).
5. Under **Organization permissions**, grant Read access to Members.
6. Click **Create GitHub App**.

### 2. Generate a private key

On the App's settings page, scroll to **Private keys** and click
**Generate a private key**. Store the downloaded `.pem` file securely.

### 3. Install the App on your organisation

Open the App's **Install App** tab, choose your organisation and click **Install**.

### 4. Find the installation ID

After installing, the URL in your browser contains the installation ID:

```text
https://github.com/organizations/<org>/settings/installations/<installation-id>
```

### 5. Configure

```bash
# .env
GITHUB_APP_ID=<app-id>
GITHUB_APP_INSTALLATION_ID=<installation-id>

# Inline PEM contents (suits CI secrets)
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"

# Or a path to the .pem file (suits local use)
# GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem

GITHUB_ORG=<org>
```

For scheduled scans from GitHub Actions, see the [GitHub App Setup](/docs/github-app/)
guide.

---

## Environment variable reference

| Variable | Required for | Description |
|---|---|---|
| `GITHUB_TOKEN` | PAT auth | Personal access token |
| `GITHUB_APP_ID` | App auth | Numeric App ID |
| `GITHUB_APP_INSTALLATION_ID` | App auth | Installation ID for the organisation |
| `GITHUB_APP_PRIVATE_KEY` | App auth (one of) | PEM contents, inline |
| `GITHUB_APP_PRIVATE_KEY_PATH` | App auth (one of) | Path to the `.pem` file |
| `GITHUB_ORG` | Both | Organisation to scan |

If both `GITHUB_APP_PRIVATE_KEY` and `GITHUB_APP_PRIVATE_KEY_PATH` are set, the inline
key wins.

---

## Precedence

1. If `--token` is passed on the command line, it is used as a PAT and the environment
   is ignored.
2. Otherwise, if `GITHUB_APP_ID` is set, GitHub App auth is used, even when
   `GITHUB_TOKEN` is also set. `GITHUB_APP_INSTALLATION_ID` and one of the private key
   variables must then be present.
3. Otherwise, if `GITHUB_TOKEN` is set, PAT auth is used.
4. If none of these are set, HubHelper exits with an error explaining which variables
   to set.

---

## See also

- [Getting Started](/docs/getting-started/) — installation and first scan
- [GitHub App Setup](/docs/github-app/) — scheduled scans with a GitHub App in Actions
- [Security](/docs/security/) — token handling and best practices
