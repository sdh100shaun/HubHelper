import type { Octokit } from '@octokit/rest';
import type {
  ApprovedEmailConfig,
  CodeSearchResult,
  PullRequest,
  Repository,
  UserProfile,
  Workflow,
  WorkflowJob,
  WorkflowRun,
} from '../types/index.js';
import { isSecurityRelated } from '../utils/security-utils.js';
import { type AuthConfig, createGitHubClient } from './github-auth.js';

export class GitHubFetcher {
  private octokit: Octokit;
  private org: string;
  private cachedRepos: Repository[] | null = null;

  constructor(auth: string | AuthConfig, organization: string) {
    const config: AuthConfig = typeof auth === 'string' ? { mode: 'pat', token: auth } : auth;
    this.octokit = createGitHubClient(config);
    this.org = organization;
  }

  async getRepositories(includeWorkflows = true): Promise<Repository[]> {
    const repos: Repository[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const { data } = await this.octokit.repos.listForOrg({
        org: this.org,
        per_page: perPage,
        page,
        type: 'all',
      });

      if (data.length === 0) break;

      for (const repo of data) {
        // Check if Actions is enabled
        let actionsEnabled = false;
        try {
          const { data: actionsData } =
            await this.octokit.actions.getGithubActionsPermissionsRepository({
              owner: this.org,
              repo: repo.name,
            });
          actionsEnabled = actionsData.enabled;
        } catch (_error) {
          // If we get a 404, Actions might not be enabled
          actionsEnabled = false;
        }

        // Check security settings
        let securityEnabled = false;
        try {
          const { data: securityData } = await this.octokit.repos.get({
            owner: this.org,
            repo: repo.name,
          });
          securityEnabled =
            securityData.security_and_analysis?.secret_scanning?.status === 'enabled' ||
            securityData.security_and_analysis?.dependabot_security_updates?.status === 'enabled';
        } catch (_error) {
          securityEnabled = false;
        }

        // Get workflows if Actions is enabled and requested
        let workflows: Workflow[] | undefined;
        if (actionsEnabled && includeWorkflows) {
          workflows = await this.getWorkflows(repo.name);
        }

        repos.push({
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          actions_enabled: actionsEnabled,
          security_enabled: securityEnabled,
          workflows,
          open_issues_count: repo.open_issues_count ?? undefined,
          updated_at: repo.updated_at ?? undefined,
        });
      }

      if (data.length < perPage) break;
      page++;
    }

    // Cache repos for workflow run fetching
    this.cachedRepos = repos;

    return repos;
  }

  async getWorkflows(repoName: string): Promise<Workflow[]> {
    try {
      const { data } = await this.octokit.actions.listRepoWorkflows({
        owner: this.org,
        repo: repoName,
        per_page: 100,
      });

      return data.workflows.map((workflow) => {
        // Check if workflow has a schedule trigger
        const isScheduled = this.isScheduledWorkflow(workflow);

        return {
          id: workflow.id,
          name: workflow.name,
          path: workflow.path,
          state: workflow.state as 'active' | 'disabled_manually' | 'disabled_inactivity',
          created_at: workflow.created_at,
          updated_at: workflow.updated_at,
          url: workflow.html_url,
          badge_url: workflow.badge_url,
          is_scheduled: isScheduled,
        };
      });
    } catch (_error) {
      // If we can't fetch workflows, return empty array
      return [];
    }
  }

  private isScheduledWorkflow(workflow: { state: string }): boolean {
    // GitHub API doesn't directly expose workflow triggers, but we can infer from the name or state
    // A more accurate check would require reading the workflow file content
    // For now, we'll mark workflows as scheduled if they're disabled due to inactivity
    return workflow.state === 'disabled_inactivity';
  }

