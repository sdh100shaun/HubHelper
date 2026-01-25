/**
 * Type definitions for Watch Mode
 *
 * Watch mode enables continuous security monitoring of GitHub organizations
 * by periodically scanning for security issues and alerting on new findings.
 *
 * @module types/watch
 */

/**
 * Configuration for watch mode operation
 */
export interface WatchConfig {
  /** GitHub organization name to monitor */
  organization: string;

  /** GitHub personal access token or GitHub App token */
  token: string;

  /** Scan interval in minutes (default: 60) */
  intervalMinutes: number;

  /** Minimum severity level to alert on (default: 'medium') */
  minSeverity: 'low' | 'medium' | 'high' | 'critical';

  /** Number of days to look back on initial scan (default: 7) */
  lookbackDays: number;

  /** Enable AI-powered insights for new issues (default: true) */
  enableAI: boolean;

  /** Alert channels to use (default: ['console']) */
  alertChannels: string[];

  /** Custom path for state storage (default: ~/.hubhelper/watch-state) */
  statePath?: string;

  /** Run once and exit (default: false) */
  once?: boolean;

  /** Reset state before starting (default: false) */
  resetState?: boolean;

  /** Enable verbose debug logging (default: false) */
  verbose?: boolean;
}

/**
 * Persistent state for watch mode
 * Stored in ~/.hubhelper/watch-state/<org-name>.json
 */
export interface WatchState {
  /** Schema version for state migrations */
  version: string;

  /** Organization name being watched */
  organization: string;

  /** ISO timestamp of last successful scan */
  lastScanAt: string;

  /** MD5 hash of configuration to detect changes */
  configHash: string;

  /** List of known issue fingerprints */
  knownIssues: IssueFingerprint[];

  /** Scan statistics */
  statistics: {
    /** Total number of scans performed */
    totalScans: number;

    /** Total number of issues detected across all scans */
    totalIssuesDetected: number;

    /** ISO timestamp of last error (if any) */
    lastErrorAt?: string;

    /** Total number of alerts sent */
    totalAlertsSent?: number;
  };
}

/**
 * Unique fingerprint for a security issue
 * Used to track issues across scans and detect changes
 */
export interface IssueFingerprint {
  /** SHA-256 hash of issue (type + repo + description) */
  hash: string;

  /** ISO timestamp when issue was first detected */
  firstSeen: string;

  /** ISO timestamp when issue was last seen */
  lastSeen: string;

  /** Severity level of the issue */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Type of security issue */
  type: string;

  /** Repository where issue was found (for debugging) */
  repository?: string;

  /** Brief description of the issue (for debugging) */
  description?: string;
}

/**
 * Result of a single watch scan cycle
 */
export interface WatchScanResult {
  /** Repositories analyzed in this scan */
  repositories: any[]; // TODO: Import Repository type from main types

  /** Pull requests analyzed in this scan */
  pullRequests: any[]; // TODO: Import PullRequest type from main types

  /** Security analysis results */
  analysisResult: any; // TODO: Import AnalysisResult type from main types

  /** ISO timestamp when scan started */
  scanTimestamp: string;

  /** Duration of scan in milliseconds */
  scanDuration: number;

  /** Number of API calls made during scan */
  apiCallsUsed: number;

  /** New issues detected in this scan (not in previous state) */
  newIssues: any[]; // TODO: Import SecurityIssue type from main types

  /** Issues resolved since last scan (were in state, not in current) */
  resolvedIssues: IssueFingerprint[];
}

/**
 * Statistics tracked during watch mode operation
 */
export interface WatchStatistics {
  /** Total number of scans performed */
  totalScans: number;

  /** Number of new issues detected */
  newIssuesDetected: number;

  /** Number of issues resolved */
  resolvedIssues: number;

  /** Total GitHub API calls made */
  apiCallsMade: number;

  /** Uptime in milliseconds */
  uptime: number;

  /** ISO timestamp of last scan */
  lastScanAt: string;

  /** ISO timestamp of next scheduled scan */
  nextScanAt: string;

  /** Current state (running, waiting, error) */
  state: 'running' | 'waiting' | 'error' | 'stopped';
}

/**
 * Alert to be sent to configured channels
 */
export interface Alert {
  /** Type of alert */
  type: 'new_issues' | 'resolved_issues' | 'error' | 'summary';

  /** ISO timestamp when alert was generated */
  timestamp: string;

  /** Organization the alert is for */
  organization: string;

  /** Severity of the alert */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';

  /** Security issues included in alert (if applicable) */
  issues?: any[]; // TODO: Import SecurityIssue type from main types

  /** Human-readable alert message */
  message: string;

  /** Additional metadata for the alert */
  metadata: Record<string, unknown>;
}

/**
 * Context information for alert formatting
 */
export interface AlertContext {
  /** Number of scans performed so far */
  scanCount: number;

  /** Total issues being tracked */
  totalTrackedIssues: number;

  /** Scan interval in minutes */
  intervalMinutes: number;

  /** Timestamp of next scan */
  nextScanAt: string;
}

/**
 * Interface for alert channels (Slack, email, webhook, etc.)
 */
export interface AlertChannel {
  /** Unique name for this alert channel */
  name: string;

  /** Send an alert through this channel */
  send(alert: Alert): Promise<void>;

  /** Check if this channel is enabled for given configuration */
  isEnabled(config: WatchConfig): boolean;
}

/**
 * GitHub API rate limit status
 */
export interface RateLimitStatus {
  /** Number of API calls remaining */
  remaining: number;

  /** Total API call limit */
  limit: number;

  /** Unix timestamp when rate limit resets */
  resetAt: number;

  /** Number of calls used so far */
  used: number;

  /** Resource type (core, search, graphql) */
  resource: string;
}

/**
 * State migration definition
 * Used to upgrade state schema between versions
 */
export interface StateMigration {
  /** Source schema version */
  fromVersion: string;

  /** Target schema version */
  toVersion: string;

  /** Migration function */
  migrate(oldState: unknown): WatchState;
}

/**
 * Configuration for state manager
 */
export interface StateManagerConfig {
  /** Path to state directory */
  statePath: string;

  /** Organization name (used for filename) */
  organization: string;

  /** Enable automatic backups on corruption */
  enableBackups?: boolean;

  /** Number of backup files to retain */
  maxBackups?: number;
}

/**
 * Cache entry for GitHub API responses
 */
export interface CacheEntry<T> {
  /** Cached data */
  data: T;

  /** Unix timestamp when data was cached */
  timestamp: number;

  /** TTL in milliseconds */
  ttl: number;
}

/**
 * Watch mode error types
 */
export enum WatchErrorType {
  /** Network or GitHub API error */
  NETWORK_ERROR = 'NETWORK_ERROR',

  /** GitHub API rate limit exceeded */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  /** Authentication failure */
  AUTH_ERROR = 'AUTH_ERROR',

  /** State file corruption */
  STATE_CORRUPTION = 'STATE_CORRUPTION',

  /** Insufficient permissions */
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  /** Internal error */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Watch mode error
 */
export class WatchError extends Error {
  constructor(
    message: string,
    public type: WatchErrorType,
    public retriable: boolean = false,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'WatchError';
  }
}
