export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  url: string;
  author: string;
  merged_by: string | null;
  merged_at: string | null;
  created_at: string;
  repository: string;
  labels: string[];
  is_security_related: boolean;
  files_changed: string[];
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: 'active' | 'disabled_manually' | 'disabled_inactivity';
  created_at: string;
  updated_at: string;
  url: string;
  badge_url: string;
  is_scheduled: boolean;
}

export interface Repository {
  name: string;
  full_name: string;
  private: boolean;
  actions_enabled: boolean;
  security_enabled: boolean;
  workflows?: Workflow[];
  open_issues_count?: number;
  updated_at?: string;
}

export interface SecurityIssueDetails {
  pr_number?: number;
  title?: string;
  url?: string;
  author?: string;
  merged_by?: string | null;
  merged_at?: string | null;
  was_self_merged?: boolean;
  labels?: string[];
  files_changed?: string[];
  repo_name?: string;
  full_name?: string;
  is_private?: boolean;
  security_enabled?: boolean;
  workflow_name?: string;
  workflow_path?: string;
  workflow_url?: string;
  is_scheduled?: boolean;
  updated_at?: string;
  reason?: string;
  failure_count?: number;
  recent_runs?: Array<{ run_number: number; created_at: string; head_branch: string | null }>;
  run_number?: number;
  run_id?: number;
  head_branch?: string | null;
  head_sha?: string;
  event?: string;
  [key: string]: unknown;
}

export interface SecurityIssue {
  type:
    | 'self-merge'
    | 'security-pr'
    | 'disabled-actions'
    | 'unreviewed-security-pr'
    | 'paused-workflow'
    | 'disabled-workflow'
    | 'action_failure'
    | 'repeated_action_failure'
    | 'security-pr-volume';
  severity: 'low' | 'medium' | 'high' | 'critical';
  repository: string;
  description: string;
  details: SecurityIssueDetails;
  detected_at: string;
}

export interface OrganizationActivity {
  organization: string;
  repositories: Repository[];
  pull_requests: PullRequest[];
  security_issues: SecurityIssue[];
  analyzed_at: string;
}

export interface AnalysisResult {
  summary: string;
  issues: SecurityIssue[];
  recommendations: string[];
  statistics: {
    total_repos: number;
    total_prs: number;
    self_merges: number;
    security_prs: number;
    repos_with_disabled_actions: number;
    paused_workflows: number;
    disabled_workflows: number;
  };
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  head_branch: string | null;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  created_at: string;
  updated_at: string;
  repository: string;
  workflow_id: number;
  workflow_name: string;
  run_number: number;
  event: string;
  run_attempt: number;
}

export interface WorkflowJob {
  id: number;
  run_id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  started_at: string;
  completed_at: string | null;
  steps: Array<{
    name: string;
    status: string;
    conclusion: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// User-compliance types
// ---------------------------------------------------------------------------

/** GitHub user profile as returned by the Users API */
export interface UserProfile {
  /** GitHub username (login handle) */
  login: string;
  /** Full name set in the user's public profile, or null when absent */
  name: string | null;
  /** Public email set in the user's profile, or null when absent */
  email: string | null;
}

/** Source-of-truth for which email addresses are considered "approved".
 *  Persisted as `.hubhelper/approved-emails.json` inside the designated
 *  repository so that the list can be edited through normal pull-request
 *  workflows. */
export interface ApprovedEmailConfig {
  /** Allowed email-address domains (lower-case, no leading dot).
   *  e.g. ["acme.com", "partner.io"] */
  domains: string[];
  /** Individual addresses that are approved regardless of domain.
   *  Useful for contractors whose domain is not on the allow-list. */
  exactEmails?: string[];
}

/** Every kind of violation that a single user can commit */
export type ComplianceViolationType = 'missing_full_name' | 'missing_approved_email';

/** One user's full compliance record when they are non-compliant */
export interface ComplianceViolation {
  /** GitHub login of the non-compliant user */
  user: string;
  /** Which rules the user broke */
  violations: ComplianceViolationType[];
  /** Snapshot of the relevant profile fields at check time */
  details: {
    name: string | null;
    email: string | null;
  };
}

/** Aggregate result returned by a single compliance scan */
export interface ComplianceResult {
  /** Organisation that was checked */
  organization: string;
  /** Total number of org members examined */
  totalMembers: number;
  /** Members that passed every rule */
  compliantMembers: number;
  /** Members that failed at least one rule, with details */
  nonCompliantMembers: ComplianceViolation[];
  /** ISO-8601 timestamp when the check ran */
  checkedAt: string;
}

// -----------------------------------------------------------------------
// Repository Lists
// -----------------------------------------------------------------------

export interface RepositoryList {
  name: string;
  description: string;
  created: string; // ISO 8601
  updated: string; // ISO 8601
  repositories: string[]; // ["org/repo", ...]
  metadata: {
    owner?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface RepositoryListStorage {
  lists: Record<string, RepositoryList>;
}

// ---------------------------------------------------------------------------
// Realtime stream types
// ---------------------------------------------------------------------------

export interface GitHubEventActor {
  login: string;
  display_login?: string;
}

export interface GitHubEventRepo {
  id: number;
  name: string;
  url: string;
}

export interface GitHubPullRequestEventPayload {
  action: 'opened' | 'closed' | 'merged' | 'reopened' | 'synchronize';
  number: number;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    user: { login: string };
    merged_by: { login: string } | null;
    merged_at: string | null;
    created_at: string;
    labels: Array<{ name: string }>;
    merged: boolean;
  };
}

export interface GitHubWorkflowRunEventPayload {
  action: 'requested' | 'in_progress' | 'completed';
  workflow_run: {
    id: number;
    name: string | null;
    head_branch: string | null;
    head_sha: string;
    status: string;
    conclusion: string | null;
    created_at: string;
    updated_at: string;
    workflow_id: number;
    run_number: number;
    event: string;
    run_attempt: number;
    html_url: string;
  };
}

export type GitHubEventPayload =
  | GitHubPullRequestEventPayload
  | GitHubWorkflowRunEventPayload
  | Record<string, unknown>;

export interface GitHubEvent {
  id: string;
  type: string;
  actor: GitHubEventActor;
  repo: GitHubEventRepo;
  payload: GitHubEventPayload;
  created_at: string;
  public: boolean;
}

export interface StreamConfig {
  organization: string;
  token: string;
  pollIntervalSeconds: number;
  minSeverity: 'low' | 'medium' | 'high' | 'critical';
  profilePath: string;
  showCompliant: boolean;
  verbose: boolean;
}

export interface StreamEventResult {
  event: GitHubEvent;
  violations: SecurityIssue[];
  timestamp: string;
}

export interface ListReport {
  list: string;
  generated: string;
  summary: {
    totalRepos: number;
    actionsEnabled: number;
    securityEnabled: number;
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
  };
  repositories: RepositoryReportItem[];
  recommendations: string[];
}

export interface RepositoryReportItem {
  name: string;
  full_name: string;
  url: string;
  actions_enabled: boolean;
  security_enabled: boolean;
  open_issues: number;
  security_issues: number;
  last_activity: string;
}
