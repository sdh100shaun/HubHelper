# Watch Capability Implementation Plan

**Status:** Planning Phase
**Priority:** Medium
**Estimated Effort:** 10 days
**Target Version:** v1.1.0

## Executive Summary

The watch capability will transform HubHelper from a one-time analysis tool into a continuous security monitoring system. By polling GitHub at configurable intervals, detecting changes, and alerting on new issues, organizations can maintain real-time visibility into their security posture.

## Motivation

Current limitations:
- Users must manually run `hubhelper analyze` to check for issues
- No automated monitoring for security regressions
- No alerting when new issues appear
- Scheduled workflows require GitHub Actions setup

Watch mode addresses these by providing:
- Continuous monitoring without GitHub Actions dependency
- Immediate alerts on new security issues
- Historical tracking of issue trends
- Flexible deployment (local machine, server, container)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Entry Point (index.ts)                │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ├──> analyze (existing)
                    └──> watch (new)
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        v                                     v
┌───────────────────┐              ┌─────────────────────┐
│  WatchOrchestrator│              │   StateManager      │
│  (coordination)   │◄────────────►│   (persistence)     │
└───────┬───────────┘              └─────────────────────┘
        │
        ├──────────────────┬──────────────────┬────────────────┐
        v                  v                  v                v
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐
│GitHubFetcher │  │SecurityAnalyz│  │ChangeDetector│  │AlertManager │
│  (existing)  │  │  (existing)  │  │    (new)      │  │   (new)     │
└──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘
```

## Key Components

### 1. WatchOrchestrator (`src/services/watch-orchestrator.ts`)
**Responsibility:** Main coordinator for watch mode operations

**Core Methods:**
- `start(config: WatchConfig): Promise<void>` - Initiates watch mode
- `stop(): Promise<void>` - Graceful shutdown
- `runScan(): Promise<WatchScanResult>` - Executes single scan cycle
- `handleScanResult(result: WatchScanResult): Promise<void>` - Processes results

**Features:**
- Interval-based scanning with `setInterval`
- Signal handling (SIGINT/SIGTERM) for clean shutdown
- Retry logic with exponential backoff
- Scan statistics tracking
- Rate limit awareness

### 2. StateManager (`src/services/state-manager.ts`)
**Responsibility:** Persist and retrieve scan state between runs

**Storage:** `~/.hubhelper/watch-state/<org-name>.json`

**State Schema:**
```typescript
interface WatchState {
  version: string; // "1.0.0"
  organization: string;
  lastScanAt: string; // ISO timestamp
  configHash: string; // MD5 of config
  knownIssues: IssueFingerprint[];
  statistics: {
    totalScans: number;
    totalIssuesDetected: number;
    lastErrorAt?: string;
  };
}

