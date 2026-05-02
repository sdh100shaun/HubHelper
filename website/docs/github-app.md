---
sidebar_position: 6
title: GitHub App Setup
description: Set up automated scanning with a GitHub App for CI/CD environments
---

## GitHub App Authentication

GitHub Apps provide a more secure and scalable way to authenticate automated workflows compared to personal access tokens. This guide shows you how to set up a GitHub App for automated security scanning.

## Why Use GitHub Apps?

### Advantages Over Personal Access Tokens

| Feature | GitHub App | Fine-Grained Token | Classic Token |
|---------|------------|-------------------|---------------|
| **Security** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Permissions** | Granular | Granular | Broad scopes |
| **Identity** | Bot account | Personal account | Personal account |
| **Rate limits** | Higher (5000/hr) | Standard (5000/hr) | Standard (5000/hr) |
| **Expiration** | Tokens auto-expire (1hr) | Manual (90 days) | Manual or none |
| **Audit trail** | Separate from users | Personal | Personal |
| **Org management** | Centralized | Per-user | Per-user |
| **Revocation impact** | App only | User's access | User's access |
| **Installation** | Per-org/repo | Per-user | Per-user |

### When to Use GitHub Apps

**Use GitHub Apps for:**
- ✅ Automated scheduled workflows (daily/weekly scans)
- ✅ CI/CD pipelines and automation
- ✅ Organisation-wide tools that multiple teams use
- ✅ Production systems requiring high uptime
- ✅ Services that need separate identity from users
- ✅ Tools requiring higher rate limits

**Use Fine-Grained Tokens for:**
- ✅ Personal/local development and testing
- ✅ One-off manual analysis
- ✅ Individual contributor workflows
- ✅ Quick prototyping and experimentation

## Setting Up a GitHub App

### Step 1: Create the GitHub App

1. **Navigate to GitHub Settings**
   - For organization: `https://github.com/organizations/YOUR_ORG/settings/apps`
   - For personal: `https://github.com/settings/apps`

2. **Click "New GitHub App"**

3. **Configure Basic Information**

   | Field | Value |
   |-------|-------|
   | **GitHub App name** | `Security Scanner` (must be unique) |
   | **Description** | `Automated security analysis for organisation repositories` |
   | **Homepage URL** | `https://github.com/sdh100shaun/gh-tools` |
   | **Webhook** | Uncheck "Active" (not needed for this use case) |

4. **Set Permissions**

   **Repository permissions:**
   - ✅ **Actions**: Read
   - ✅ **Pull requests**: Read
   - ✅ **Metadata**: Read (automatic)
   - ✅ **Administration**: Read (optional - for security settings)
   - ⚠️ **Issues**: Write (optional - for creating issues from findings)

   **Organisation permissions:**
   - ❌ None required

   **Account permissions:**
   - ❌ None required

5. **Where can this GitHub App be installed?**
   - Select "Only on this account" (recommended)

6. **Click "Create GitHub App"**

### Step 2: Generate Private Key

After creating the app:

1. Scroll down to **Private keys** section
2. Click **"Generate a private key"**
3. A `.pem` file will download automatically
4. **Store this securely** - you cannot download it again

**Security Note:** This private key is extremely sensitive. Never commit it to version control.

### Step 3: Install the App

1. Go to your app's settings page
2. Click **"Install App"** in the left sidebar
3. Select the organisation to install it on
4. Choose repository access:
   - **All repositories** (for organisation-wide scanning)
   - **Select repositories** (for limited scope)
5. Click **"Install"**

### Step 4: Get App Credentials

You need two values for GitHub Actions:

**App ID:**
```bash
# Found in app settings under "About"
# Example: 123456
```

**Private Key:**
```bash
# The .pem file you downloaded
# Example: -----BEGIN RSA PRIVATE KEY-----
# MIIEpAIBAAKCAQEA...
# -----END RSA PRIVATE KEY-----
```

### Step 5: Add Secrets to Repository

1. Go to your repository settings: `https://github.com/YOUR_ORG/YOUR_REPO/settings/secrets/actions`
2. Click **"New repository secret"**

**Add App ID:**
- **Name:** `SECURITY_SCANNER_APP_ID`
- **Value:** Your App ID (e.g., `123456`)

**Add Private Key:**
- **Name:** `SECURITY_SCANNER_APP_PRIVATE_KEY`
- **Value:** Entire contents of `.pem` file including `BEGIN` and `END` lines

### Step 6: Use in Workflow

The scheduled workflow automatically uses the app credentials:

```yaml
- name: Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.SECURITY_SCANNER_APP_ID }}
    private-key: ${{ secrets.SECURITY_SCANNER_APP_PRIVATE_KEY }}
    owner: ${{ github.repository_owner }}

- name: Run security analysis
  env:
    GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}
  run: gh-security analyze --org ${{ github.repository_owner }}
```

## Scheduled Workflow Setup

### Quick Start

1. **Copy the example workflow**

   The repository includes `.github/workflows/scheduled-security-scan.yml` as an example.

2. **Configure schedule**

   Edit the cron expression to match your needs:

   ```yaml
   on:
     schedule:
       # Every Monday at 9 AM UTC
       - cron: '0 9 * * 1'
       # Every day at 6 AM UTC
       # - cron: '0 6 * * *'
   ```

3. **Set up GitHub App** (see steps above)

4. **Commit workflow to main branch**

   ```bash
   git add .github/workflows/scheduled-security-scan.yml
   git commit -m "feat: Add scheduled security scanning workflow"
   git push origin main
   ```

5. **Verify workflow**

   - Go to Actions tab
   - Find "Scheduled Security Scan"
   - Click "Run workflow" to test manually

### Schedule Examples

```yaml
# Every hour
- cron: '0 * * * *'

# Every day at 6 AM UTC
- cron: '0 6 * * *'

# Every Monday at 9 AM UTC
- cron: '0 9 * * 1'

# Every weekday at 8 AM UTC
- cron: '0 8 * * 1-5'

# First day of every month at midnight UTC
- cron: '0 0 1 * *'

# Every 6 hours
- cron: '0 */6 * * *'
```

