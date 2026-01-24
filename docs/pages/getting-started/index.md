---
layout: page.njk
title: Getting Started
description: Complete guide to installing and using GitHub Security Analysis Tools
githubEdit: true
---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.x, 20.x, 22.x, or later installed
- A **GitHub Personal Access Token** with the following scopes:
  - `repo` - Full control of private repositories
  - `read:org` - Read org and team membership
  - `admin:org` - Full control of orgs (for Actions settings)

## Installation Options

### Option 1: Run with npx (Recommended)

No installation required! Use npx to run the tool directly:

```bash
npx @sdh100shaun/gh-security-tools analyze --org your-org --token your-token
```

This is the fastest way to get started and ensures you always use the latest version.

### Option 2: Global Installation

Install globally to use the tool from anywhere:

```bash
npm install -g @sdh100shaun/gh-security-tools
```

Then run with:

```bash
gh-security analyze --org your-org
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

1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Give your token a descriptive name (e.g., "Security Analysis Tool")
4. Select the following scopes:
   - ✅ `repo` - Full control of private repositories
   - ✅ `read:org` - Read org and team membership
   - ✅ `admin:org` - Full control of orgs
5. Click "Generate token"
6. **Copy the token immediately** - you won't be able to see it again!

## Configuration

### Using Environment Variables

Create a `.env` file in your project root:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=your-organization-name
```

Then run without flags:

```bash
npx @sdh100shaun/gh-security-tools analyze
```

### Using Command-Line Flags

Pass configuration via command-line options:

```bash
npx @sdh100shaun/gh-security-tools analyze \
  --org your-org \
  --token ghp_xxxxxxxxxxxxxxxxxxxx \
  --days 30
```

## Basic Usage

### Analyze an Organization

Run a basic security analysis:

```bash
npx @sdh100shaun/gh-security-tools analyze --org myorg
```

This will:
1. Fetch all repositories in the organization
2. Analyze pull requests from the last 30 days
3. Detect security issues (self-merges, security PRs, disabled actions)
4. Display results in the terminal with color-coded severity levels

### Customize the Time Range

Look back a specific number of days (1-365):

```bash
npx @sdh100shaun/gh-security-tools analyze --org myorg --days 90
```

### Export Results

Save results in JSON format for automation:

```bash
npx @sdh100shaun/gh-security-tools analyze --org myorg --json report.json
```

Save results as an HTML report:

```bash
npx @sdh100shaun/gh-security-tools analyze --org myorg --html report.html
```

Save both formats:

```bash
npx @sdh100shaun/gh-security-tools analyze \
  --org myorg \
  --json results.json \
  --html report.html
```

### Disable AI Insights

Run analysis without AI-powered recommendations:

```bash
npx @sdh100shaun/gh-security-tools analyze --org myorg --no-ai
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
npx @sdh100shaun/gh-security-tools analyze \
  --org myorg \
  --days 7 \
  --html weekly-report.html
```

### Pre-Release Audit

Before a major release:

```bash
# Comprehensive 90-day analysis
npx @sdh100shaun/gh-security-tools analyze \
  --org myorg \
  --days 90 \
  --json audit-$(date +%Y-%m-%d).json
```

### CI/CD Integration

Add to your CI pipeline (e.g., GitHub Actions):

```yaml
- name: Run Security Analysis
  run: |
    npx @sdh100shaun/gh-security-tools analyze \
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

**Solution**: Ensure your token has the required scopes (`repo`, `read:org`, `admin:org`). Regenerate if necessary.

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

- [View the API Reference](/pages/api/) for detailed command options
- [Read about Security](/pages/security/) features and best practices
- [Learn how to Contribute](/pages/contributing/) to the project

## Getting Help

If you encounter issues:

1. Check the [GitHub Issues](https://github.com/sdh100shaun/gh-tools/issues) for similar problems
2. Review the [API documentation](/pages/api/) for detailed usage
3. [Open a new issue](https://github.com/sdh100shaun/gh-tools/issues/new) with:
   - Your Node.js version (`node --version`)
   - The command you ran
   - The full error message
   - Any relevant logs
