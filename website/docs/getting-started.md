---
sidebar_position: 2
title: Getting Started
description: Complete guide to installing and using HubHelper
---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 20.x, 22.x, or later installed
- A **GitHub Personal Access Token** with read-only permissions
  - Fine-grained token (recommended) or Classic token
  - See [Creating a GitHub Token](#creating-a-github-token) below

**Looking for automated scanning?** Check out the [GitHub App Setup Guide](/docs/github-app) to configure scheduled security scans with GitHub Apps instead of personal access tokens.

## Installation Options

### Option 1: Run with npx (Recommended)

No installation required! Use npx to run the tool directly:

```bash
npx @sdh100shaun/hubhelper analyze --org your-org --token your-token
```

This is the fastest way to get started and ensures you always use the latest version.

### Option 2: Global Installation

Install globally to use the tool from anywhere:

```bash
npm install -g @sdh100shaun/hubhelper
```

Then run with:

```bash
hubhelper analyze --org your-org
```

### Option 3: Local Development

Clone the repository for development or customization:

```bash
git clone https://github.com/sdh100shaun/gh-tools.git
cd gh-tools
npm install
```

Run in development mode:

```bash
npm run dev analyze --org your-org
```

## Creating a GitHub Token

### Fine-Grained Token (Recommended)

Fine-grained tokens provide the most secure access with minimal read-only permissions.

#### Quick Setup

1. **Navigate to Token Settings**

   Go to: [https://github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)

2. **Click "Generate new token"**

3. **Configure Token**

   | Setting | Value |
   |---------|-------|
   | Token name | `gh-security-tools-readonly` |
   | Expiration | 90 days |
   | Resource owner | *Select your organization* |
   | Repository access | All repositories |

4. **Set Permissions (Read-only)**

   **Repository permissions:**
   - ✅ **Actions**: Read
   - ✅ **Pull requests**: Read
   - ✅ **Administration**: Read (optional - for security settings)
   - ✅ **Metadata**: Read (automatic)

   **Organization permissions:** None required

5. **Generate and Save**
   - Click "Generate token"
   - Copy the token immediately (starts with `github_pat_...`)
   - Store securely

#### What These Permissions Enable

| Permission | What It's Used For | Required? |
|------------|-------------------|-----------|
| **Actions: Read** | Check if GitHub Actions is enabled<br />List workflow status (active/disabled/paused) | ✅ Yes |
| **Pull requests: Read** | Analyze merged PRs<br />Detect self-merges<br />Identify security-related PRs | ✅ Yes |
| **Metadata: Read** | List organization repositories<br />Get repository details | ✅ Yes (automatic) |
| **Administration: Read** | Check secret scanning status<br />Check Dependabot status | ⚠️ Optional |

**Note:** Without `Administration: Read`, security scanning status checks will be skipped, but the tool will still work.

### Classic Token (Alternative)

If you prefer classic tokens (not recommended for security):

1. Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Give your token a descriptive name (e.g., "Security Analysis Tool")
4. Select the following scopes:
   - ✅ `repo` (if analyzing private repositories)
   - ✅ `read:org` (read organization membership)
5. Click "Generate token"
6. **Copy the token immediately** - you won't be able to see it again!

**Security Note:** Classic tokens grant broader access than necessary. Fine-grained tokens are more secure.

### Testing Your Token

Verify your token has the correct permissions:

```bash
# Set token without storing it in shell history
read -s -p "Enter your GitHub token: " GITHUB_TOKEN; echo
export GITHUB_TOKEN

# Test repository access
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/orgs/YOUR_ORG/repos | jq '.[0].name'

# Test pull request access
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/YOUR_ORG/REPO/pulls | jq '.[0].number'

# Test Actions access
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/YOUR_ORG/REPO/actions/permissions | jq '.enabled'
```

## Configuration

### Using Environment Variables

Create a `.env` file in your project root:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=your-organization-name
```

Then run without flags:

```bash
npx @sdh100shaun/hubhelper analyze
```

### Using Command-Line Flags

Pass configuration via command-line options:

```bash
npx @sdh100shaun/hubhelper analyze \
  --org your-org \
  --token your_token_here \
  --days 30
```

### Storing Your Token Securely

#### Local Development

**Option 1: .env File (Recommended)**
```bash
# Create .env file
cat > .env <<EOF
GITHUB_TOKEN=your_token_here
GITHUB_ORG=your-org
EOF

# Add to .gitignore (important!)
echo ".env" >> .gitignore
```

**Option 2: Environment Variable**
```bash
# Temporary (current session only)
export GITHUB_TOKEN="your_token_here"
export GITHUB_ORG="your-org"

# Persistent (add to ~/.bashrc or ~/.zshrc)
echo 'export GITHUB_TOKEN="your_token_here"' >> ~/.bashrc
source ~/.bashrc
```

#### CI/CD (GitHub Actions)

Store as a GitHub Secret:

1. Go to: `Settings → Secrets → Actions → New secret`
2. Name: `GITHUB_TOKEN`
3. Value: your token

Use in workflow:
```yaml
- name: Run security analysis
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: npx @sdh100shaun/gh-security-tools analyze --org ${{ github.repository_owner }}
```

#### Token Security Checklist

- ✅ Use fine-grained tokens with read-only permissions
- ✅ Set expiration (90 days or less)
- ✅ Store in `.env` file (added to `.gitignore`)
- ✅ Never commit tokens to git
- ✅ Rotate tokens every 90 days
- ✅ Revoke immediately if compromised

## Basic Usage

### Analyze an Organization

Run a basic security analysis:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg
```

This will:
1. Fetch all repositories in the organization
2. Analyze pull requests from the last 30 days
3. Detect security issues (self-merges, security PRs, disabled actions)
4. Display results in the terminal with color-coded severity levels

### Customize the Time Range

Look back a specific number of days (1-365):

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --days 90
```

### Export Results

Save results in JSON format for automation:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --json report.json
```

Save results as an HTML report:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --html report.html
```

Save both formats:

```bash
npx @sdh100shaun/hubhelper analyze \
  --org myorg \
  --json results.json \
  --html report.html
```

### Disable AI Insights

Run analysis without AI-powered recommendations:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --no-ai
```

## Understanding the Output

### Console Output

The terminal output includes:

1. **Summary** - Overview of repositories analyzed and issues found
2. **Statistics** - Key metrics (total repos, PRs, self-merges, etc.)
3. **AI Insights** - Pattern analysis and risk assessment (if enabled)
4. **Detailed Issues** - Categorized by severity (critical, high, medium, low)
5. **Recommendations** - Actionable steps to improve security

### Severity Levels

- 🔴 **Critical** - Immediate action required (e.g., unreviewed security PRs)
- 🟠 **High** - Should be addressed soon (e.g., self-merged security changes)
- 🟡 **Medium** - Notable issues (e.g., self-merges in general, disabled actions)
- 🔵 **Low** - Informational (e.g., manually disabled workflows)

### Issue Types

**Self-Merges**: Pull requests where the author merged their own code without external review.

**Security PRs**: Pull requests containing security-related changes (detected by keywords and labels).

**Unreviewed Security PRs**: Critical - security changes merged without external review.

**Disabled Actions**: Repositories with GitHub Actions disabled, missing automated security scanning.

**Paused Workflows**: Workflows automatically paused due to 60 days of inactivity.

**Disabled Workflows**: Workflows manually disabled by users.

## Common Workflows

### Weekly Security Check

Add to your weekly routine:

```bash
# Check the last 7 days
npx @sdh100shaun/hubhelper analyze \
  --org myorg \
  --days 7 \
  --html weekly-report.html
```

### Pre-Release Audit

Before a major release:

```bash
# Comprehensive 90-day analysis
npx @sdh100shaun/hubhelper analyze \
  --org myorg \
  --days 90 \
  --json audit-$(date +%Y-%m-%d).json
```

### CI/CD Integration

Add to your CI pipeline (e.g., GitHub Actions):

```yaml
- name: Run Security Analysis
  run: |
    npx @sdh100shaun/hubhelper analyze \
      --org ${ github.repository_owner } \
      --token ${ secrets.GITHUB_TOKEN } \
      --json security-report.json

- name: Upload Report
  uses: actions/upload-artifact@v3
  with:
    name: security-report
    path: security-report.json
```

## Troubleshooting

### Token Permission Errors

**Error**: "Bad credentials" or "Not Found"

**Solution**: Ensure your token has the minimum required read-only access for the command you're running. Prefer a fine-grained token with read-only repository access, and add read-only organization access only if needed to read organization membership or metadata. For classic tokens, use `repo` only when you need access to private repositories and `read:org` only when organization read access is required. `admin:org` is not required for normal read-only analysis. Regenerate the token if necessary.

### Rate Limiting

**Error**: "API rate limit exceeded"

**Solution**: GitHub API has rate limits. Wait an hour or use a token with higher limits (authenticated requests get 5,000/hour).

### Organization Not Found

**Error**: "Organization 'xyz' not found"

**Solution**:
- Verify the organization name is spelled correctly
- Ensure your token has access to the organization
- Check that you're a member of the organization

### File Path Security Errors

**Error**: "Security error: path traversal detected"

**Solution**: The tool restricts file operations to the current directory for security. Use relative paths:

```bash
# ✅ Correct
--html reports/output.html

# ❌ Incorrect
--html ../../../tmp/output.html
```

### Input Validation Errors

**Error**: "Invalid organization name format"

**Solution**: GitHub organization names must:
- Be 1-39 characters
- Contain only alphanumeric characters and hyphens
- Not start or end with a hyphen

### Days Parameter Errors

**Error**: "Days must be between 1 and 365"

**Solution**: The tool limits the time range to prevent API abuse. Use a value between 1-365.

## Next Steps

- [View the API Reference](/docs/api-reference) for detailed command options
- [Read about Security](/docs/security) features and best practices
- [Learn how to Contribute](/docs/contributing) to the project

## Getting Help

If you encounter issues:

1. Check the [GitHub Issues](https://github.com/sdh100shaun/gh-tools/issues) for similar problems
2. Review the [API documentation](/docs/api-reference) for detailed usage
3. [Open a new issue](https://github.com/sdh100shaun/gh-tools/issues/new) with:
   - Your Node.js version (`node --version`)
   - The command you ran
   - The full error message
   - Any relevant logs
