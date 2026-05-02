# HubHelper

[![CI](https://github.com/sdh100shaun/gh-tools/workflows/CI/badge.svg)](https://github.com/sdh100shaun/gh-tools/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![npm version](https://img.shields.io/npm/v/@sdh100shaun/hubhelper)](https://www.npmjs.com/package/@sdh100shaun/hubhelper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered policy-driven security analysis tool for GitHub organizations. Uses declarative YAML policies to detect security issues, enforce compliance controls, and generate standardized reports.

## Features

🎯 **Policy-Driven Analysis**
- Declarative YAML-based control catalog (OSCAL 1.1.2-compatible schema)
- Customizable security profiles (default, strict)
- Framework mappings (NIST 800-53, CIS Controls)
- Extensible evaluator architecture
- Zero hardcoded detection logic

🔍 **Comprehensive Security Controls**
- Detects self-merged pull requests
- Identifies security-related PRs and unreviewed changes
- Flags repositories with disabled GitHub Actions
- Detects paused/disabled workflows (including scheduled workflows)
- Monitors for repeated action failures
- Meta-controls for security PR volume recommendations

🤖 **AI-Powered Insights**
- Pattern detection across repositories
- Risk assessment and prioritization
- Smart recommendations using AI analysis

📊 **Multiple Output Formats**
- Beautiful console output with colors
- JSON export for automation
- HTML reports for sharing
- **SARIF 2.1.0 for GitHub Code Scanning**
- **Compliance framework reports** (JSON, text, markdown, HTML)

⚡ **Automation Ready**
- Schedule security scans with GitHub Actions
- GitHub Code Scanning integration via SARIF upload
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

Save results in multiple formats:

```bash
# JSON export
npx @sdh100shaun/hubhelper analyze --org myorg --json results.json

# HTML report
npx @sdh100shaun/hubhelper analyze --org myorg --html report.html

# SARIF for GitHub Code Scanning
npx @sdh100shaun/hubhelper analyze --org myorg --sarif results.sarif

# Compliance framework report
npx @sdh100shaun/hubhelper analyze --org myorg --compliance compliance.html --compliance-format html

# All formats at once
npx @sdh100shaun/hubhelper analyze --org myorg \
  --json results.json \
  --html report.html \
  --sarif results.sarif \
  --compliance compliance.json
```

### Use Custom Policy Profiles

Use built-in profiles or create your own:

```bash
# Use strict profile (higher severity, stricter thresholds)
npx @sdh100shaun/hubhelper analyze --org myorg --profile policies/strict.yaml

# Use custom profile
npx @sdh100shaun/hubhelper analyze --org myorg --profile my-custom-policy.yaml

# Legacy mode (deprecated - uses hardcoded detection)
npx @sdh100shaun/hubhelper analyze --org myorg --legacy
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

Analyze organization activity and detect security issues using policy-driven controls.

**Options:**
- `-o, --org <organization>` - GitHub organization name (default: from .env)
- `-t, --token <token>` - GitHub token (default: from .env)
- `-d, --days <number>` - Days to look back (default: 30)
- `--profile <file>` - Policy profile to use (default: policies/default.yaml)
- `--legacy` - Use legacy hardcoded analysis (deprecated)
- `--json <file>` - Save results as JSON
- `--html <file>` - Save results as HTML
- `--sarif <file>` - Save results as SARIF for GitHub Code Scanning
- `--compliance <file>` - Save compliance framework report
- `--compliance-format <format>` - Compliance report format: json, text, markdown, html (default: json)
- `--no-ai` - Disable AI insights

**Examples:**
```bash
# Basic analysis with default policy
npm run dev analyze --org myorg --days 90

# Use strict policy profile
npm run dev analyze --org myorg --profile policies/strict.yaml

# Generate SARIF for GitHub Code Scanning
npm run dev analyze --org myorg --sarif results.sarif

# Generate compliance report
npm run dev analyze --org myorg --compliance compliance.html --compliance-format html

# All outputs
npm run dev analyze --org myorg --json results.json --html report.html --sarif results.sarif --compliance compliance.json
```

### Policy Profiles

HubHelper uses YAML-based policy profiles to define security controls:

- `policies/default.yaml` - Balanced security controls (default)
- `policies/strict.yaml` - Stricter thresholds and elevated severities

Create custom profiles by extending the catalog in `policies/catalog.yaml`.

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

### 🔁 Repeated Action Failures
Workflows with repeated failures in recent runs, indicating potential CI/CD issues.

**Severity:** Medium

## GitHub Code Scanning Integration

HubHelper generates SARIF 2.1.0 format reports compatible with GitHub Code Scanning:

```bash
# Generate SARIF report
npx @sdh100shaun/hubhelper analyze --org myorg --sarif results.sarif

# Upload to GitHub Code Scanning (requires GitHub CLI)
gh api repos/OWNER/REPO/code-scanning/sarifs \
  -X POST \
  -F "sarif=@results.sarif" \
  -F "commit_sha=$(git rev-parse HEAD)" \
  -F "ref=refs/heads/$(git branch --show-current)"
```

SARIF reports include:
- Control rules with framework mappings
- Security severity scores (1.0-10.0 scale)
- Location information (workflows, PRs, repositories)
- Detailed descriptions with compliance references

See [GitHub Code Scanning documentation](https://docs.github.com/en/code-security/code-scanning) for automation setup.

## Compliance Framework Reporting

Generate compliance reports showing control mappings to security frameworks:

```bash
# JSON compliance report
npx @sdh100shaun/hubhelper analyze --org myorg --compliance report.json

# HTML compliance dashboard
npx @sdh100shaun/hubhelper analyze --org myorg --compliance report.html --compliance-format html

# Markdown compliance report
npx @sdh100shaun/hubhelper analyze --org myorg --compliance report.md --compliance-format markdown

# Text summary
npx @sdh100shaun/hubhelper analyze --org myorg --compliance report.txt --compliance-format text
```

**Supported Frameworks:**
- **NIST 800-53** - Security and Privacy Controls
- **CIS Controls** - Center for Internet Security Controls

Compliance reports show:
- Controls mapped to each framework
- Compliance status (compliant/non-compliant)
- Compliance rate percentages
- Detailed issue listings for non-compliant controls

## Architecture

### Policy-Driven Design

HubHelper uses a declarative policy engine to evaluate security controls:

```
policies/
├── catalog.yaml         # Security control definitions
├── default.yaml         # Default profile (balanced)
└── strict.yaml          # Strict profile (high security)

src/
├── policy/              # Policy engine
│   ├── engine.ts        # Policy evaluation orchestrator
│   ├── loader.ts        # YAML policy loader
│   ├── resolver.ts      # Control resolution and tailoring
│   ├── evaluator-registry.ts  # Evaluator registration
│   └── types.ts         # Policy types and schemas
├── evaluators/          # Control evaluators
│   ├── base-evaluator.ts      # Shared evaluation logic
│   ├── self-merge-evaluator.ts
│   ├── security-pr-classifier.ts
│   ├── disabled-actions-evaluator.ts
│   ├── paused-workflow-evaluator.ts
│   ├── disabled-workflow-evaluator.ts
│   ├── action-failure-evaluator.ts
│   ├── repeated-failure-classifier.ts
│   └── security-pr-volume-evaluator.ts
├── reporters/           # Output formatters
│   ├── console-reporter.ts    # Terminal output
│   ├── json-reporter.ts       # JSON export
│   ├── html-reporter.ts       # HTML reports
│   ├── sarif-reporter.ts      # SARIF 2.1.0 (GitHub Code Scanning)
│   └── compliance-reporter.ts # Framework compliance reports
├── services/            # GitHub data fetching
├── analyzers/           # AI-powered insights
│   ├── security-analyzer.ts   # Legacy analyzer (deprecated)
│   └── ai-analyzer.ts         # AI recommendations
└── types/               # TypeScript interfaces
```

### Control Catalog

Controls are defined in `policies/catalog.yaml` with:
- Unique control ID (e.g., `HH-GH-001`)
- Control statement describing the requirement
- Family categorization (pull-request, workflow, repository, meta)
- Evaluator configuration (kind, detector, parameters)
- Default severity level
- Framework mappings (NIST 800-53, CIS Controls)

The catalog schema follows **OSCAL 1.1.2** (Open Security Controls Assessment Language) conventions — catalog, profile, and tailoring concepts map directly to OSCAL document types.

### Evaluation Flow

1. **Load Policy**: Parse YAML profile and resolve control catalog
2. **Evaluate Controls**: Execute evaluators based on control configuration
3. **Collect Issues**: Aggregate security findings from evaluators
4. **Generate Reports**: Output in requested formats (console, JSON, HTML, SARIF, compliance)

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

Policy: HubHelper Default Security Profile
Controls evaluated: 9
Execution time: 1250ms

📊 Summary:
Found 12 security issues across 45 repositories

📈 Statistics:
  ├─ Total Repositories: 45
  ├─ Total Pull Requests: 123
  ├─ Self-Merges: 8
  ├─ Security PRs: 15
  ├─ Repos with Disabled Actions: 5
  ├─ Paused Workflows: 3
  └─ Disabled Workflows: 2

🔍 Issues by Severity:
  ├─ Critical: 2
  ├─ High: 3
  ├─ Medium: 5
  └─ Low: 2

📋 Security Issues:

[CRITICAL] Unreviewed Security PR
  Repository: myorg/api-server
  PR #456: Update authentication library
  Merged: 2024-04-20 by alice
  Control: HH-GH-002 (NIST 800-53: SA-11, CIS: 16.11)

[HIGH] Self-Merged Pull Request
  Repository: myorg/frontend
  PR #789: Add admin dashboard
  Merged: 2024-04-19 by bob
  Control: HH-GH-001 (NIST 800-53: CM-3, CIS: 14.6)

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
  4. 🤖 Consider implementing automated dependency updates with Dependabot
  5. ⚠️ URGENT: Address 2 critical security issues immediately
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## About

Built with the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) to help organizations maintain security best practices across their repositories.
