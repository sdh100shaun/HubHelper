# GitHub Workflows

This directory contains GitHub Actions workflows for the HubHelper project.

## Available Workflows

### 1. CI Workflow (`ci.yml`)

Runs on every push and pull request to ensure code quality.

**Triggers:**
- Push to any branch
- Pull requests

**Jobs:**
- Linting (Biome)
- TypeScript compilation
- Unit tests
- Coverage reporting (requires ≥75%)

### 2. Documentation Deployment (`deploy-docs.yml`)

Deploys documentation site to GitHub Pages.

**Triggers:**
- Push to `main` branch (when `website/**` changes)
- Manual workflow dispatch

**Deployment:**
- Builds the [docmd](https://docmd.io) static site in `website/` (`npm run docs:build`)
- Deploys `website/build` to GitHub Pages
- Available at: https://sdh100shaun.github.io/HubHelper/

### 3. npm Publishing (`npm-publish.yml`)

Publishes package to npm registry.

**Triggers:**
- GitHub Release (published)
- Manual workflow dispatch

**Requirements:**
- `NPM_TOKEN` secret configured
- Runs linting and build before publishing
- Publishes with provenance for security

### 4. gh-aw Validate (`gh-aw-validate.yml`)

Compiles the agentic workflows in `gh-aw/workflows/` with the pinned gh-aw CLI in strict mode (`--no-emit`), so
a broken workflow can't be released.

**Triggers:**
- Push to `main` or `claude/**`, and pull requests to `main`, when `gh-aw/**` changes
- Manual workflow dispatch

## Running HubHelper on a schedule

The old `scheduled-security-scan.yml` example has been removed. HubHelper now ships a
[GitHub Agentic Workflow](https://github.github.com/gh-aw/) in `gh-aw/`, which runs a weekly HubHelper scan and
has an agent triage the results into a digest discussion and issues. It lives outside `.github/workflows/`, so it
never runs in this public repository.

Install it into a **private** security repository in your organisation:

```bash
gh aw add sdh100shaun/HubHelper/gh-aw
```

See the [agentic workflow guide](https://sdh100shaun.github.io/HubHelper/docs/agentic-workflows/) for the
GitHub App, secrets and customisation.

## Workflow Security

### Best Practices

1. **Use GitHub Apps instead of tokens** for automated workflows
   - Tokens expire automatically (1 hour)
   - Better audit trail
   - Separate identity from users
   - See [GitHub App documentation](https://sdh100shaun.github.io/HubHelper/docs/github-app/)

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


