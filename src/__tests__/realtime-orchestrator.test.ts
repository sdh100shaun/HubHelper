import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RealtimeOrchestrator } from '../services/realtime-orchestrator.js';
import type { GitHubEvent, SecurityIssue, StreamConfig } from '../types/index.js';

// Mock all dependencies
jest.mock('../services/github-events-fetcher.js');
jest.mock('../services/github-fetcher.js');
jest.mock('../policy/engine.js');
jest.mock('../reporters/stream-reporter.js');

import { PolicyEngine } from '../policy/engine.js';
import { StreamReporter } from '../reporters/stream-reporter.js';
import { GitHubEventsFetcher } from '../services/github-events-fetcher.js';
import { GitHubFetcher } from '../services/github-fetcher.js';

// biome-ignore lint/suspicious/noExplicitAny: Test mocks use any types
type AnyMock = jest.MockedClass<any>;

function makeStreamConfig(overrides: Partial<StreamConfig> = {}): StreamConfig {
  return {
    organization: 'test-org',
    token: 'test-token',
    pollIntervalSeconds: 30,
    minSeverity: 'medium',
    profilePath: 'policies/default.yaml',
    showCompliant: false,
    verbose: false,
    ...overrides,
  };
}

function makePREvent(id = '1', merged = true): GitHubEvent {
  return {
    id,
    type: 'PullRequestEvent',
    actor: { login: 'author' },
    repo: { id: 1, name: 'org/repo', url: '' },
    payload: {
      action: 'closed',
      number: 1,
      pull_request: {
        number: 1,
        title: 'Test PR',
        body: null,
        html_url: '',
        user: { login: 'author' },
        merged_by: { login: 'merger' },
        merged_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        labels: [],
        merged,
      },
    },
    created_at: new Date().toISOString(),
    public: true,
  };
}

function makeWorkflowEvent(id = '2', conclusion = 'failure'): GitHubEvent {
  return {
    id,
    type: 'WorkflowRunEvent',
    actor: { login: 'user' },
    repo: { id: 1, name: 'org/repo', url: '' },
    payload: {
      action: 'completed',
      workflow_run: {
        id: 100,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'abc123',
        status: 'completed',
        conclusion,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        workflow_id: 10,
        run_number: 1,
        event: 'push',
        run_attempt: 1,
        html_url: '',
      },
    },
    created_at: new Date().toISOString(),
    public: true,
  };
}

function makeIssue(repository = 'org/repo', prNumber?: number): SecurityIssue {
  return {
    type: 'self-merge',
    severity: 'high',
    repository,
    description: `Self-merge detected in ${repository}`,
    details: prNumber !== undefined ? { pr_number: prNumber } : {},
    detected_at: new Date().toISOString(),
  };
}