  async getRecentPullRequests(daysBack = 30): Promise<PullRequest[]> {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const repos = await this.getRepositories();
    const allPRs: PullRequest[] = [];

    for (const repo of repos) {
      try {
        const { data: prs } = await this.octokit.pulls.list({
          owner: this.org,
          repo: repo.name,
          state: 'closed',
          sort: 'updated',
          direction: 'desc',
          per_page: 100,
        });

        for (const pr of prs) {
          if (!pr.merged_at) continue;

          const mergedDate = new Date(pr.merged_at);
          if (mergedDate < since) continue;

          // Get PR files
          const { data: files } = await this.octokit.pulls.listFiles({
            owner: this.org,
            repo: repo.name,
            pull_number: pr.number,
          });

          const filesChanged = files.map((f) => f.filename);
          const securityRelated = isSecurityRelated(
            pr.title,
            pr.body || '',
            pr.labels.map((l) => l.name),
            filesChanged
          );

          // Fetch full PR details to get merged_by info
          const { data: fullPR } = await this.octokit.pulls.get({
            owner: this.org,
            repo: repo.name,
            pull_number: pr.number,
          });

          allPRs.push({
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            author: pr.user?.login || 'unknown',
            merged_by: fullPR.merged_by?.login || null,
            merged_at: pr.merged_at,
            created_at: pr.created_at,
            repository: repo.full_name,
            labels: pr.labels.map((l) => l.name),
            is_security_related: securityRelated,
            files_changed: filesChanged,
          });
        }
      } catch (error) {
        console.error(`Error fetching PRs for ${repo.name}:`, error);
      }
    }

    return allPRs;
  }

  async getRecentWorkflowRuns(lookbackDays: number): Promise<WorkflowRun[]> {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const allRuns: WorkflowRun[] = [];

    // Use cached repos if available, otherwise fetch them
    const repos = this.cachedRepos || (await this.getRepositories(false));

    for (const repo of repos) {
      try {
        const { data: runs } = await this.octokit.actions.listWorkflowRunsForRepo({
          owner: this.org,
          repo: repo.name.includes('/') ? repo.name.split('/')[1] : repo.name,
          status: 'completed',
          per_page: 100,
        });

        const recentRuns = runs.workflow_runs
          .filter((run) => new Date(run.created_at) >= since)
          .map((run) => ({
            id: run.id,
            name: run.name || null,
            head_branch: run.head_branch,
            head_sha: run.head_sha,
            status: run.status as 'completed',
            conclusion: run.conclusion as
              | 'success'
              | 'failure'
              | 'cancelled'
              | 'skipped'
              | 'timed_out'
              | null,
            created_at: run.created_at,
            updated_at: run.updated_at,
            repository: repo.full_name,
            workflow_id: run.workflow_id,
            workflow_name: run.name || 'Unknown Workflow',
            run_number: run.run_number,
            event: run.event,
            run_attempt: run.run_attempt || 1,
          }));

        allRuns.push(...recentRuns);
      } catch (error) {
        console.warn(`Failed to fetch workflow runs for ${repo.name}:`, error);
      }
    }

    return allRuns;
  }

