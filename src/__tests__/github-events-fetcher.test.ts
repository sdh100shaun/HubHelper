import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GitHubEventsFetcher } from '../services/github-events-fetcher.js';
import type { GitHubEvent } from '../types/index.js';

const mockRequest = jest.fn<() => Promise<unknown>>();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    request: mockRequest,
  })),
}));

function makeEvent(id: string, type = 'PushEvent'): GitHubEvent {
  return {
    id,
    type,
    actor: { login: 'testuser' },
    repo: { id: 1, name: 'org/repo', url: 'https://api.github.com/repos/org/repo' },
    payload: {},
    created_at: new Date().toISOString(),
    public: true,
  };
}

function makeResponse(events: GitHubEvent[], etag = '"abc123"', pollInterval = '60') {
  return {
    data: events,
    headers: {
      etag,
      'x-poll-interval': pollInterval,
    },
    status: 200,
  };
}

describe('GitHubEventsFetcher', () => {
  let fetcher: GitHubEventsFetcher;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcher = new GitHubEventsFetcher('test-token', 'test-org');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates an instance', () => {
      expect(fetcher).toBeInstanceOf(GitHubEventsFetcher);
    });

    it('returns default poll interval of 30 before first fetch', () => {
      expect(fetcher.getMinPollIntervalSeconds()).toBe(30);
    });
  });

  describe('fetchNewEvents', () => {
    it('returns events on a successful 200 response', async () => {
      const events = [makeEvent('1'), makeEvent('2')];
      mockRequest.mockResolvedValueOnce(makeResponse(events));

      const result = await fetcher.fetchNewEvents();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('returns empty array on 304 Not Modified', async () => {
      const notModifiedError = Object.assign(new Error('Not Modified'), { status: 304 });
      mockRequest.mockRejectedValueOnce(notModifiedError);

      const result = await fetcher.fetchNewEvents();

      expect(result).toHaveLength(0);
    });

    it('rethrows non-304 errors', async () => {
      const serverError = Object.assign(new Error('Server Error'), { status: 500 });
      mockRequest.mockRejectedValueOnce(serverError);

      await expect(fetcher.fetchNewEvents()).rejects.toThrow('Server Error');
    });

    it('stores etag from response and sends it in subsequent requests', async () => {
      const events = [makeEvent('1')];
      mockRequest.mockResolvedValueOnce(makeResponse(events, '"etag-value-1"'));
      await fetcher.fetchNewEvents();

      mockRequest.mockResolvedValueOnce(makeResponse([], '"etag-value-2"'));
      await fetcher.fetchNewEvents();

      const secondCallHeaders = mockRequest.mock.calls[1] as Array<Record<string, unknown>>;
      const headers = secondCallHeaders[1]?.headers as Record<string, string> | undefined;
      expect(headers?.['if-none-match']).toBe('"etag-value-1"');
    });

    it('updates poll interval from x-poll-interval header', async () => {
      mockRequest.mockResolvedValueOnce(makeResponse([], '"e"', '45'));
      await fetcher.fetchNewEvents();

      expect(fetcher.getMinPollIntervalSeconds()).toBe(45);
    });

    it('ignores invalid x-poll-interval header values', async () => {
      mockRequest.mockResolvedValueOnce(makeResponse([], '"e"', 'not-a-number'));
      await fetcher.fetchNewEvents();

      expect(fetcher.getMinPollIntervalSeconds()).toBe(30);
    });

    it('filters out already-seen event IDs', async () => {
      const event1 = makeEvent('100');
      mockRequest.mockResolvedValueOnce(makeResponse([event1]));
      await fetcher.fetchNewEvents();

      const event2 = makeEvent('101');
      mockRequest.mockResolvedValueOnce(makeResponse([event1, event2]));
      const result = await fetcher.fetchNewEvents();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('101');
    });

    it('silently skips malformed items that fail the type guard', async () => {
      const malformed = { id: 123, no_type: true };
      const valid = makeEvent('200');
      mockRequest.mockResolvedValueOnce({
        data: [malformed, valid],
        headers: { etag: '"e"', 'x-poll-interval': '30' },
        status: 200,
      });

      const result = await fetcher.fetchNewEvents();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('200');
    });
  });

  describe('seedSeenIds', () => {
    it('prevents seeded events from appearing in subsequent fetches', async () => {
      const event = makeEvent('999');
      fetcher.seedSeenIds([event]);

      mockRequest.mockResolvedValueOnce(makeResponse([event, makeEvent('1000')]));
      const result = await fetcher.fetchNewEvents();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1000');
    });

    it('accepts an empty array without error', () => {
      expect(() => fetcher.seedSeenIds([])).not.toThrow();
    });
  });
});
