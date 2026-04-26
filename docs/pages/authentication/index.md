---
layout: page.njk
title: Authentication
description: Configure Personal Access Token or GitHub App authentication for HubHelper
githubEdit: true
---

## Authentication

HubHelper supports two authentication modes. GitHub App auth is recommended for
automated and CI workflows; PAT auth is the simplest option for local use.

| | PAT | GitHub App |
|---|---|---|
| **Best for** | Local dev, one-off scans | CI/CD, scheduled automation |
| **Identity** | Your user account | Bot account |
| **Token expiry** | Manual (90 days max) | Auto-refreshed (1 hour) |
| **Rate limit** | 5 000 req/hr | 5 000 req/hr per installation |
| **Audit trail** | Personal | Separate from users |

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
| `GITHUB_ORG` | Both | Organization to scan |

`GITHUB_APP_PRIVATE_KEY` and `GITHUB_APP_PRIVATE_KEY_PATH` are mutually
exclusive; when both are set the inline key wins.

---

## Priority rules

1. If `--token` is passed on the CLI, it is always used as a PAT and
   environment variables are ignored.
2. If `GITHUB_APP_ID` is set in the environment, GitHub App auth is used
   (even if `GITHUB_TOKEN` is also set).
3. If only `GITHUB_TOKEN` is set, PAT auth is used.
4. If none of the above are set, HubHelper exits with a clear error message.

---

## See also

- [GitHub App Setup Guide](/pages/github-app/) — detailed walkthrough with
  screenshots for creating and installing a GitHub App.
- [Getting Started](/pages/getting-started/) — quick-start guide.
