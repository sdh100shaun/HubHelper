# Repository List Management

## Overview

The repository list management feature allows you to create curated lists of repositories and generate comprehensive reports with multiple export formats.

## Features

- ✅ Create and manage named repository lists
- ✅ Add/remove repositories from lists
- ✅ Generate comprehensive reports
- ✅ Export in multiple formats (JSON, CSV, Markdown)
- ✅ Security and activity metrics
- ✅ Automated recommendations

## Quick Start

### Creating a List

```bash
# Create a new list
hubhelper list create production --description "Production repositories"

# Add repositories
hubhelper list add production myorg/api-gateway
hubhelper list add production myorg/auth-service
hubhelper list add production myorg/web-app
```

### Viewing Lists

```bash
# Show all lists
hubhelper list show

# Show repositories in a list
hubhelper list repos production
```

### Generating Reports

```bash
# Generate console report
hubhelper report production --org myorg --token ghp_xxx

# Export to JSON
hubhelper report production --format json --output report.json

# Export to CSV
hubhelper report production --format csv --output report.csv

# Export to Markdown
hubhelper report production --format markdown --output report.md
```

## CLI Commands

### List Management

#### `list create <name>`
Create a new repository list.

**Options:**
- `-d, --description <desc>` - List description

**Example:**
```bash
hubhelper list create critical-prod --description "Critical production services"
```

#### `list add <list> <repository>`
Add a repository to a list. Repository format: `org/repo`

**Example:**
```bash
hubhelper list add critical-prod myorg/payment-api
```

#### `list remove <list> <repository>`
Remove a repository from a list.

**Example:**
```bash
hubhelper list remove critical-prod myorg/old-service
```

#### `list show`
Display all repository lists.

**Example:**
```bash
hubhelper list show
```

#### `list repos <list>`
Show all repositories in a specific list.

**Example:**
```bash
hubhelper list repos critical-prod
```

#### `list delete <name>`
Delete a repository list.

**Example:**
```bash
hubhelper list delete old-list
```

### Report Generation

#### `report <list>`
Generate a report for a repository list.

**Options:**
- `-o, --org <organization>` - GitHub organization name
- `-t, --token <token>` - GitHub personal access token
- `--format <format>` - Output format: console, json, csv, markdown (default: console)
- `--output <file>` - Output file path

**Examples:**
```bash
# Console report
hubhelper report production

# JSON export
hubhelper report production --format json --output prod-report.json

# CSV export
hubhelper report production --format csv --output prod-report.csv

# Markdown export
hubhelper report production --format markdown --output prod-report.md
```

## Report Contents

### Summary Metrics

- Total repositories
- Actions enabled count
- Security enabled count
- Total issues
- Critical issues
- High issues

### Repository Details

For each repository:
- Name and full name
- GitHub URL
- Actions enabled status
- Security enabled status
- Number of security issues
- Last activity timestamp

### Recommendations

Automated recommendations based on:
- Repositories with Actions disabled
- Repositories with security features disabled
- Critical and high-priority issues

## Export Formats

### JSON Format

```json
{
  "list": "production",
  "generated": "2026-02-25T15:30:00.000Z",
  "summary": {
    "totalRepos": 5,
    "actionsEnabled": 4,
    "securityEnabled": 5,
    "totalIssues": 2,
    "criticalIssues": 0,
    "highIssues": 2
  },
  "repositories": [...],
  "recommendations": [...]
}
```

### CSV Format

```csv
Repository,URL,Actions Enabled,Security Enabled,Security Issues,Last Activity
myorg/api-gateway,https://github.com/myorg/api-gateway,Yes,Yes,0,2026-02-25T14:00:00Z
myorg/auth-service,https://github.com/myorg/auth-service,Yes,Yes,1,2026-02-25T13:30:00Z
```

### Markdown Format

Generates a formatted Markdown document with:
- Report title and metadata
- Summary table
- Recommendations list
- Repository table with status icons
- Footer

## Storage

Repository lists are stored in `.gh-lists/lists.json` in your project directory.

