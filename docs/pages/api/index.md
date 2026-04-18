---
layout: page.njk
title: API Reference
description: Complete command-line interface reference for HubHelper
githubEdit: true
---

## Command Overview

The `hubhelper` CLI provides commands for analyzing GitHub organization security:

```bash
hubhelper <command> [options]
```

Available commands:
- `analyze` - Analyze organization activity and detect security issues
- `check-repo` - Check a specific repository (coming soon)
- `watch` - Real-time monitoring (coming soon)

## analyze

Analyze an entire GitHub organization for security issues.

### Synopsis

```bash
hubhelper analyze [options]
npx @sdh100shaun/hubhelper analyze [options]
```

### Options

#### `-o, --org <organization>`

GitHub organization name to analyze.

- **Type**: `string`
- **Required**: Yes (unless `GITHUB_ORG` environment variable is set)
- **Validation**: Must be a valid GitHub organization name (1-39 alphanumeric characters and hyphens)
- **Example**: `--org my-company`

```bash
npx @sdh100shaun/hubhelper analyze --org github
```

#### `-t, --token <token>`

GitHub Personal Access Token for authentication.

- **Type**: `string`
- **Required**: Yes (unless `GITHUB_TOKEN` environment variable is set)
- **Scopes Required**:
  - `repo` - Full control of private repositories
  - `read:org` - Read org and team membership
  - `admin:org` - Full control of orgs
- **Example**: `--token ghp_xxxxxxxxxxxxxxxxxxxx`

```bash
npx @sdh100shaun/hubhelper analyze \
  --org myorg \
  --token ghp_xxxxxxxxxxxxxxxxxxxx
```

**Security Note**: Never commit tokens to version control. Use environment variables or `.env` files.

#### `-d, --days <number>`

Number of days to look back for pull request analysis.

- **Type**: `integer`
- **Default**: `30`
- **Range**: `1-365`
- **Validation**: Must be a positive integer, no decimals
- **Example**: `--days 90`

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --days 60
```

**Note**: Larger ranges may take longer to process and consume more API quota.

#### `--json <file>`

Save analysis results as JSON to the specified file.

- **Type**: `string` (file path)
- **Required**: No
- **Validation**: Must have `.json` extension, path must be in current directory or subdirectory
- **Security**: Path traversal is blocked for security
- **Example**: `--json results.json`

```bash
npx @sdh100shaun/hubhelper analyze \
  --org myorg \
  --json reports/analysis-2026-01-24.json
```

Output includes:
- All detected security issues with full details
- Statistics and metrics
- AI-generated recommendations (if enabled)
- Timestamp and metadata

#### `--html <file>`

Save analysis results as an HTML report to the specified file.

- **Type**: `string` (file path)
- **Required**: No
- **Validation**: Must have `.html` extension, path must be in current directory or subdirectory
- **Security**: XSS protection with Content Security Policy headers
- **Example**: `--html report.html`

```bash
npx @sdh100shaun/hubhelper analyze \
  --org myorg \
  --html reports/security-report.html
```

The HTML report includes:
- Executive summary with key statistics
- Visual charts and graphs
- Color-coded severity indicators
- AI insights (if enabled)
- Detailed issue breakdown
- Actionable recommendations

#### `--no-ai`

Disable AI-powered insights and recommendations.

- **Type**: `boolean` (flag)
- **Default**: AI enabled
- **Example**: `--no-ai`

```bash
npx @sdh100shaun/hubhelper analyze --org myorg --no-ai
```

Use this flag when:
- You want faster analysis
- You only need raw data
- AI insights are not needed for automation

### Examples

#### Basic Analysis

Analyze an organization using environment variables:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
export GITHUB_ORG=myorg

npx @sdh100shaun/hubhelper analyze
```

#### Full Analysis with All Options

Comprehensive analysis with custom time range and both output formats:

```bash
npx @sdh100shaun/hubhelper analyze \
  --org mycompany \
  --token ghp_xxxxxxxxxxxxxxxxxxxx \
  --days 90 \
  --json analysis.json \
  --html report.html
```

#### Quick Check Without AI

Fast analysis of the last week:

```bash
npx @sdh100shaun/hubhelper analyze \
  --org myorg \
  --days 7 \
  --no-ai
```

#### CI/CD Pipeline Integration

Automated analysis in continuous integration:

```bash
npx @sdh100shaun/hubhelper analyze \
  --org $ORG_NAME \
  --token $GITHUB_TOKEN \
  --days 30 \
  --json security-findings.json \
  --no-ai
```

### Exit Codes

- `0` - Success
- `1` - Error (configuration, API, or validation error)

### Output Format

