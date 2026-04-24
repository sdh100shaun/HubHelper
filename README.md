# HubHelper

[![CI](https://github.com/sdh100shaun/gh-tools/workflows/CI/badge.svg)](https://github.com/sdh100shaun/gh-tools/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![npm version](https://img.shields.io/npm/v/@sdh100shaun/hubhelper)](https://www.npmjs.com/package/@sdh100shaun/hubhelper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered tools to visualize GitHub activity and flag security issues across organizations using the GitHub Copilot SDK.

## Features

🔍 **Comprehensive Analysis**
- Detects self-merged pull requests
- Identifies security-related PRs
- Flags repositories with disabled GitHub Actions
- Detects paused/disabled workflows (including scheduled workflows)
- Highlights unreviewed security changes

🤖 **AI-Powered Insights**
- Pattern detection across repositories
- Risk assessment and prioritization
- Smart recommendations using AI analysis

📊 **Multiple Output Formats**
- Beautiful console output with colors
- JSON export for automation
- HTML reports for sharing

⚡ **Automation Ready**
- Schedule security scans with GitHub Actions
- Use GitHub Apps for automated workflows
- See [GitHub App Setup](https://sdh100shaun.github.io/gh-tools/pages/github-app/) for automated scanning

## Requirements

- **Node.js**: 20.x, 22.x, or later
  - Tested on Node.js 20 and 22
  - Compatible with Node.js 24+ (future versions)
- **GitHub Personal Access Token** with read-only permissions
  - Fine-grained token (recommended) or Classic token
  - See [Authentication](#authentication) for detailed setup

## Installation

### Quick Start with npx (Recommended)

No installation required! Run directly with npx:

```bash
npx @sdh100shaun/hubhelper analyze --org <your-org> --token <your-token>
```

### Global Installation

Install globally to use as a CLI tool:

```bash
npm install -g @sdh100shaun/hubhelper
hubhelper analyze --org <your-org>
```

### Local Development

Clone and install for development:

```bash
git clone https://github.com/sdh100shaun/gh-tools.git
cd gh-tools
npm install
```

## Authentication

Generate a GitHub token with appropriate permissions:

### 🔒 Fine-Grained Personal Access Token (Recommended)

**Most secure option** with minimal read-only permissions:

1. Navigate to [GitHub Settings → Personal Access Tokens → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"**
3. Configure:
   - **Token name**: `gh-security-tools-readonly`
   - **Resource owner**: Select your organization
   - **Repository access**: All repositories (or select specific repos)
   - **Permissions** (all read-only):
     - ✅ **Actions**: Read
     - ✅ **Pull requests**: Read
     - ✅ **Administration**: Read (optional - for security scanning status)
     - ✅ **Metadata**: Read (automatically included)
   - **Expiration**: 90 days (recommended)
4. Click **"Generate token"**
5. Copy the token (starts with `github_pat_...`)

**Advantages:**
- ✅ Read-only access (cannot modify anything)
- ✅ Organization-scoped (limited blast radius)
- ✅ Repository-specific access possible
- ✅ Automatic expiration
- ✅ Detailed audit logs

### 🔓 Classic Personal Access Token (Legacy)

For backward compatibility:

1. Navigate to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Select scopes:
   - ✅ `repo` (if analyzing private repositories)
   - ✅ `read:org` (read organization membership)
4. Click **"Generate token"**
5. Copy the token (starts with `ghp_...`)

**Note:** Classic tokens grant broader access than needed. Fine-grained tokens are strongly recommended.

### Using Your Token

```bash
# Option 1: Environment variable
export GITHUB_TOKEN="your_token_here"
gh-security analyze --org your-org

# Option 2: .env file (recommended for local development)
cat > .env <<EOF
GITHUB_TOKEN=your_token_here
GITHUB_ORG=your-org
EOF
gh-security analyze

# Option 3: Command line (not recommended - visible in shell history)
gh-security analyze --org your-org --token your_token_here
```

### Token Security Best Practices

- 🔒 Use fine-grained tokens with minimum required permissions
- 🔄 Rotate tokens every 90 days
- 🗑️ Revoke tokens immediately if compromised
- 🔐 Store tokens in secure credential managers (1Password, GitHub Secrets)
- ⏱️ Set expiration dates (enforced with fine-grained tokens)
- 📝 Audit token usage regularly via Settings → Security log

## Usage

### Using npx (No Installation)

Analyze all repositories and pull requests in an organization:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --token ghp_xxx
```

With custom options:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --days 60 --html report.html
```

### Using Global Installation

If installed globally:

```bash
hubhelper analyze --org myorg --days 60
```

### Using Local Development

For local development:

```bash
npm run dev analyze --org myorg --days 60
```

### Export Results

Save results as JSON:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --json results.json
```

Save as HTML report:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --html report.html
```

Both formats:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --json results.json --html report.html
```

### Disable AI Insights

Run analysis without AI-powered recommendations:

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --no-ai
```

### Environment Variables

Instead of passing flags, you can use environment variables:

```bash
export GITHUB_TOKEN=ghp_xxx
export GITHUB_ORG=myorg
npx @sdh100shaun/hubhelper analyze
```

## Command Reference

### `analyze`

Analyze organization activity and detect security issues.

**Options:**
- `-o, --org <organization>` - GitHub organization name (default: from .env)
- `-t, --token <token>` - GitHub token (default: from .env)
- `-d, --days <number>` - Days to look back (default: 30)
- `--json <file>` - Save results as JSON
- `--html <file>` - Save results as HTML
- `--no-ai` - Disable AI insights

**Example:**
```bash
npm run dev analyze --org myorg --days 90 --html report.html
```

## Security Issues Detected

### 🔀 Self-Merges
Pull requests where the author merged their own changes without external review.

**Severity:** Medium to High (High if security-related)

### 🔒 Security PRs
Pull requests containing security-related changes.

**Severity:** Low to Critical (based on keywords and labels)

### ⚙️ Disabled Actions
Repositories with GitHub Actions disabled, missing automated security scanning.

**Severity:** Medium

### ⏸️ Paused Workflows
Workflows that have been automatically paused due to repository inactivity (60 days). GitHub automatically disables scheduled workflows when a repository has no activity.

**Severity:** Medium (for scheduled workflows), Low (for other workflows)

### 🚫 Disabled Workflows
Workflows that have been manually disabled by a user.

**Severity:** Low

### ⚠️ Unreviewed Security PRs
Security-related pull requests merged without external review.

**Severity:** Critical

## Architecture

```
src/
├── types/           # TypeScript interfaces and types
├── services/        # GitHub data fetching
├── analyzers/       # Security analysis logic
│   ├── security-analyzer.ts  # Core detection algorithms
│   └── ai-analyzer.ts        # AI-powered insights
└── reporters/       # Output formatting
    ├── console-reporter.ts   # Terminal output
    ├── json-reporter.ts      # JSON export
    └── html-reporter.ts      # HTML reports
```

## Development

Build the project:

```bash
npm run build
```

Run in development mode:

```bash
npm run dev
```

Lint and format code:

```bash
npm run lint          # Check for issues
npm run lint:fix      # Fix issues automatically
npm run format        # Format code
```

## Publishing to npm

This package is automatically published to npm via GitHub Actions when a new release is created.

### Automated Publishing

1. Create a new release on GitHub
2. The `npm-publish.yml` workflow automatically builds and publishes
3. Package is available via `npx @sdh100shaun/hubhelper`

### Manual Publishing

For manual publishing (requires npm token):

```bash
npm run build
npm publish
```

**Note:** You need to set the `NPM_TOKEN` secret in your GitHub repository settings for automated publishing.

## Technologies

- **TypeScript** - Type-safe development
- **GitHub Copilot SDK** - AI-powered analysis
- **Octokit** - GitHub API client
- **Commander.js** - CLI framework
- **Chalk** - Terminal styling
- **Ora** - Loading spinners
- **Biome** - Fast linter and formatter

## Example Output

```
════════════════════════════════════════════════════════════════════════════════
  GitHub Organization Security Analysis
════════════════════════════════════════════════════════════════════════════════

📊 Summary:
Analyzed 45 repositories and 123 pull requests. Found 12 total issues:
2 critical, 3 high, 5 medium, 2 low severity.

📈 Statistics:
  ├─ Total Repositories: 45
  ├─ Total Pull Requests: 123
  ├─ Self-Merges: 8
  ├─ Security PRs: 15
  └─ Repos with Disabled Actions: 5

🤖 AI-Powered Insights:
=== Security Analysis Insights ===

📊 Issue Detection Rate: 9.8% of PRs flagged
⚠️ Self-Merge Rate: 6.5% (8/123 PRs)
🔒 Security PRs: 15 detected
⚙️ Actions Disabled: 11.1% of repos (5/45)

💡 Recommendations:
  1. 🔒 Enable branch protection rules requiring at least one approving review
  2. 🛡️ Require mandatory security team review for security-related changes
  3. ⚙️ Enable GitHub Actions for automated CI/CD and security scanning
  4. ⚠️ URGENT: Address 2 critical security issues immediately
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## About

Built with the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) to help organizations maintain security best practices across their repositories.
