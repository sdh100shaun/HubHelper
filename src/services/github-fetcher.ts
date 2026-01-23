import { Octokit } from '@octokit/rest';
import { PullRequest, Repository } from '../types/index.js';

export class GitHubFetcher {
  private octokit: Octokit;
  private org: string;

  constructor(token: string, organization: string) {
    this.octokit = new Octokit({ auth: token });
    this.org = organization;
  }

  async getRepositories(): Promise<Repository[]> {
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
          const { data: actionsData } = await this.octokit.actions.getGithubActionsPermissionsRepository({
            owner: this.org,
            repo: repo.name,
          });
          actionsEnabled = actionsData.enabled;
        } catch (error) {
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
          securityEnabled = securityData.security_and_analysis?.secret_scanning?.status === 'enabled' ||
                           securityData.security_and_analysis?.dependabot_security_updates?.status === 'enabled';
        } catch (error) {
          securityEnabled = false;
        }

        repos.push({
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          actions_enabled: actionsEnabled,
          security_enabled: securityEnabled,
        });
      }

      if (data.length < perPage) break;
      page++;
    }

    return repos;
  }

  async getRecentPullRequests(daysBack: number = 30): Promise<PullRequest[]> {
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

          const filesChanged = files.map(f => f.filename);
          const isSecurityRelated = this.isSecurityRelated(pr.title, pr.body || '', pr.labels.map(l => l.name), filesChanged);

          allPRs.push({
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            author: pr.user?.login || 'unknown',
            merged_by: pr.merged_by?.login || null,
            merged_at: pr.merged_at,
            created_at: pr.created_at,
            repository: repo.full_name,
            labels: pr.labels.map(l => l.name),
            is_security_related: isSecurityRelated,
            files_changed: filesChanged,
          });
        }
      } catch (error) {
        console.error(`Error fetching PRs for ${repo.name}:`, error);
      }
    }

    return allPRs;
  }

  private isSecurityRelated(title: string, body: string, labels: string[], files: string[]): boolean {
    const securityKeywords = [
      'security', 'vulnerability', 'cve', 'xss', 'sql injection',
      'csrf', 'auth', 'authentication', 'authorization', 'encrypt',
      'secret', 'token', 'credential', 'dependabot', 'snyk',
      'password', 'privilege', 'permission'
    ];

    const securityLabels = ['security', 'vulnerability', 'dependabot'];
    const securityFiles = ['.github/workflows/', 'security.md', 'Dockerfile', '.env'];

    const text = `${title} ${body}`.toLowerCase();
    const hasKeyword = securityKeywords.some(keyword => text.includes(keyword));
    const hasLabel = labels.some(label => securityLabels.some(sl => label.toLowerCase().includes(sl)));
    const hasSecurityFile = files.some(file => securityFiles.some(sf => file.includes(sf)));

    return hasKeyword || hasLabel || hasSecurityFile;
  }
}
