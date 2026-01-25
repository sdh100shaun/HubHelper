# Watch Mode Feature Specification

**Version:** 1.0.0
**Status:** Planned for v1.1.0
**Last Updated:** 2026-01-25

## Overview

Watch mode enables continuous security monitoring of GitHub organizations by periodically scanning for security issues and alerting when new problems are detected.

## User Stories

### As a Security Engineer
> "I want to be notified immediately when security issues appear in my organization's repositories, so I can respond quickly to potential threats."

### As a DevOps Lead
> "I want to run continuous security monitoring on my server without setting up GitHub Actions workflows, so I have flexibility in how I deploy monitoring."

### As an Open Source Maintainer
> "I want to track security trends in my organization over time, so I can identify patterns and improve our practices."

## Features

### 1. Continuous Monitoring
Watch mode runs indefinitely, periodically scanning the organization and comparing results against previous scans.

**User Benefit:** Automated security vigilance without manual intervention

**Example:**
```bash
# Start watching organization 'myorg' every 60 minutes
hubhelper watch --org myorg

# Output:
🔒 Starting security watch for organization: myorg
📊 Scan interval: 60 minutes
🎯 Minimum severity: medium
⏰ Next scan at: 2026-01-25 11:30:00

✅ Initial scan complete
  - Repositories scanned: 47
  - Issues found: 12 (3 high, 9 medium)
  - State saved to: ~/.hubhelper/watch-state/myorg.json

⏳ Watching... (press Ctrl+C to stop)
```

### 2. Smart Change Detection
Only alerts on new or changed issues, avoiding alert fatigue from recurring problems.

**User Benefit:** Relevant alerts, not noise

**Example:**
```bash
# After running for an hour, new PR is self-merged

🔔 NEW SECURITY ISSUES DETECTED - 2026-01-25 11:30:15

Organization: myorg
New issues: 1

🚨 HIGH SEVERITY:
  🔀 Self-merge in myorg/payment-service
     PR #834 was self-merged by engineer@myorg.com
     URL: https://github.com/myorg/payment-service/pull/834
     First seen: Just now

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next scan in 60 minutes
Total scans: 2 | Issues detected: 1
```

### 3. Flexible Scheduling
Configurable scan intervals from 1 minute to 24 hours.

**User Benefit:** Balance between responsiveness and API quota usage

**Examples:**
```bash
# High-frequency monitoring (every 15 minutes)
hubhelper watch --org myorg --interval 15

# Daily security digest (every 24 hours)
hubhelper watch --org myorg --interval 1440

# Check every 2 hours during business hours
hubhelper watch --org myorg --interval 120
```

### 4. Severity Filtering
Only alert on issues meeting minimum severity threshold.

**User Benefit:** Focus on critical issues, reduce noise

**Examples:**
```bash
# Only alert on high and critical severity
hubhelper watch --org myorg --min-severity high

# Alert on everything (including low severity)
hubhelper watch --org myorg --min-severity low

# Default: medium and above
hubhelper watch --org myorg
```

### 5. Persistent State
Remembers issues across restarts to avoid re-alerting.

**User Benefit:** Reliable tracking even if process is restarted

**Example:**
```bash
# Start watch mode
hubhelper watch --org myorg

# ... (Running for 2 hours, 3 issues detected)

# User stops with Ctrl+C
^C
🛑 Received SIGINT, shutting down gracefully...
✅ Shutdown complete. State saved.

# Restart later
hubhelper watch --org myorg

# Output:
🔒 Starting security watch for organization: myorg
📂 Loaded previous state (3 known issues, last scan: 2 hours ago)
🔍 Running initial scan...
✅ No new issues detected
⏳ Watching... (press Ctrl+C to stop)
```

### 6. Graceful Shutdown
Properly handles Ctrl+C and system signals.

**User Benefit:** No data loss when stopping