#### Console Output

Displays:
1. Analysis summary
2. Key statistics
3. AI-powered insights (if enabled)
4. Security issues grouped by type and severity
5. Recommendations

#### JSON Output

```json
{
  "summary": "Analyzed 45 repositories and 123 pull requests...",
  "statistics": {
    "total_repos": 45,
    "total_prs": 123,
    "self_merges": 8,
    "security_prs": 15,
    "repos_with_disabled_actions": 5,
    "paused_workflows": 3,
    "disabled_workflows": 2
  },
  "issues": [
    {
      "type": "self-merge",
      "severity": "high",
      "repository": "myorg/critical-app",
      "description": "User alice merged their own pull request",
      "details": {
        "pr_number": 42,
        "title": "Add authentication bypass",
        "url": "https://github.com/myorg/critical-app/pull/42",
        "author": "alice",
        "merged_by": "alice",
        "merged_at": "2026-01-20T10:30:00Z"
      },
      "detected_at": "2026-01-24T12:00:00Z"
    }
  ],
  "recommendations": [
    "Enable branch protection rules requiring at least one approving review",
    "Require mandatory security team review for security-related changes"
  ]
}
```

## check-repo (Coming Soon)

Check a specific repository for security issues.

### Synopsis

```bash
hubhelper check-repo <owner/repo> [options]
```

### Planned Options

- `-t, --token <token>` - GitHub token
- `-d, --days <number>` - Days to look back
- `--json <file>` - Save as JSON
- `--html <file>` - Save as HTML

## watch (Coming Soon)

Monitor an organization in real-time for security issues.

### Synopsis

```bash
hubhelper watch [options]
```

### Planned Options

- `-o, --org <organization>` - Organization to watch
- `-t, --token <token>` - GitHub token
- `-i, --interval <minutes>` - Check interval (default: 60)
- `--alert-on <severity>` - Minimum severity for alerts

## Environment Variables

### GITHUB_TOKEN

GitHub Personal Access Token for API authentication.

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

**Required Scopes**:
- `repo` - Full control of private repositories
- `read:org` - Read org and team membership
- `admin:org` - Full control of orgs

### GITHUB_ORG

Default GitHub organization to analyze.

```bash
export GITHUB_ORG=mycompany
```

Allows running the tool without the `--org` flag.

### Using .env Files

Create a `.env` file in your project root:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=mycompany
```

The tool automatically loads these variables.

## Security Features

### Input Validation

All user inputs are validated before processing:

- **Organization Names**: Must match GitHub's naming rules (alphanumeric + hyphens, 1-39 chars)
- **Days Parameter**: Must be an integer between 1-365
- **File Paths**: Restricted to current directory and subdirectories (no `../` or absolute paths)
- **GitHub Tokens**: Basic format validation

### XSS Protection

HTML reports include:
- Content Security Policy (CSP) headers
- All user-controlled data is escaped
- URL validation (blocks `javascript:` and `data:` URIs)

### Path Traversal Protection

File operations are secured:
- Blocks parent directory access (`../`)
- Blocks absolute paths (`/etc/passwd`)
- Only allows safe file extensions (`.json`, `.html`)
- Validates path length

## Rate Limiting

GitHub API has rate limits:

- **Unauthenticated**: 60 requests/hour
- **Authenticated**: 5,000 requests/hour
- **GraphQL**: 5,000 points/hour

The tool respects these limits. For large organizations, you may need to:
- Reduce the `--days` parameter
- Run analysis less frequently
- Use pagination (handled automatically)

## Error Handling

### Configuration Errors

```
Error: GitHub token is required
→ Set GITHUB_TOKEN environment variable or use --token flag
```

Solution: Provide a valid GitHub token.

### Validation Errors

```
Error: Invalid organization name format
→ Must be alphanumeric with hyphens, cannot start or end with hyphen
```

Solution: Use a valid GitHub organization name.

### API Errors

```
Error: API rate limit exceeded
→ Try again in 60 minutes
```

Solution: Wait for rate limit reset or authenticate with a token.

### Security Errors

```
Security error: path traversal detected
→ Files can only be saved in current directory or subdirectories
```

Solution: Use relative paths without `../`.

## TypeScript Types

For integration with TypeScript projects, see the exported types:

```typescript
import type {
  SecurityIssue,
  AnalysisResult,
  SecurityIssueType,
  SeverityLevel
} from '@sdh100shaun/hubhelper';
```

## Next Steps

- [Read the Security documentation](/pages/security/) for best practices
- [Learn how to contribute](/pages/contributing/) to the project
- [Check out examples](/pages/getting-started/#common-workflows) for common use cases
