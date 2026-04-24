import { SecurityAnalyzer } from '../analyzers/security-analyzer.js';
import type { AnalysisResult, ListReport, RepositoryReportItem } from '../types/index.js';
import { GitHubFetcher } from './github-fetcher.js';
import { RepositoryListManager } from './repository-list-manager.js';

/**
 * ListReportGenerator
 *
 * Generates comprehensive reports for repository lists
 */
export class ListReportGenerator {
  private listManager: RepositoryListManager;
  private fetcher: GitHubFetcher;
  private analyzer: SecurityAnalyzer;

  constructor(token: string, organization: string, listManager?: RepositoryListManager) {
    this.fetcher = new GitHubFetcher(token, organization);
    this.analyzer = new SecurityAnalyzer();
    this.listManager = listManager || new RepositoryListManager();
  }

  /**
   * Generate a report for a repository list
   */
  async generateReport(listName: string): Promise<ListReport> {
    const list = this.listManager.getList(listName);

    // Fetch all repositories
    const allRepos = await this.fetcher.getRepositories();

    // Filter to only repos in the list
    const listRepositoryNames = new Set(list.repositories);
    const listRepos = allRepos.filter((repo) => listRepositoryNames.has(repo.full_name));

    if (listRepos.length === 0) {
      throw new Error(`No repositories found for list '${listName}'`);
    }

    // Analyze each repository
    const repositoryItems: RepositoryReportItem[] = [];
    let totalIssues = 0;
    let criticalIssues = 0;
    let highIssues = 0;

    for (const repo of listRepos) {
      // Count security issues for this repo
      const repoIssues = this.countSecurityIssues(repo);

      repositoryItems.push({
        name: repo.name,
        full_name: repo.full_name,
        url: `https://github.com/${repo.full_name}`,
        actions_enabled: repo.actions_enabled,
        security_enabled: repo.security_enabled,
        open_issues: repo.open_issues_count || 0,
        security_issues: repoIssues.total,
        last_activity: repo.updated_at || new Date().toISOString(),
      });

      totalIssues += repoIssues.total;
      criticalIssues += repoIssues.critical;
      highIssues += repoIssues.high;
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(listRepos, {
      totalIssues,
      criticalIssues,
      highIssues,
    });

    return {
      list: listName,
      generated: new Date().toISOString(),
      summary: {
        totalRepos: listRepos.length,
        actionsEnabled: listRepos.filter((r) => r.actions_enabled).length,
        securityEnabled: listRepos.filter((r) => r.security_enabled).length,
        totalIssues,
        criticalIssues,
        highIssues,
      },
      repositories: repositoryItems,
      recommendations,
    };
  }

  /**
   * Generate a full analysis report (includes PR analysis)
   */
  async generateDetailedReport(listName: string, daysBack = 30): Promise<AnalysisResult> {
    const list = this.listManager.getList(listName);

    // Fetch all repositories
    const allRepos = await this.fetcher.getRepositories();

    // Filter to only repos in the list
    const listRepos = allRepos.filter((repo) =>
      list.repositories.some((listRepo) => repo.full_name === listRepo)
    );

    // Fetch PRs for these repositories
    const allPRs = await this.fetcher.getRecentPullRequests(daysBack);
    const listPRs = allPRs.filter((pr) =>
      list.repositories.some((listRepo) => pr.repository === listRepo)
    );

    // Generate full analysis
    return this.analyzer.generateAnalysisResult(listRepos, listPRs);
  }

  // Private helper methods

  private countSecurityIssues(repo: { actions_enabled: boolean; security_enabled: boolean }): {
    total: number;
    critical: number;
    high: number;
  } {
    let total = 0;
    const critical = 0;
    let high = 0;

    if (!repo.actions_enabled) {
      total++;
      high++;
    }

    if (!repo.security_enabled) {
      total++;
      high++;
    }

    return { total, critical, high };
  }

  private generateRecommendations(
    repos: Array<{ actions_enabled: boolean; security_enabled: boolean }>,
    issues: { totalIssues: number; criticalIssues: number; highIssues: number }
  ): string[] {
    const recommendations: string[] = [];

    const actionsDisabled = repos.filter((r) => !r.actions_enabled).length;
    if (actionsDisabled > 0) {
      recommendations.push(
        `⚙️ Enable GitHub Actions on ${actionsDisabled} ${actionsDisabled === 1 ? 'repository' : 'repositories'} for automated CI/CD`
      );
    }

    const securityDisabled = repos.filter((r) => !r.security_enabled).length;
    if (securityDisabled > 0) {
      recommendations.push(
        `🔒 Enable security features on ${securityDisabled} ${securityDisabled === 1 ? 'repository' : 'repositories'}`
      );
    }

    if (issues.criticalIssues > 0) {
      recommendations.push(
        `⚠️ URGENT: Address ${issues.criticalIssues} critical security ${issues.criticalIssues === 1 ? 'issue' : 'issues'} immediately`
      );
    }

    if (issues.highIssues > 0) {
      recommendations.push(
        `🔴 Review ${issues.highIssues} high-priority security ${issues.highIssues === 1 ? 'issue' : 'issues'}`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All repositories meeting security best practices');
    }

    return recommendations;
  }
}