**Use [crontab.guru](https://crontab.guru/) to validate cron expressions.**

### Workflow Features

The example workflow includes:

#### 1. Automated Scanning

Runs on a schedule without manual intervention:
- Analyses organisation repositories
- Generates JSON and HTML reports
- Uploads artifacts for review

#### 2. Critical Issue Detection

Automatically checks for threshold violations:
- Self-merged PRs > 5
- Disabled Actions > 3
- Can be customised in workflow

#### 3. Automated Issue Creation

Creates GitHub issues when critical findings detected:
- Summary of findings
- Links to full reports
- Tagged with `security` and `automated-scan`

#### 4. Report Artifacts

Stores reports for 90 days:
- JSON format for programmatic access
- HTML format for visual review
- Available in Actions tab

#### 5. Workflow Summary

Posts summary to Actions run:
- Total repositories scanned
- Key findings
- Links to artifacts

## Customising the Workflow

### Change Analysis Period

```yaml
workflow_dispatch:
  inputs:
    days:
      default: '7'  # Change to 14, 30, etc.
```

### Change Output Format

```yaml
- name: Run security analysis
  run: |
    gh-security analyze \
      --org "$GITHUB_ORG" \
      --days 30 \
      --json report.json \
      --html report.html \
      --console  # Add console output
```

### Adjust Critical Thresholds

```yaml
- name: Check for critical issues
  run: |
    SELF_MERGES=$(jq '.summary.totalSelfMerges // 0' security-report.json)

    # Change threshold from 5 to 10
    if [ "$SELF_MERGES" -gt 10 ]; then
      echo "has_critical=true" >> $GITHUB_OUTPUT
    fi
```

### Send Notifications

Add Slack/email notifications:

```yaml
- name: Send Slack notification
  if: steps.check-issues.outputs.has_critical == 'true'
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "🚨 Security scan found critical issues!"
      }
```

### Multiple Organisations

Scan multiple organisations in one workflow:

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

## Security Best Practices

### 1. Secure Private Key Storage

**Do:**
- ✅ Store private key in GitHub Secrets
- ✅ Use repository/organisation secrets
- ✅ Limit access to secrets (restrict who can modify)
- ✅ Rotate private keys periodically

**Don't:**
- ❌ Commit private key to repository
- ❌ Store in plain text files
- ❌ Share private key via email/Slack
- ❌ Use same key for multiple apps

### 2. Minimum Permissions

Only grant permissions the app actually needs:
- ✅ Actions: Read (not Write)
- ✅ Pull requests: Read (not Write)
- ✅ Issues: Write only if creating issues
- ❌ Don't grant Contents: Write
- ❌ Don't grant Administration: Write

### 3. Limit Installation Scope

Install app on specific repositories when possible:
- For single-repo tools: Install on that repo only
- For org tools: Consider "All repositories" or select critical repos
- Review installation permissions regularly

### 4. Monitor App Activity

**Check app usage:**
```bash
# View app installations
gh api /app/installations

# View app events (audit log)
# Organisation Settings → Audit log → Filter by app name
```

**Set up alerts:**
- Enable GitHub Advanced Security audit log streaming
- Monitor for unexpected API calls
- Alert on permission changes

### 5. Rotate Credentials

**Regular rotation:**
```bash
# Generate new private key (in app settings)
# Update GitHub Secret
# Revoke old private key
# Test workflow with new key
```

**Recommended schedule:** Every 90-180 days

## Troubleshooting

### Error: "Bad credentials"

**Cause:** Private key or App ID incorrect

**Solution:**
```bash
# Verify App ID
gh api /app | jq '.id'

# Regenerate private key if needed
# App Settings → Private keys → Generate new

# Update secret
gh secret set SECURITY_SCANNER_APP_PRIVATE_KEY < new-key.pem
```

### Error: "Resource not accessible by integration"

**Cause:** App lacks required permissions

**Solution:**
1. Go to App Settings → Permissions
2. Verify permissions:
   - Actions: Read ✅
   - Pull requests: Read ✅
   - Metadata: Read ✅
3. Click "Save"
4. Approve permission request (organisation may need to approve)
5. Wait 60 seconds for changes to propagate

### Error: "App not installed"

**Cause:** App not installed on organisation/repository

**Solution:**
```bash
# Check installations
gh api /app/installations

# Install app
# Go to: App Settings → Install App → Select organisation
```

### Workflow doesn't run on schedule

**Cause:** Workflows disabled or repository inactive

**Solution:**
- Verify workflow file is on default branch (main/master)
- Check Actions are enabled: Repo Settings → Actions → General
- Schedules don't run if repo has no activity for 60 days
- Run workflow manually to reactivate: Actions → Run workflow

### Error: "Token has expired"

**Cause:** App tokens auto-expire after 1 hour

**Solution:** This is normal behaviour. The workflow automatically generates fresh tokens:

```yaml
# Token is regenerated on each workflow run
- name: Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v1
```

## Advanced Usage

### Custom Token Scope

Limit token to specific repositories:

```yaml
- name: Generate GitHub App token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    repositories: |
      repo1
      repo2
      repo3
```

### Using with GitHub Enterprise

```yaml
- name: Generate GitHub App token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    owner: ${{ github.repository_owner }}
    github-api-url: https://github.enterprise.com/api/v3
```

### Programmatic Token Generation

For local testing or custom scripts:

```bash
npm install @octokit/auth-app

node --input-type=module << 'EOF'
import { createAppAuth } from "@octokit/auth-app";

const auth = createAppAuth({
  appId: process.env.APP_ID,
  privateKey: process.env.APP_PRIVATE_KEY,
});

(async () => {
  const { token } = await auth({ type: "installation" });
  console.log(token);
})();
EOF
```

## Migration from Tokens to GitHub Apps

### Step-by-Step Migration

1. **Create GitHub App** (see setup guide above)

2. **Test with manual workflow run**
   ```bash
   # Keep existing token-based workflow
   # Add new app-based workflow with different name
   # Test app workflow first
   ```

3. **Update secrets**
   ```bash
   # Add app secrets
   gh secret set SECURITY_SCANNER_APP_ID
   gh secret set SECURITY_SCANNER_APP_PRIVATE_KEY

   # Keep token secret temporarily for rollback
   ```

4. **Switch workflows**
   ```bash
   # Update scheduled workflow to use app authentication
   # Monitor for 1-2 weeks
   ```

5. **Clean up**
   ```bash
   # Remove old token secret
   gh secret remove GITHUB_TOKEN

   # Revoke old personal access token
   # GitHub Settings → Tokens → Revoke
   ```

## Comparison: Tokens vs GitHub Apps

### Use Fine-Grained Tokens When:
- Running manual/ad-hoc analysis
- Personal development and testing
- Single-user workflows
- Quick prototyping
- No need for separate bot identity

### Use GitHub Apps When:
- Automated scheduled scanning
- Organisation-wide tools
- CI/CD pipelines
- Multiple team members need access
- Need separate audit trail from users
- Production automation requiring high reliability

## Additional Resources

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [actions/create-github-app-token](https://github.com/actions/create-github-app-token)
- [GitHub App Permissions Reference](https://docs.github.com/en/rest/overview/permissions-required-for-github-apps)
- [Cron Schedule Expression Editor](https://crontab.guru/)

## Next Steps

1. [Set up your GitHub App](#setting-up-a-github-app)
2. [Configure scheduled workflow](#scheduled-workflow-setup)
3. [Customise for your organisation](#customising-the-workflow)
4. [Monitor and iterate](#security-best-practices)

---

**Questions?** Check the [Getting Started Guide](/docs/getting-started) or [open a discussion](https://github.com/sdh100shaun/gh-tools/discussions).