**Example:**
```bash
hubhelper watch --org myorg

# User presses Ctrl+C during a scan
^C
🛑 Received SIGINT, shutting down gracefully...
⏳ Waiting for current scan to finish...
💾 Saving state...
✅ Shutdown complete. State saved to ~/.hubhelper/watch-state/myorg.json
```

### 7. One-Shot Mode
Run a single scan then exit (useful for testing or cron jobs).

**User Benefit:** Test watch mode behavior without long-running process

**Example:**
```bash
# Run once and exit
hubhelper watch --org myorg --once

# Output:
🔒 Running single security scan for organization: myorg
🔍 Scanning...
✅ Scan complete
  - Repositories: 47
  - New issues: 2 (1 high, 1 medium)

🚨 HIGH SEVERITY:
  🔀 Self-merge in myorg/backend
     PR #123 was self-merged by dev@myorg.com

⚠️ MEDIUM SEVERITY:
  ⚙️ GitHub Actions disabled in myorg/legacy-app

💾 State saved
👋 Exiting (--once mode)
```

### 8. State Reset
Clear previous state to start fresh.

**User Benefit:** Easily reset tracking if needed

**Example:**
```bash
# Clear state and start fresh
hubhelper watch --org myorg --reset-state

# Output:
🗑️ Clearing previous state...
✅ State reset
🔒 Starting security watch for organization: myorg
🔍 Running initial scan (all issues will be considered new)...
```

## User Interface

### Command Line Interface

```bash
hubhelper watch [options]
```

**Options:**

| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-o, --org <org>` | Organization to watch | (required) | `--org myorg` |
| `-t, --token <token>` | GitHub token | `$GITHUB_TOKEN` | `--token ghp_xxx` |
| `-i, --interval <min>` | Check interval (minutes) | 60 | `--interval 30` |
| `--min-severity <level>` | Minimum severity to alert | medium | `--min-severity high` |
| `--lookback <days>` | Initial lookback period | 7 | `--lookback 14` |
| `--no-ai` | Disable AI insights | false | `--no-ai` |
| `--state-path <path>` | Custom state directory | `~/.hubhelper/watch-state` | `--state-path /var/lib/hubhelper` |
| `--once` | Run single scan then exit | false | `--once` |
| `--reset-state` | Clear previous state | false | `--reset-state` |
| `--verbose` | Enable debug logging | false | `--verbose` |

### Output Format

**Starting:**
```
🔒 Starting security watch for organization: myorg
📊 Scan interval: 60 minutes
🎯 Minimum severity: medium
⏰ Next scan at: 2026-01-25 11:30:00
```

**Scanning:**
```
🔍 Scanning organization myorg...
  ├─ Repositories: 47
  ├─ Pull requests (last 7 days): 124
  └─ Analysis: In progress...
✅ Scan complete (1m 34s)
```

**New Issues:**
```
🔔 NEW SECURITY ISSUES DETECTED - 2026-01-25 10:30:45

Organization: myorg
New issues: 3 (2 high, 1 medium)

🚨 HIGH SEVERITY:
  🔀 Self-merge in myorg/api-service
     PR #456 was self-merged by user123
     URL: https://github.com/myorg/api-service/pull/456
     First seen: Just now

