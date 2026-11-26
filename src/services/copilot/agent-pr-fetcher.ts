/**
 * Finds pull requests opened by the Copilot coding agent and records whether
 * each merged one had an approving review from a human.
 *
 * The agent opens PRs as the `copilot-swe-agent` GitHub App. The search
 * qualifier is a constant so it can be updated in one place if GitHub
 * changes the app.
 *
 * @module services/copilot/agent-pr-fetcher
 */

import type { AgentPullRequest, RawRecord } from '../../types/copilot.js';
import { type CopilotApi, mapWithConcurrency } from './api.js';

export const CODING_AGENT_AUTHOR = 'app/copilot-swe-agent';
const PER_PAGE = 100;
/** The search API returns at most 1,000 results per query. */
const MAX_PAGES = 10;

function isBot(login: string, type?: unknown): boolean {
  return type === 'Bot' || login.endsWith('[bot]') || login.toLowerCase() === 'copilot';
}

export class AgentPullRequestFetcher {
  constructor(private readonly api: CopilotApi) {}

  async fetch(org: string, from: string, to: string): Promise<AgentPullRequest[]> {
    const q = `org:${org} is:pr author:${CODING_AGENT_AUTHOR} created:${from}..${to}`;
    const found: RawRecord[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await this.api.request<{ items?: RawRecord[] }>('GET /search/issues', {
        q,
        per_page: PER_PAGE,
        page,
      });
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      found.push(...items);
      if (items.length < PER_PAGE) break;
    }
    return mapWithConcurrency(found, 4, (item) => this.toAgentPr(org, item));
  }

  private async toAgentPr(org: string, item: RawRecord): Promise<AgentPullRequest> {
    const repoUrl = typeof item.repository_url === 'string' ? item.repository_url : '';
    const repo = repoUrl.split('/').slice(-2).join('/');
    const number = Number(item.number);
    const prInfo = (item.pull_request ?? {}) as RawRecord;
    const mergedAt = typeof prInfo.merged_at === 'string' ? prInfo.merged_at : undefined;
    const assignees = Array.isArray(item.assignees) ? (item.assignees as RawRecord[]) : [];
    const requestedBy = assignees
      .map((a) => ({ login: String(a.login ?? ''), type: a.type }))
      .find((a) => a.login && !isBot(a.login, a.type))?.login;

    let reviewers: string[] = [];
    let humanApproved = false;
    if (mergedAt && repo.includes('/')) {
      const [owner, name] = repo.split('/');
      const response = await this.api.request<RawRecord[]>(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
        { owner, repo: name, pull_number: number, per_page: 100 }
      );
      const reviews = Array.isArray(response.data) ? response.data : [];
      const humans = reviews
        .map((r) => {
          const user = (r.user ?? {}) as RawRecord;
          return { login: String(user.login ?? ''), type: user.type, state: r.state };
        })
        .filter((r) => r.login && !isBot(r.login, r.type));
      reviewers = [...new Set(humans.map((r) => r.login))];
      humanApproved = humans.some((r) => r.state === 'APPROVED');
    }

    return {
      repo,
      number,
      orgLogin: org,
      title: String(item.title ?? ''),
      url: String(item.html_url ?? ''),
      requestedBy,
      openedAt: String(item.created_at ?? ''),
      mergedAt,
      humanApproved,
      reviewers,
    };
  }
}