interface IssueFingerprint {
  hash: string; // SHA-256(type + repo + description)
  firstSeen: string;
  lastSeen: string;
  severity: string;
  type: string;
}
```

**Features:**
- Atomic writes (temp file + rename)
- Schema versioning with migrations
- Corruption recovery (backup + fresh start)
- Lock files to prevent concurrent instances

### 3. ChangeDetector (`src/services/change-detector.ts`)
**Responsibility:** Identify new/changed issues by comparing scans

**Core Logic:**
- Generate SHA-256 fingerprint from `type + repository + description`
- Compare current scan fingerprints against stored state
- Detect new issues (in current, not in state)
- Detect resolved issues (in state, not in current)
- Handle severity upgrades (same issue, higher severity = new alert)

**Filtering:**
- Minimum severity threshold
- Deduplication within 24-hour window
- Batched alerting (collect all new issues per scan)

### 4. AlertManager (`src/services/alert-manager.ts`)
**Responsibility:** Dispatch alerts to configured channels

**Extensible Design:**
```typescript
interface AlertChannel {
  name: string;
  send(alert: Alert): Promise<void>;
  isEnabled(config: WatchConfig): boolean;
}
```

**Initial Channels:**
- `ConsoleAlertChannel` - Terminal output (MVP)

**Future Channels:**
- `SlackAlertChannel` - Slack webhook integration
- `EmailAlertChannel` - SMTP email notifications
- `WebhookAlertChannel` - Generic HTTP POST
- `PagerDutyAlertChannel` - Incident management

### 5. RateLimitManager (`src/utils/rate-limit-manager.ts`)
**Responsibility:** Track and respect GitHub API rate limits

**Features:**
- Query current rate limit status
- Calculate time until reset
- Estimate API cost per scan
- Dynamic interval adjustment based on quota
- Warning when approaching limits

**Smart Scheduling:**
```typescript
// If low on quota, double the interval
if (remaining < estimatedCost * 2) {
  newInterval = Math.max(currentInterval * 2, resetTime / estimatedCost);
}
```

## Implementation Strategy

### Phase 1: Core Infrastructure (Days 1-2)
- Create `src/types/watch.ts` with all type definitions
- Implement `StateManager` with file I/O and atomic writes
- Implement `ChangeDetector` with fingerprinting logic
- Unit tests for both components

**Success Criteria:**
- StateManager can save/load state reliably
- ChangeDetector correctly identifies new vs. existing issues
- 100% test coverage for both components

### Phase 2: Orchestration (Days 3-4)
- Implement `WatchOrchestrator` with scan loop
- Add signal handling for graceful shutdown
- Implement retry logic with exponential backoff
- Add scan statistics tracking
- Unit tests for orchestrator

**Success Criteria:**
- Watch mode can start and stop cleanly
- SIGINT/SIGTERM trigger graceful shutdown
- Failed scans don't crash the process
- Statistics are tracked accurately

### Phase 3: Integration (Days 5-6)
- Wire GitHubFetcher to WatchOrchestrator
- Wire SecurityAnalyzer to WatchOrchestrator
- Implement incremental fetching (since last scan)
- Create `CachedGitHubFetcher` wrapper
- Integration tests

**Success Criteria:**
- Full scan cycle completes successfully
- Incremental fetching reduces API calls by 80%+
- Caching improves performance by 50%+
- E2E tests pass with mocked GitHub API

### Phase 4: Alerting (Day 7)
- Implement `AlertManager` with channel pattern
- Create `ConsoleAlertChannel`
- Extend `ConsoleReporter` with watch formatting
- Test alert delivery

**Success Criteria:**
- New issues trigger console alerts
- Alert format is clear and actionable
- Severity filtering works correctly

### Phase 5: Rate Limiting & Performance (Day 8)
- Implement `RateLimitManager`
- Add `CircuitBreaker` utility
- Dynamic interval adjustment
- Load testing

**Success Criteria:**
- Watch mode respects rate limits
- Circuit breaker prevents cascading failures
- Can run continuously for 24+ hours
- Memory usage stays stable

### Phase 6: CLI Integration (Day 9)
- Update `src/index.ts` with watch command
- Add CLI option parsing
- Documentation in help text
- Manual testing

**Success Criteria:**
- `hubhelper watch --org myorg` works
- All CLI flags function correctly
- Help text is comprehensive

### Phase 7: Documentation & Polish (Day 10)
- Update README.md with watch examples
- Add inline code documentation
- Create usage guide in docs
- Final integration testing
- Bug fixes

**Success Criteria:**
- Documentation is complete and clear
- All tests passing
- No known critical bugs
- Ready for release

## File Structure

### New Files
```
src/
├── commands/
│   └── watch.ts                    # Watch command (300 LOC)
├── services/
│   ├── watch-orchestrator.ts       # Main coordinator (400 LOC)
│   ├── state-manager.ts            # State persistence (250 LOC)
│   ├── change-detector.ts          # Diff detector (200 LOC)
│   ├── alert-manager.ts            # Alert dispatcher (200 LOC)
│   └── cached-github-fetcher.ts    # Caching layer (150 LOC)
├── utils/
│   ├── rate-limit-manager.ts       # API quota (200 LOC)
│   ├── circuit-breaker.ts          # Resilience (100 LOC)
│   └── logger.ts                   # Structured logging (100 LOC)
├── types/
│   └── watch.ts                    # Type definitions (100 LOC)
└── __tests__/
    ├── watch-orchestrator.test.ts  # Orchestrator tests (300 LOC)
    ├── state-manager.test.ts       # State tests (250 LOC)
    ├── change-detector.test.ts     # Change detection tests (200 LOC)
    ├── alert-manager.test.ts       # Alert tests (150 LOC)
    ├── rate-limit-manager.test.ts  # Rate limit tests (150 LOC)
    ├── cached-github-fetcher.test.ts # Cache tests (150 LOC)
    └── integration/
        └── watch-e2e.test.ts       # E2E tests (400 LOC)
