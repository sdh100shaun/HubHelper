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
    | 'repeated_action_failure';
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
