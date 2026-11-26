/**
 * Thin HTTP layer for the Copilot Insights fetchers.
 *
 * Fetchers depend on the small `CopilotApi` interface rather than on Octokit
 * directly, which keeps them easy to test and lets every request carry the
 * pinned API version.
 *
 * @module services/copilot/api
 */

import type { Octokit } from '@octokit/rest';

export const COPILOT_API_VERSION = '2026-03-10';

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

export interface CopilotApi {
  /** Call a REST route such as `GET /orgs/{org}/copilot/billing`. */
  request<T = unknown>(route: string, params?: Record<string, unknown>): Promise<ApiResponse<T>>;
  /**
   * Download a signed report URL. The URL already carries its own
   * credentials, so the GitHub token is never sent with it.
   */
  download(url: string): Promise<string>;
}

/** Error raised for a failed request, carrying the HTTP status. */
export class CopilotApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'CopilotApiError';
  }
}

export function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry transient failures (429, 5xx, network) with exponential backoff.
 * 4xx errors other than 429 are returned straight away.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = options.retries ?? MAX_RETRIES;
  const baseDelay = options.baseDelayMs ?? 1000;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const status = statusOf(error);
      const transient = status === undefined || status === 429 || status >= 500;
      if (!transient || attempt >= retries) throw error;
      await sleep(baseDelay * 2 ** attempt);
      attempt++;
    }
  }
}

/** Build a `CopilotApi` backed by an authenticated Octokit client. */
export function createCopilotApi(
  octokit: Octokit,
  fetchImpl: typeof fetch = fetch,
  options: { baseDelayMs?: number } = {}
): CopilotApi {
  return {
    async request<T>(route: string, params: Record<string, unknown> = {}) {
      const response = await withRetry(
        () =>
          octokit.request(route, {
            ...params,
            headers: { 'X-GitHub-Api-Version': COPILOT_API_VERSION },
          }),
        options
      );
      return { status: response.status, data: response.data as T };
    },
    async download(url: string) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        throw new CopilotApiError('Refusing to download a report over plain HTTP', 400);
      }
      return withRetry(async () => {
        const response = await fetchImpl(url, { redirect: 'follow' });
        if (!response.ok) {
          throw new CopilotApiError(`Report download failed (${response.status})`, response.status);
        }
        return response.text();
      }, options);
    },
  };
}

/** Run `worker` over `items` with at most `limit` in flight. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
