import { Octokit } from '@octokit/rest';
import type { GitHubEvent } from '../types/index.js';

function isGitHubEvent(item: unknown): item is GitHubEvent {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.actor === 'object' &&
    obj.actor !== null &&
    typeof obj.repo === 'object' &&
    obj.repo !== null &&
    typeof obj.created_at === 'string'
  );
}

export class GitHubEventsFetcher {
  private readonly octokit: Octokit;
  private readonly org: string;
  private etag: string | null = null;
  private lastPollInterval = 30;
  private readonly seenEventIds = new Set<string>();

  constructor(token: string, org: string) {
    this.octokit = new Octokit({ auth: token });
    this.org = org;
  }

  async fetchNewEvents(): Promise<GitHubEvent[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.etag) {
        headers['if-none-match'] = this.etag;
      }

      const response = await this.octokit.request('GET /orgs/{org}/events', {
        org: this.org,
        per_page: 100,
        headers,
      });

      const etag = response.headers.etag;
      if (typeof etag === 'string') {
        this.etag = etag;
      }

      const pollInterval = response.headers['x-poll-interval'];
      if (typeof pollInterval === 'string') {
        const parsed = Number.parseInt(pollInterval, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          this.lastPollInterval = parsed;
        }
      }

      const events: GitHubEvent[] = (response.data as unknown[])
        .filter(isGitHubEvent)
        .filter((event) => !this.seenEventIds.has(event.id));

      for (const event of events) {
        this.seenEventIds.add(event.id);
      }

      return events;
    } catch (error) {
      if (
        error instanceof Error &&
        'status' in error &&
        (error as Error & { status: number }).status === 304
      ) {
        return [];
      }
      throw error;
    }
  }

  getMinPollIntervalSeconds(): number {
    return this.lastPollInterval;
  }

  seedSeenIds(events: GitHubEvent[]): void {
    for (const event of events) {
      this.seenEventIds.add(event.id);
    }
  }
}
