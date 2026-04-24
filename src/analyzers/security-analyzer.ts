import type {
  AnalysisResult,
  PullRequest,
  Repository,
  SecurityIssue,
  WorkflowRun,
} from '../types/index.js';

export class SecurityAnalyzer {
  analyzeSelfMerges(pullRequests: PullRequest[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    for (const pr of pullRequests) {
      if (pr.author === pr.merged_by && pr.merged_by !== null) {
        issues.push({
          type: 'self-merge',
          severity: pr.is_security_related ? 'high' : 'medium',
          repository: pr.repository,
          description: `PR #${pr.number} was self-merged by ${pr.author}`,
          details: {
            pr_number: pr.number,
            title: pr.title,
            url: pr.url,
            author: pr.author,
            merged_at: pr.merged_at ?? undefined,
            is_security_related: pr.is_security_related,
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return issues;
  }

  analyzeSecurityPRs(pullRequests: PullRequest[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    for (const pr of pullRequests) {
      if (pr.is_security_related) {
        // Check if the PR was reviewed by someone other than the author
        const wasSelfMerged = pr.author === pr.merged_by;

        // Determine severity based on keywords in title
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
        const titleLower = pr.title.toLowerCase();

        if (titleLower.includes('critical') || titleLower.includes('cve')) {
          severity = 'critical';
        } else if (titleLower.includes('high') || titleLower.includes('vulnerability')) {
          severity = 'high';
        } else if (titleLower.includes('dependabot')) {
          severity = 'low';
        }

        issues.push({
          type: 'security-pr',
          severity,
          repository: pr.repository,
          description: `Security-related PR #${pr.number}: ${pr.title}`,
          details: {
            pr_number: pr.number,
            title: pr.title,
            url: pr.url,
            author: pr.author,
            merged_by: pr.merged_by ?? undefined,
            merged_at: pr.merged_at ?? undefined,
            was_self_merged: wasSelfMerged,
            labels: pr.labels,
            files_changed: pr.files_changed.slice(0, 10), // Limit to first 10 files
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return issues;
  }

  analyzeDisabledActions(repositories: Repository[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    for (const repo of repositories) {
      if (!repo.actions_enabled) {
        issues.push({
          type: 'disabled-actions',
          severity: 'medium',
          repository: repo.full_name,
          description: `GitHub Actions is disabled on ${repo.name}`,
          details: {
            repo_name: repo.name,
            full_name: repo.full_name,
            is_private: repo.private,
            security_enabled: repo.security_enabled,
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return issues;
  }

  analyzeUnreviewedSecurityPRs(pullRequests: PullRequest[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    for (const pr of pullRequests) {
      if (pr.is_security_related && pr.author === pr.merged_by) {
        issues.push({
          type: 'unreviewed-security-pr',
          severity: 'critical',
          repository: pr.repository,
          description: `Security PR #${pr.number} was merged without external review`,
          details: {
            pr_number: pr.number,
            title: pr.title,
            url: pr.url,
            author: pr.author,
            merged_at: pr.merged_at ?? undefined,
            files_changed: pr.files_changed.slice(0, 10),
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return issues;
  }

  analyzePausedWorkflows(repositories: Repository[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    for (const repo of repositories) {
      if (!repo.workflows) continue;

      const pausedWorkflows = repo.workflows.filter((w) => w.state === 'disabled_inactivity');

      for (const workflow of pausedWorkflows) {
        issues.push({
          type: 'paused-workflow',
          severity: workflow.is_scheduled ? 'medium' : 'low',
          repository: repo.full_name,
          description: `Workflow "${workflow.name}" was paused due to repository inactivity`,
          details: {
            workflow_name: workflow.name,
            workflow_path: workflow.path,
            workflow_url: workflow.url,
            is_scheduled: workflow.is_scheduled,
            updated_at: workflow.updated_at,
            reason: 'Workflows are automatically disabled after 60 days of repository inactivity',
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return issues;
  }

  analyzeDisabledWorkflows(repositories: Repository[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    for (const repo of repositories) {
      if (!repo.workflows) continue;

      const disabledWorkflows = repo.workflows.filter((w) => w.state === 'disabled_manually');

      for (const workflow of disabledWorkflows) {
        issues.push({
          type: 'disabled-workflow',
          severity: 'low',
          repository: repo.full_name,
          description: `Workflow "${workflow.name}" has been manually disabled`,
          details: {
            workflow_name: workflow.name,
            workflow_path: workflow.path,
            workflow_url: workflow.url,
            is_scheduled: workflow.is_scheduled,
            updated_at: workflow.updated_at,
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return issues;
  }

  analyzeActionFailures(runs: WorkflowRun[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    // Group failures by repository and workflow
    const failuresByRepo = new Map<string, WorkflowRun[]>();

    for (const run of runs) {
      if (run.conclusion === 'failure') {
        const key = `${run.repository}:${run.workflow_name}`;
        if (!failuresByRepo.has(key)) {
          failuresByRepo.set(key, []);
        }
        failuresByRepo.get(key)!.push(run);
      }
    }

    // Detect repeated failures (same workflow failing multiple times)
    for (const [key, failures] of failuresByRepo) {
      const [repo, workflow] = key.split(':');

      if (failures.length >= 3) {
        // High severity: 3+ consecutive failures
        issues.push({
          type: 'repeated_action_failure',
          severity: 'high',
          repository: repo,
          description: `Workflow "${workflow}" failed ${failures.length} times in recent runs`,
          details: {
            workflow_name: workflow,
            failure_count: failures.length,
            recent_runs: failures.slice(0, 5).map((r) => ({
              run_number: r.run_number,
              created_at: r.created_at,
              head_branch: r.head_branch,
            })),
          },
          detected_at: new Date().toISOString(),
        });
      } else if (failures.length >= 1) {
        // Medium: Single failure
        const failure = failures[0];
        issues.push({
          type: 'action_failure',
          severity: 'medium',
          repository: repo,
          description: `Workflow "${workflow}" run #${failure.run_number} failed on ${failure.head_branch}`,
          details: {
            workflow_name: workflow,
            run_number: failure.run_number,
            run_id: failure.id,
            head_branch: failure.head_branch,
            head_sha: failure.head_sha,
            event: failure.event,
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return issues;
  }

  generateAnalysisResult(
    repositories: Repository[],
    pullRequests: PullRequest[],
    workflowRuns?: WorkflowRun[]
  ): AnalysisResult {
    const selfMergeIssues = this.analyzeSelfMerges(pullRequests);
    const securityPRIssues = this.analyzeSecurityPRs(pullRequests);
    const disabledActionsIssues = this.analyzeDisabledActions(repositories);
    const unreviewedSecurityIssues = this.analyzeUnreviewedSecurityPRs(pullRequests);
    const pausedWorkflowIssues = this.analyzePausedWorkflows(repositories);
    const disabledWorkflowIssues = this.analyzeDisabledWorkflows(repositories);
    const actionFailureIssues = workflowRuns ? this.analyzeActionFailures(workflowRuns) : [];

    const allIssues = [
      ...selfMergeIssues,
      ...securityPRIssues,
      ...disabledActionsIssues,
      ...unreviewedSecurityIssues,
      ...pausedWorkflowIssues,
      ...disabledWorkflowIssues,
      ...actionFailureIssues,
    ];

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const recommendations: string[] = [];

    if (selfMergeIssues.length > 0) {
      recommendations.push(
        'Implement branch protection rules requiring at least one review before merging'
      );
    }

    if (unreviewedSecurityIssues.length > 0) {
      recommendations.push(
        'Require CODEOWNERS review for security-sensitive files and directories'
      );
    }

    if (disabledActionsIssues.length > 0) {
      recommendations.push(
        'Enable GitHub Actions to automate security scanning and CI/CD workflows'
      );
    }

    if (pausedWorkflowIssues.length > 0) {
      recommendations.push(
        'Re-enable paused workflows or commit to repositories to prevent automatic workflow disabling'
      );
    }

    if (disabledWorkflowIssues.length > 0) {
      recommendations.push('Review manually disabled workflows and re-enable if still needed');
    }

    if (securityPRIssues.length > 5) {
      recommendations.push('Consider implementing automated dependency updates with Dependabot');
    }

    const summary = this.generateSummary(allIssues, repositories, pullRequests);

    return {
      summary,
      issues: allIssues,
      recommendations,
      statistics: {
        total_repos: repositories.length,
        total_prs: pullRequests.length,
        self_merges: selfMergeIssues.length,
        security_prs: securityPRIssues.length,
        repos_with_disabled_actions: disabledActionsIssues.length,
        paused_workflows: pausedWorkflowIssues.length,
        disabled_workflows: disabledWorkflowIssues.length,
      },
    };
  }

  private generateSummary(
    issues: SecurityIssue[],
    repositories: Repository[],
    pullRequests: PullRequest[]
  ): string {
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const high = issues.filter((i) => i.severity === 'high').length;
    const medium = issues.filter((i) => i.severity === 'medium').length;
    const low = issues.filter((i) => i.severity === 'low').length;

    return (
      `Analyzed ${repositories.length} repositories and ${pullRequests.length} pull requests. ` +
      `Found ${issues.length} total issues: ` +
      `${critical} critical, ${high} high, ${medium} medium, ${low} low severity.`
    );
  }
}
