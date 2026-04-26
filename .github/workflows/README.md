# GitHub Workflows

This directory contains GitHub Actions workflows for the gh-security-tools project.

## Available Workflows

### 1. CI Workflow (`ci.yml`)

Runs on every push and pull request to ensure code quality.

**Triggers:**
- Push to any branch
- Pull requests

**Jobs:**
- Linting (Biome)
- TypeScript compilation
- Unit tests (172 tests)
- Coverage reporting (requires ≥75%)

### 2. Documentation Deployment (`deploy-docs.yml`)

Deploys documentation site to GitHub Pages.

**Triggers:**
- Push to `main` branch (when docs/ changes)
- Manual workflow dispatch

**Deployment:**
- Builds Eleventy static site
- Deploys to GitHub Pages
- Available at: https://sdh100shaun.github.io/gh-tools/

### 3. npm Publishing (`npm-publish.yml`)

Publishes package to npm registry.

**Triggers:**
- GitHub Release (published)
- Manual workflow dispatch

**Requirements:**
- `NPM_TOKEN` secret configured
- Runs linting and build before publishing
- Publishes with provenance for security

### 4. Scheduled Security Scan (`scheduled-security-scan.yml`) ⭐

**Example workflow** demonstrating automated security scanning using GitHub Apps.

**Triggers:**
- Schedule: Every Monday at 9:00 AM UTC (configurable)
- Manual workflow dispatch (for testing)

**Features:**
- Uses GitHub App authentication (more secure than tokens)
- Runs security analysis across organization
- Generates JSON and HTML reports
- Creates GitHub issues for critical findings
- Uploads artifacts with 90-day retention

**Setup Required:**
1. Create a GitHub App (see [documentation](https://sdh100shaun.github.io/gh-tools/pages/github-app/))
2. Add secrets to repository:
   - `SECURITY_SCANNER_APP_ID`
   - `SECURITY_SCANNER_APP_PRIVATE_KEY`
3. Enable workflow in Actions tab

**Note:** This workflow is provided as an example. You can copy it to your own repositories to run automated security scans.

## Using the Scheduled Scan in Your Organization

### Quick Setup

1. **Copy the workflow file** to your repository:
   ```bash
   mkdir -p .github/workflows
   curl -o .github/workflows/security-scan.yml \
     https://raw.githubusercontent.com/sdh100shaun/gh-tools/main/.github/workflows/scheduled-security-scan.yml
   ```

2. **Create a GitHub App**:
   - Follow the [GitHub App Setup Guide](https://sdh100shaun.github.io/gh-tools/pages/github-app/)
   - Required permissions:
     - Actions: Read
     - Pull requests: Read
     - Issues: Write (optional - for creating issues)
     - Metadata: Read

3. **Add repository secrets**:
   ```bash
   # Go to: Repository Settings → Secrets → Actions
   # Add:
   SECURITY_SCANNER_APP_ID=<your-app-id>
   SECURITY_SCANNER_APP_PRIVATE_KEY=<your-private-key>
   ```

4. **Customize schedule** (optional):
   ```yaml
   on:
     schedule:
       # Change to your preferred schedule
       - cron: '0 9 * * 1'  # Every Monday at 9 AM UTC
   ```

5. **Commit and push**:
   ```bash
   git add .github/workflows/security-scan.yml
   git commit -m "feat: Add automated security scanning"
   git push
   ```

6. **Test manually**:
   - Go to Actions tab
   - Select "Scheduled Security Scan"
   - Click "Run workflow"
   - Select branch and click "Run workflow"

### Customization Options

#### Change Analysis Period

```yaml
workflow_dispatch:
  inputs:
    days:
      default: '30'  # Analyze last 30 days instead of 7
```

#### Change Schedule

```yaml
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
    # or
    - cron: '0 9 * * 1-5'  # Weekdays at 9 AM UTC
```

#### Adjust Critical Thresholds

```yaml
- name: Check for critical issues
  run: |
    SELF_MERGES=$(jq '.summary.totalSelfMerges // 0' security-report.json)

    # Raise threshold to 10
    if [ "$SELF_MERGES" -gt 10 ]; then
      echo "has_critical=true" >> $GITHUB_OUTPUT
    fi
```

#### Add Notifications

```yaml
- name: Send Slack notification
  if: steps.check-issues.outputs.has_critical == 'true'
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "Security scan found issues: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
      }
```

#### Scan Multiple Organizations

```yaml
strategy:
  matrix:
    org: [org1, org2, org3]

steps:
  - name: Run security analysis
    env:
      GITHUB_ORG: ${{ matrix.org }}
    run: gh-security analyze --org "$GITHUB_ORG"
```

## Workflow Security

### Best Practices

1. **Use GitHub Apps instead of tokens** for automated workflows
   - Tokens expire automatically (1 hour)
   - Better audit trail
   - Separate identity from users
   - See [GitHub App documentation](https://sdh100shaun.github.io/gh-tools/pages/github-app/)

2. **Store secrets securely**
   - Use repository/organization secrets
   - Never commit tokens to git
   - Limit access to secrets

3. **Review workflow permissions**
   - Use minimum required permissions
   - Avoid `write-all` or `contents: write` unless necessary

4. **Monitor workflow runs**
   - Check Actions tab regularly
   - Review artifacts and logs
   - Investigate failed runs

## Troubleshooting

### Workflow doesn't run on schedule

- Verify workflow is on default branch (main/master)
- Check Actions are enabled in repository settings
- Scheduled workflows pause after 60 days of repository inactivity
- Run manually to reactivate

### "Bad credentials" error

- Verify App ID is correct
- Check private key is complete (including BEGIN/END lines)
- Ensure GitHub App is installed on organization
- Regenerate private key if needed

### "Resource not accessible by integration"

- Check GitHub App permissions
- Verify app has required permissions:
  - Actions: Read
  - Pull requests: Read
  - Metadata: Read
- Save permissions and wait 60 seconds for propagation

### No artifacts uploaded

- Check workflow completed successfully
- Verify upload-artifact step ran
- Artifacts expire after retention period (90 days default)
- Download before expiration


