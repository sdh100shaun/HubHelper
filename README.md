# GitHub Security Analysis Tools

AI-powered tools to visualize GitHub activity and flag security issues across organizations using the GitHub Copilot SDK.

## Features

🔍 **Comprehensive Analysis**
- Detects self-merged pull requests
- Identifies security-related PRs
- Flags repositories with disabled GitHub Actions
- Highlights unreviewed security changes

🤖 **AI-Powered Insights**
- Pattern detection across repositories
- Risk assessment and prioritization
- Smart recommendations using AI analysis

📊 **Multiple Output Formats**
- Beautiful console output with colors
- JSON export for automation
- HTML reports for sharing

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_ORG=your_organization_name
```

### GitHub Token Permissions

Your GitHub personal access token needs the following scopes:
- `repo` - Full control of private repositories
- `read:org` - Read org and team membership
- `admin:org` - Full control of orgs (for Actions settings)

[Create a token here](https://github.com/settings/tokens/new)

## Usage

### Analyze Organization

Analyze all repositories and pull requests in an organization:

```bash
npm run dev analyze
```

With custom options:

```bash
npm run dev analyze --org myorg --days 60
```

### Export Results

Save results as JSON:

```bash
npm run dev analyze --json results.json
```

Save as HTML report:

```bash
npm run dev analyze --html report.html
```

Both formats:

```bash
npm run dev analyze --json results.json --html report.html
```

### Disable AI Insights

Run analysis without AI-powered recommendations:

```bash
npm run dev analyze --no-ai
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