**Storage format:**
```json
{
  "lists": {
    "production": {
      "name": "production",
      "description": "Production repositories",
      "created": "2026-02-25T12:00:00Z",
      "updated": "2026-02-25T14:30:00Z",
      "repositories": [
        "myorg/api-gateway",
        "myorg/auth-service"
      ],
      "metadata": {
        "owner": "team-name",
        "tags": ["production", "critical"]
      }
    }
  }
}
```

## Use Cases

### 1. Production Monitoring

```bash
# Create production list
hubhelper list create production

# Add critical services
hubhelper list add production myorg/api
hubhelper list add production myorg/web
hubhelper list add production myorg/mobile

# Weekly report
hubhelper report production --format markdown --output weekly-report.md
```

### 2. Security Audit

```bash
# Create audit list
hubhelper list create security-audit

# Add repositories to audit
hubhelper list add security-audit myorg/auth
hubhelper list add security-audit myorg/payment

# Generate security-focused report
hubhelper report security-audit --format json --output audit-$(date +%Y%m%d).json
```

### 3. Team Tracking

```bash
# Track team repositories
hubhelper list create team-alpha

# Add team repos
for repo in api web mobile; do
  hubhelper list add team-alpha myorg/team-alpha-$repo
done

# Monthly report
hubhelper report team-alpha --format csv --output team-alpha-$(date +%Y%m).csv
```

## Best Practices

### List Organization

- **Use descriptive names**: `production`, `security-critical`, `team-frontend`
- **Add descriptions**: Helps team members understand the list purpose
- **Keep lists focused**: Don't mix unrelated repositories
- **Regular updates**: Remove archived or deprecated repositories

### Report Generation

- **Schedule reports**: Generate regular reports for tracking
- **Use appropriate formats**:
  - JSON for automation and data processing
  - CSV for spreadsheet analysis
  - Markdown for documentation
  - Console for quick checks
- **Archive reports**: Keep historical reports for trend analysis
- **Share reports**: Export and share with stakeholders

### Security

- **Store tokens securely**: Use environment variables
- **Review permissions**: Ensure GitHub token has minimum required scopes
- **Audit regularly**: Generate reports frequently for critical lists
- **Act on recommendations**: Follow up on security issues promptly

## Troubleshooting

### List not found

**Error**: `List 'name' not found`

**Solution**: Check available lists with `hubhelper list show`

### Invalid repository format

**Error**: `Invalid repository format: repo. Expected: org/repo`

**Solution**: Use full repository path: `org/repo` not just `repo`

### No repositories found

**Error**: `No repositories found for list 'name'`

**Solutions**:
- Verify repositories exist in the organization
- Check GitHub token has access to the repositories
- Ensure repository names match exactly (case-sensitive)

### Permission errors

**Error**: Permission denied when accessing repositories

**Solutions**:
- Verify `GITHUB_TOKEN` environment variable is set
- Check token has required scopes: `repo`, `read:org`
- Ensure you have access to the organization

## Limits and Considerations

- **API Rate Limits**: GitHub API has rate limits (5000/hour authenticated)
- **List Size**: No hard limit, but large lists (100+ repos) may take longer
- **Storage**: Lists stored locally in `.gh-lists/` directory
- **Caching**: Reports are generated fresh each time (no caching)

## Future Enhancements

Planned features for future releases:

- Historical trend tracking
- Repository comparison
- Custom report templates
- Scheduled report generation
- Email report delivery
- Integration with Slack/Teams
- Advanced filtering and search
- Batch operations
- Import/export list definitions

## Examples

### Complete Workflow

```bash
# 1. Create list
hubhelper list create infrastructure --description "Infrastructure repositories"

# 2. Add repositories
hubhelper list add infrastructure myorg/terraform
hubhelper list add infrastructure myorg/kubernetes
hubhelper list add infrastructure myorg/ansible

# 3. View list
hubhelper list repos infrastructure

# 4. Generate report
hubhelper report infrastructure --org myorg

# 5. Export to multiple formats
hubhelper report infrastructure --format json --output infra.json
hubhelper report infrastructure --format csv --output infra.csv
hubhelper report infrastructure --format markdown --output infra.md
```

## Related Documentation

- [Security Policy](../SECURITY.md)
- [Contributing Guide](CONTRIBUTING.md)
- [README](../README.md)

---

For questions or issues, please open an issue on GitHub.