describe('RealtimeOrchestrator', () => {
  // biome-ignore lint/suspicious/noExplicitAny: Test mock instances
  let mockEventsFetcher: any;
  // biome-ignore lint/suspicious/noExplicitAny: Test mock instances
  let mockGhFetcher: any;
  // biome-ignore lint/suspicious/noExplicitAny: Test mock instances
  let mockEngine: any;
  // biome-ignore lint/suspicious/noExplicitAny: Test mock instances
  let mockReporter: any;
  let orchestrator: RealtimeOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEventsFetcher = {
      fetchNewEvents: jest.fn<() => Promise<GitHubEvent[]>>().mockResolvedValue([]),
      getMinPollIntervalSeconds: jest.fn<() => number>().mockReturnValue(0),
      seedSeenIds: jest.fn<() => void>(),
    };
    (GitHubEventsFetcher as AnyMock).mockImplementation(() => mockEventsFetcher);

    mockGhFetcher = {
      getRepositories: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
    };
    (GitHubFetcher as AnyMock).mockImplementation(() => mockGhFetcher);

    mockEngine = {
      loadPolicy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      evaluate: jest
        .fn<() => Promise<{ issues: SecurityIssue[]; statistics: object; policy: object }>>()
        .mockResolvedValue({
          issues: [],
          statistics: {
            controlsEvaluated: 0,
            totalIssues: 0,
            issuesBySeverity: {},
            executionTimeMs: 0,
          },
          policy: {},
        }),
    };
    (PolicyEngine as AnyMock).mockImplementation(() => mockEngine);

    mockReporter = {
      printBanner: jest.fn<() => void>(),
      printEvent: jest.fn<() => void>(),
      printShutdown: jest.fn<() => void>(),
      printInlineError: jest.fn<() => void>(),
    };
    (StreamReporter as AnyMock).mockImplementation(() => mockReporter);

    orchestrator = new RealtimeOrchestrator(makeStreamConfig());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('loads policy before entering the poll loop', async () => {
      // Set up: after the first tick, trigger shutdown
      let tickCount = 0;
      mockEventsFetcher.fetchNewEvents.mockImplementation(async () => {
        tickCount++;
        if (tickCount === 1) {
          await orchestrator.stop();
        }
        return [];
      });

      await orchestrator.start();

      expect(mockEngine.loadPolicy).toHaveBeenCalledWith('policies/default.yaml');
    });

    it('fetches repository cache at startup', async () => {
      mockEventsFetcher.fetchNewEvents.mockImplementationOnce(async () => {
        await orchestrator.stop();
        return [];
      });

      await orchestrator.start();

      expect(mockGhFetcher.getRepositories).toHaveBeenCalledWith(false);
    });

    it('seeds seen IDs from initial fetch before entering loop', async () => {
      const initialEvents = [makePREvent('seed-1')];
      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce(initialEvents)
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [];
        });

      await orchestrator.start();

      expect(mockEventsFetcher.seedSeenIds).toHaveBeenCalledWith(initialEvents);
    });

    it('calls printShutdown after stop', async () => {
      mockEventsFetcher.fetchNewEvents.mockImplementationOnce(async () => {
        await orchestrator.stop();
        return [];
      });

      await orchestrator.start();

      expect(mockReporter.printShutdown).toHaveBeenCalledWith(
        expect.objectContaining({
          eventsProcessed: expect.any(Number),
          violationsFound: expect.any(Number),
          uptime: expect.any(Number),
        })
      );
    });
  });

  describe('tick — event processing', () => {
    it('calls policyEngine.evaluate when a PR event arrives', async () => {
      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([]) // initial seed fetch
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [makePREvent()];
        });

      await orchestrator.start();

      expect(mockEngine.evaluate).toHaveBeenCalled();
    });

    it('calls policyEngine.evaluate when a workflow run event arrives', async () => {
      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [makeWorkflowEvent()];
        });

      await orchestrator.start();

      expect(mockEngine.evaluate).toHaveBeenCalled();
    });

    it('does not call evaluate when event type is unmappable (e.g. PushEvent)', async () => {
      const pushEvent: GitHubEvent = {
        id: '99',
        type: 'PushEvent',
        actor: { login: 'u' },
        repo: { id: 1, name: 'org/repo', url: '' },
        payload: {},
        created_at: new Date().toISOString(),
        public: true,
      };

      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [pushEvent];
        });

      await orchestrator.start();

      expect(mockEngine.evaluate).not.toHaveBeenCalled();
    });

    it('calls reporter.printEvent when a violation meets minSeverity', async () => {
      mockEngine.evaluate.mockResolvedValue({
        issues: [makeIssue('org/repo', 1)],
        statistics: {},
        policy: {},
      });

      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [makePREvent()];
        });

      await orchestrator.start();

      expect(mockReporter.printEvent).toHaveBeenCalled();
    });

    it('does not emit violation below minSeverity', async () => {
      const lowIssue = makeIssue('org/repo', 1);
      lowIssue.severity = 'low';

      mockEngine.evaluate.mockResolvedValue({
        issues: [lowIssue],
        statistics: {},
        policy: {},
      });

      orchestrator = new RealtimeOrchestrator(makeStreamConfig({ minSeverity: 'high' }));

      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [makePREvent()];
        });

      await orchestrator.start();

      expect(mockReporter.printEvent).not.toHaveBeenCalled();
    });

    it('scopes issues to the current event repository only', async () => {
      const wrongRepoIssue = makeIssue('org/other-repo');
      mockEngine.evaluate.mockResolvedValue({
        issues: [wrongRepoIssue],
        statistics: {},
        policy: {},
      });

      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [makePREvent()];
        });

      await orchestrator.start();

      expect(mockReporter.printEvent).not.toHaveBeenCalled();
    });

    it('deduplicates identical violations within TTL', async () => {
      mockEngine.evaluate.mockResolvedValue({
        issues: [makeIssue('org/repo', 1)],
        statistics: {},
        policy: {},
      });

      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makePREvent('ev1')])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [makePREvent('ev2', true)];
        });

      await orchestrator.start();

      // Second event same violation should be suppressed
      expect(mockReporter.printEvent).toHaveBeenCalledTimes(1);
    });

    it('prints inline error and continues when evaluate throws', async () => {
      mockEngine.evaluate.mockRejectedValue(new Error('engine error'));

      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [makePREvent()];
        });

      await expect(orchestrator.start()).resolves.not.toThrow();
      expect(mockReporter.printInlineError).toHaveBeenCalled();
    });

    it('prints inline error and continues when fetchNewEvents throws', async () => {
      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          throw new Error('network error');
        });

      await expect(orchestrator.start()).resolves.not.toThrow();
      expect(mockReporter.printInlineError).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('sets isShuttingDown so the loop exits', async () => {
      mockEventsFetcher.fetchNewEvents
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          await orchestrator.stop();
          return [];
        });

      await orchestrator.start();

      // If we got here without hanging, isShuttingDown was respected
      expect(mockReporter.printShutdown).toHaveBeenCalled();
    });
  });
});