  async getFailedJobDetails(runId: number, repo: string): Promise<WorkflowJob[]> {
    try {
      const { data: jobs } = await this.octokit.actions.listJobsForWorkflowRun({
        owner: this.org,
        repo,
        run_id: runId,
      });

      return jobs.jobs
        .filter((job) => job.conclusion === 'failure')
        .map((job) => ({
          id: job.id,
          run_id: runId,
          name: job.name,
          status: job.status as 'queued' | 'in_progress' | 'completed',
          conclusion: job.conclusion as 'success' | 'failure' | 'cancelled' | 'skipped' | null,
          started_at: job.started_at,
          completed_at: job.completed_at,
          steps:
            job.steps?.map((step) => ({
              name: step.name,
              status: step.status,
              conclusion: step.conclusion,
            })) || [],
        }));
    } catch (error) {
      console.warn(`Failed to fetch jobs for run ${runId}:`, error);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Code search
  // -----------------------------------------------------------------------

  /**
   * Search for a code pattern across all repositories in the organisation.
   * Uses the GitHub text-match preview header so each result includes a
   * `snippet` fragment surrounding the matched text.
   */
  async searchCode(query: string, maxResults = 30): Promise<CodeSearchResult[]> {
    let data: unknown;
    try {
      const response = await this.octokit.request('GET /search/code', {
        q: `${query} org:${this.org}`,
        per_page: Math.min(maxResults, 100),
        headers: { accept: 'application/vnd.github.text-match+json' },
      });
      data = response.data;
    } catch (error) {
      throw new Error(
        `Code search failed for query "${query}": ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const raw = data as {
      items?: Array<{
        repository: { full_name: string };
        path: string;
        html_url: string;
        sha: string;
        text_matches?: Array<{ fragment?: string }>;
      }>;
    };
    const items = raw.items ?? [];

    return items.map((item) => ({
      repository: item.repository.full_name,
      path: item.path,
      url: item.html_url,
      sha: item.sha,
      snippet: item.text_matches?.[0]?.fragment ?? '',
    }));
  }

  // -----------------------------------------------------------------------
  // Compliance helpers
  // -----------------------------------------------------------------------

  /**
   * List all members of the organization visible to the authenticated token
   * and resolve each one's profile (name + email). Pagination is handled
   * internally. Uses bounded concurrency to avoid rate limiting.
   */
  async getOrgMembers(): Promise<UserProfile[]> {
    const profiles: UserProfile[] = [];
    let page = 1;
    const perPage = 100;
    const concurrencyLimit = 5;

    while (true) {
      const { data: members } = await this.octokit.orgs.listMembers({
        org: this.org,
        per_page: perPage,
        page,
        role: 'all',
      });

      if (members.length === 0) break;

      // Process members in batches to avoid rate limiting
      for (let i = 0; i < members.length; i += concurrencyLimit) {
        const batch = members.slice(i, i + concurrencyLimit);
        const batchProfiles = await Promise.all(
          batch.map(async (member) => {
            const login = member.login;

            // Fetch the full user profile to get name and email
            try {
              const { data: user } = await this.octokit.users.getByUsername({
                username: login,
              });
              return {
                login,
                name: user.name || null,
                email: user.email || null,
              };
            } catch {
              // If we cannot fetch a profile, record the member with nulls so the
              // compliance checker flags them rather than silently dropping them.
              return { login, name: null, email: null };
            }
          })
        );

        profiles.push(...batchProfiles);
      }

      if (members.length < perPage) break;
      page++;
    }

    return profiles;
  }

  /**
   * Read the approved-emails JSON config from a repository.
   *
   * @param repoName  Repository inside the org that hosts the config file.
   * @param filePath  Path within the repo (default `.hubhelper/approved-emails.json`).
   * @returns         Parsed config.  Throws if the file is missing or malformed.
   */
  async getApprovedEmailConfig(
    repoName: string,
    filePath = '.hubhelper/approved-emails.json'
  ): Promise<ApprovedEmailConfig> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.org,
      repo: repoName,
      path: filePath,
    });

    // The API returns a single file object when the path is a file
    if (Array.isArray(data) || !('content' in data)) {
      throw new Error(`${filePath} is not a file or has no content`);
    }

    const raw = Buffer.from(data.content, 'base64').toString('utf-8');
    const parsed: unknown = JSON.parse(raw);

    // Minimal shape validation
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as ApprovedEmailConfig).domains)
    ) {
      throw new Error(`${filePath} does not contain a valid ApprovedEmailConfig`);
    }

    const config = parsed as ApprovedEmailConfig;

    // Normalise: lower-case every domain and exact email
    config.domains = config.domains.map((d: string) => d.toLowerCase().replace(/^\./, ''));
    if (config.exactEmails) {
      config.exactEmails = config.exactEmails.map((e: string) => e.toLowerCase());
    }

    return config;
  }
}