```

**Total:** ~3,200 lines of code (including tests)

### Modified Files
- `src/index.ts` - Add watch command (+50 LOC)
- `src/types/index.ts` - Export watch types (+5 LOC)
- `src/services/github-fetcher.ts` - Incremental fetching (+100 LOC)
- `src/reporters/console-reporter.ts` - Watch formatting (+150 LOC)

## CLI Interface

### Basic Usage
```bash
# Watch organization with defaults (60-minute interval)
hubhelper watch --org myorg

# Custom interval and severity threshold
hubhelper watch --org myorg --interval 30 --min-severity high

# One-shot mode (run once, then exit - for testing)
hubhelper watch --org myorg --once

# Reset state before starting
hubhelper watch --org myorg --reset-state

# Custom state storage location
hubhelper watch --org myorg --state-path /var/lib/hubhelper

# Disable AI analysis (faster, lower cost)
hubhelper watch --org myorg --no-ai
```

### Flags
```
-o, --org <organization>    GitHub organization to watch (required)
-t, --token <token>         GitHub token (or use GITHUB_TOKEN env var)
-i, --interval <minutes>    Check interval in minutes (default: 60)
--min-severity <level>      Minimum severity: low|medium|high|critical (default: medium)
--lookback <days>           Initial lookback period in days (default: 7)
--no-ai                     Disable AI-powered insights
--state-path <path>         Custom state storage directory
--once                      Run single scan then exit (for testing)
--reset-state               Clear previous state before starting
--verbose                   Enable debug logging
```

### Environment Variables
```bash
GITHUB_TOKEN=ghp_xxx              # GitHub authentication
HUBHELPER_WATCH_INTERVAL=60       # Default interval
HUBHELPER_WATCH_MIN_SEVERITY=high # Default severity threshold
HUBHELPER_WATCH_STATE_PATH=~/.hubhelper/state
```

## Performance Targets

### API Efficiency
- **Full scan:** ~150 API calls for 50 repositories
- **Incremental scan:** ~20 API calls (87% reduction)
- **Target:** Stay within 5000 requests/hour rate limit

### Memory Usage
- **Baseline:** 50 MB (Node.js + dependencies)
- **Working set:** 100 MB during scan
- **Max:** 200 MB (including caches)
- **Target:** Stable over 24+ hours of operation

### Responsiveness
- **Scan duration:** < 2 minutes for 50 repos
- **Alert latency:** < 5 seconds after issue detected
- **Shutdown time:** < 10 seconds on SIGINT

### Reliability
- **Uptime:** 99.9% over 30 days
- **Error recovery:** Automatic retry on transient failures
- **State durability:** No data loss on crashes

## Testing Strategy

### Unit Tests (60% coverage minimum)
- StateManager: save/load/migration/corruption handling
- ChangeDetector: fingerprinting, new issue detection
- WatchOrchestrator: start/stop, signal handling, retries
- RateLimitManager: quota tracking, wait logic
- AlertManager: channel dispatching, formatting

### Integration Tests (30% coverage)
- Full scan cycle with mocked GitHub API
- State persistence across restarts
- Change detection with multiple scans
- Alert delivery end-to-end

### Manual Tests (10% coverage)
- 24-hour stability test
- Rate limit handling
- Signal interruption (Ctrl+C, kill)
- State corruption recovery
- Lock file conflict (multiple instances)

## Error Handling

### Network Failures
- **Retry:** 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Fallback:** Skip scan, log error, continue to next interval
- **User feedback:** Console warning with error details

### Rate Limit Exceeded
- **Wait:** Until rate limit resets (show countdown)
- **Adjust:** Double interval if rate limit hit frequently
- **Threshold:** If reset > 1 hour, skip current scan

### Authentication Errors
- **No retry:** Permanent failure
- **Action:** Print error and exit
- **Guidance:** "Check token validity and permissions"

### State Corruption
- **Backup:** Save corrupted file with `.corrupted` extension
- **Recover:** Start with fresh state
- **Notify:** Warn user about state reset

### Insufficient Permissions
- **Continue:** With degraded functionality
- **Example:** If can't read Actions, skip workflow checks
- **Log:** Specific permission error for user awareness

## Security Considerations

### Token Storage
- Never log tokens
- Read from environment variable or secure config
- Warn if token in command line (visible in process list)

### State File Security
- Store in user home directory (`~/.hubhelper/`)
- Set permissions: 0600 (owner read/write only)
- Don't include sensitive data (only issue fingerprints)

### Lock Files
- Prevent concurrent instances watching same org
- Cleanup stale locks (check PID validity)
- Atomic lock acquisition with PID tracking

### Error Messages
- Don't leak sensitive information in errors
- Sanitize URLs (remove tokens from logs)
- Rate limit error reporting to prevent spam

## Future Enhancements

### v1.2.0 - Multi-Channel Alerts
- Slack integration via webhooks
- Email notifications via SMTP
- Webhook support for custom integrations
- PagerDuty for critical alerts

### v1.3.0 - Advanced Monitoring
- Multi-organization support (parallel watching)
- Trend analysis (issue frequency over time)
- Customizable detection rules
- Severity scoring with ML

### v1.4.0 - UI & Dashboards
- Web dashboard for real-time status
- Historical charts and graphs
- Alert management (acknowledge, snooze)
- Team collaboration features

### v2.0.0 - Enterprise Features
- GitHub Enterprise support
- SSO integration
- Audit logging
- Compliance reporting
- SLA monitoring

## Success Metrics

### Adoption
- **Target:** 50% of users try watch mode within 3 months
- **Measure:** Telemetry (opt-in), GitHub Stars, npm downloads

### Reliability
- **Target:** < 5 bug reports in first month
- **Measure:** GitHub Issues with `watch` label

### Performance
- **Target:** 90% of scans complete in < 2 minutes
- **Measure:** Instrumentation logs (opt-in telemetry)

### User Satisfaction
- **Target:** 80% positive feedback
- **Measure:** GitHub Discussions, Twitter mentions

## Risks & Mitigation

### Risk: High API Usage
- **Impact:** Users hit rate limits, watch mode becomes unusable
- **Mitigation:**
  - Incremental fetching (87% reduction)
  - Caching (50% improvement)
  - Dynamic interval adjustment
  - Clear documentation of API costs

### Risk: State Corruption
- **Impact:** Loss of issue tracking, false alerts
- **Mitigation:**
  - Atomic writes
  - Schema versioning
  - Automatic recovery
  - Regular backups

### Risk: Memory Leaks
- **Impact:** Process crashes after long operation
- **Mitigation:**
  - Clear analysis objects after use
  - Limit state file size
  - Prune old fingerprints
  - Memory profiling during testing

### Risk: Poor Alert Quality
- **Impact:** Alert fatigue, users ignore notifications
- **Mitigation:**
  - Severity filtering
  - Deduplication
  - Clear, actionable messages
  - Quiet hours (future)

## Timeline

```
Week 1: Core Infrastructure
├─ Day 1-2: StateManager + ChangeDetector
└─ Day 3-4: WatchOrchestrator