[... more issues ...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next scan in 60 minutes
Total scans: 12 | Issues tracked: 8 | Alerts sent: 3
```

**No Changes:**
```
✅ Scan complete - No new issues
   Total scans: 15 | Known issues: 8
   Next scan at: 2026-01-25 12:30:00
```

**Errors:**
```
⚠️ Scan failed: Rate limit exceeded
   Limit resets at: 2026-01-25 11:00:00 (29 minutes)
   Waiting until reset...
```

## Use Cases

### Use Case 1: Development Team Monitoring
**Scenario:** A 50-person engineering team wants real-time alerts on security issues.

**Setup:**
```bash
# Run on dedicated monitoring server
hubhelper watch \
  --org acme-corp \
  --interval 30 \
  --min-severity high
```

**Expected Behavior:**
- Scans every 30 minutes
- Alerts only on high/critical severity
- Sends console output to log file
- Runs 24/7 via systemd service

**Benefits:**
- Quick response to security issues
- Reduced manual monitoring overhead
- Historical tracking of security posture

### Use Case 2: Weekly Security Digest
**Scenario:** Security team wants a weekly summary of all security activity.

**Setup:**
```bash
# Cron job running weekly
0 9 * * MON hubhelper watch \
  --org security-team \
  --once \
  --lookback 7 \
  --min-severity low
```

**Expected Behavior:**
- Runs every Monday at 9 AM
- Analyzes last 7 days
- Includes all severity levels
- Exits after single scan
- Emails report (future feature)

**Benefits:**
- Regular security checkpoints
- Comprehensive view of week's activity
- Automated reporting

### Use Case 3: Pre-Release Security Check
**Scenario:** Before each release, verify no new security issues.

**Setup:**
```bash
# In CI/CD pipeline
hubhelper watch \
  --org product-team \
  --once \
  --min-severity medium \
  --no-ai

# Exit code 0 = no new issues
# Exit code 1 = new issues found
```

**Expected Behavior:**
- Runs as part of release pipeline
- Blocks release if new issues found
- Fast execution (AI disabled)
- Clear exit code for automation

**Benefits:**
- Prevents releasing with known issues
- Automated quality gate
- Consistent security standards

### Use Case 4: Open Source Project Monitoring
**Scenario:** Maintainer wants to track security in community-driven project.

**Setup:**
```bash
# Run locally with custom alert threshold
hubhelper watch \
  --org opensource-project \
  --interval 120 \
  --min-severity high \
  --lookback 30
```

**Expected Behavior:**
- Scans every 2 hours
- 30-day initial lookback
- High severity only (reduce noise)
- Runs on maintainer's laptop

**Benefits:**
- Stay aware of security issues
- Low maintenance overhead
- Flexible deployment (no server needed)

## Technical Behavior

### Scanning Process
1. Load previous state from `~/.hubhelper/watch-state/<org>.json`
2. Fetch repositories modified since last scan (or last N days if first run)
3. Fetch pull requests merged since last scan
4. Run security analysis (same logic as `analyze` command)
5. Compare results against previous state (fingerprinting)
6. Identify new issues (not in previous state)
7. Filter by minimum severity
8. Send alerts for new issues
9. Update state with current results
10. Schedule next scan

### Fingerprinting
Issues are identified by SHA-256 hash of:
- Issue type (e.g., "self-merge", "disabled-actions")
- Repository name
- Key identifier (PR number, workflow name, etc.)

**Example:**
```
Issue: Self-merge in myorg/api PR #456
Fingerprint: sha256("self-merge|myorg/api|456")
            = "a1b2c3d4e5f6..."
```

### State Storage
```json
{
  "version": "1.0.0",
  "organization": "myorg",
  "lastScanAt": "2026-01-25T10:30:00Z",
  "configHash": "d41d8cd98f00b204e9800998ecf8427e",
  "knownIssues": [
    {
      "hash": "a1b2c3d4e5f6...",
      "firstSeen": "2026-01-24T14:20:00Z",
      "lastSeen": "2026-01-25T10:30:00Z",
      "severity": "high",
      "type": "self-merge"
    }
  ],
  "statistics": {
    "totalScans": 15,
    "totalIssuesDetected": 8,
    "lastErrorAt": null
  }
}
```

### Rate Limiting
- Monitors GitHub API rate limits
- Waits if rate limit exceeded
- Adjusts interval if frequently hitting limits
- Estimates API cost before scanning

**Example:**
```
Current rate limit: 4,200 / 5,000 remaining
Scan cost estimate: ~150 API calls
Status: ✅ Safe to scan (buffer of 4,050 calls)

Next scan will leave: 4,050 remaining
Rate limit resets in: 42 minutes
```

### Error Handling
- Network errors: Retry 5 times with exponential backoff
- Rate limits: Wait until reset
- Auth errors: Exit immediately with error
- State corruption: Backup old state, start fresh
- Partial failures: Continue with degraded functionality

## Performance

### API Usage
- **Full scan:** ~150 API calls (50 repos, 100 PRs)
- **Incremental scan:** ~20 API calls (87% reduction)
- **Recommended interval:** 30-60 minutes to stay within limits

### Resource Usage
- **Memory:** 100-200 MB
- **CPU:** <1% average, 5-10% during scans
- **Disk:** <1 MB for state files
- **Network:** Minimal (only GitHub API)

### Scan Duration
- **Small org (10 repos):** 30-45 seconds
- **Medium org (50 repos):** 1-2 minutes
- **Large org (200 repos):** 3-5 minutes

## Future Enhancements

### v1.2.0 - Multi-Channel Alerts
- Slack notifications
- Email alerts
- Webhook integration
- PagerDuty integration

### v1.3.0 - Advanced Features
- Multi-organization support
- Trend analysis and charts
- Custom detection rules
- Severity scoring with ML

### v1.4.0 - UI & Dashboards
- Web-based dashboard
- Historical graphs
- Alert management
- Team collaboration

## Comparison: Watch vs Scheduled Workflow

| Feature | Watch Mode | GitHub Actions Workflow |
|---------|-----------|------------------------|
| **Deployment** | Local machine/server | GitHub-hosted |
| **Setup** | Single command | Workflow file + secrets |
| **Cost** | Free (local) | Free (public repos) |
| **Flexibility** | Run anywhere | Only on GitHub |
| **Authentication** | PAT or GitHub App | GitHub App recommended |
| **State Persistence** | Local file | Workflow artifacts |
| **Scheduling** | Flexible intervals | Cron syntax |
| **Alerting** | Console (+ future channels) | Issues, artifacts |
| **Best For** | Dedicated monitoring | Integrated CI/CD |

## FAQ

**Q: Can I watch multiple organizations?**
A: Not yet. v1.1.0 supports one org per instance. Run multiple instances or wait for v1.2.0.

**Q: What happens if my computer sleeps?**
A: Watch mode resumes when computer wakes. Next scan runs at next interval.

**Q: How do I integrate with Slack?**
A: Planned for v1.2.0. For now, redirect output to a script that posts to Slack.

**Q: Does it use more GitHub API quota than analyze?**
A: No, incremental scanning uses 87% fewer API calls than full scans.

**Q: Can I run watch mode in Docker?**
A: Yes! Mount `~/.hubhelper` as a volume to persist state between container restarts.

**Q: What if I delete the state file?**
A: Next scan treats all issues as new and re-alerts. Use `--reset-state` to do this intentionally.

**Q: Can I run watch mode for a single repository?**
A: Not yet. Watch mode operates at organization level. Use `analyze` for single repos.

**Q: How do I monitor multiple environments (dev/staging/prod)?**
A: Run separate instances with different state paths:
```bash
hubhelper watch --org myorg-dev --state-path ~/.hubhelper/dev
hubhelper watch --org myorg-prod --state-path ~/.hubhelper/prod
```

## Documentation References

- [Implementation Plan](/.claude/WATCH_IMPLEMENTATION_PLAN.md)
- [API Reference](/docs/pages/api/index.md#watch)
- [Getting Started](/docs/pages/getting-started/index.md)
- [GitHub App Authentication](/docs/pages/github-app/index.md)

## Approval & Sign-off

**Status:** ✅ Approved for development
**Target Release:** v1.1.0
**Estimated Timeline:** 4 weeks
**Assigned To:** TBD

---

*This specification is subject to change during implementation based on technical constraints and user feedback.*