Week 2: Integration & Polish
├─ Day 5-6: GitHub/Analyzer Integration
├─ Day 7: AlertManager
├─ Day 8: RateLimitManager + Performance
├─ Day 9: CLI Integration
└─ Day 10: Documentation & Testing

Week 3: Beta Testing
├─ Day 11-12: Internal testing
├─ Day 13-14: Beta user feedback
└─ Day 15: Bug fixes + release prep

Week 4: Release
├─ Day 16: v1.1.0-beta.1 release
├─ Day 17-19: Beta feedback iteration
└─ Day 20: v1.1.0 stable release
```

## Dependencies

### Required
- None (only uses existing dependencies)

### Optional (Future)
- `@slack/webhook` - Slack integration
- `nodemailer` - Email notifications
- `prom-client` - Prometheus metrics

## Backwards Compatibility

- No breaking changes to existing `analyze` command
- Watch mode is opt-in (new command)
- State files are isolated per organization
- Existing workflows continue to function

## Documentation Updates

- [ ] README.md - Add watch mode section with examples
- [ ] docs/pages/api/index.md - Remove "Coming Soon", add full documentation
- [ ] docs/pages/getting-started/index.md - Add watch mode tutorial
- [ ] docs/pages/github-app/index.md - Compare with watch mode
- [ ] New: docs/pages/watch-mode/index.md - Comprehensive guide

## Conclusion

The watch capability transforms HubHelper from a point-in-time analysis tool into a continuous security monitoring system. With careful architecture, comprehensive testing, and phased implementation, we can deliver a robust, performant, and user-friendly feature that significantly enhances the value proposition of HubHelper.

**Estimated delivery:** 4 weeks from start
**Complexity:** Medium
**Value:** High
**Risk:** Low-Medium

**Recommendation:** Proceed with implementation.
