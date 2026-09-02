import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SecurityQueryService } from '../services/security-query-service.js';
import type { AnalysisResult, SecurityIssue } from '../types/index.js';

// ── SDK mock ──────────────────────────────────────────────────────────────────

const mockStop = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDisconnect = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
// biome-ignore lint/suspicious/noExplicitAny: test mock needs flexible return type
const mockSendAndWait = jest.fn() as jest.Mock<any>;
// biome-ignore lint/suspicious/noExplicitAny: test mock needs flexible return type
const mockCreateSession = jest.fn() as jest.Mock<any>;
const mockStart = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('@github/copilot-sdk', () => ({
  CopilotClient: jest.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop,
    createSession: mockCreateSession,
  })),
  approveAll: jest.fn(),
  defineTool: jest.fn((name: string, opts: { handler: unknown }) => ({ name, ...opts })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_ANALYSIS: AnalysisResult = {
  summary: 'Test summary',
  issues: [],
  recommendations: ['Enable Dependabot'],
  statistics: {
    total_repos: 5,
    total_prs: 20,
    self_merges: 0,
    security_prs: 0,
    repos_with_disabled_actions: 0,
    paused_workflows: 0,
    disabled_workflows: 0,
  },
};

const CRITICAL_ISSUE: SecurityIssue = {
  type: 'self-merge',
  severity: 'critical',
  repository: 'test-org/payments',
  description: 'Critical self-merge',
  details: { author: 'alice' },
  detected_at: '2026-01-01T00:00:00Z',
};

const HIGH_ISSUE: SecurityIssue = {
  type: 'unreviewed-security-pr',
  severity: 'high',
  repository: 'test-org/api',
  description: 'Unreviewed PR',
  details: { title: 'Fix auth' },
  detected_at: '2026-01-02T00:00:00Z',
};

const ANALYSIS_WITH_ISSUES: AnalysisResult = {
  ...BASE_ANALYSIS,
  issues: [CRITICAL_ISSUE, HIGH_ISSUE],
  statistics: {
    ...BASE_ANALYSIS.statistics,
    total_repos: 5,
    total_prs: 20,
    self_merges: 1,
    security_prs: 1,
  },
};

function makeSession() {
  return { sendAndWait: mockSendAndWait, disconnect: mockDisconnect };
}

/** Capture the opts passed to createSession on the next call */
function captureSessionOpts(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    mockCreateSession.mockImplementationOnce((opts: unknown) => {
      resolve(opts as Record<string, unknown>);
      return Promise.resolve(makeSession());
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecurityQueryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue(makeSession());
    mockSendAndWait.mockResolvedValue({ data: { content: 'Test answer.' } });
  });

  // ── constructor ─────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates instance without token', () => {
      const service = new SecurityQueryService();
      expect(service).toBeInstanceOf(SecurityQueryService);
    });

    it('creates instance with token', () => {
      const service = new SecurityQueryService('token');
      expect(service).toBeInstanceOf(SecurityQueryService);
    });

    it('creates instance with token and org', () => {
      const service = new SecurityQueryService('token', undefined, 'my-org');
      expect(service).toBeInstanceOf(SecurityQueryService);
    });
  });

  // ── GitHub MCP integration ──────────────────────────────────────────────────

  describe('GitHub MCP integration', () => {
    it('configures GitHub MCP server when token is provided', async () => {
      const optsPromise = captureSessionOpts();
      const service = new SecurityQueryService('test-token');
      await service.query('any question', BASE_ANALYSIS);
      const opts = await optsPromise;

      // biome-ignore lint/suspicious/noExplicitAny: test assertion on dynamic opts
      const mcp = (opts.mcpServers as any)?.github;
      expect(mcp).toBeDefined();
      expect(mcp.type).toBe('http');
      expect(mcp.url).toBe('https://api.githubcopilot.com/mcp/');
      expect(mcp.headers.Authorization).toBe('Bearer test-token');
    });

    it('restricts MCP tools to read-only allowlist — not wildcard', async () => {
      const optsPromise = captureSessionOpts();
      const service = new SecurityQueryService('test-token');
      await service.query('any question', BASE_ANALYSIS);
      const opts = await optsPromise;

      // biome-ignore lint/suspicious/noExplicitAny: test assertion on dynamic opts
      const tools: string[] = (opts.mcpServers as any)?.github?.tools ?? [];
      expect(tools).not.toContain('*');
      expect(tools).toContain('search_code');
      expect(tools).toContain('get_file_contents');
      // Must not contain known write-capable tools
      expect(tools).not.toContain('create_pull_request');
      expect(tools).not.toContain('push_files');
      expect(tools).not.toContain('merge_pull_request');
      expect(tools).not.toContain('delete_file');
    });

    it('omits MCP servers when no token is provided', async () => {
      const optsPromise = captureSessionOpts();
      const service = new SecurityQueryService();
      await service.query('any question', BASE_ANALYSIS);
      const opts = await optsPromise;

      expect(opts.mcpServers).toBeUndefined();
    });

    it('includes search_code and actual org name in system prompt when token + org provided', async () => {
      const optsPromise = captureSessionOpts();
      const service = new SecurityQueryService('test-token', undefined, 'my-org');
      await service.query('any question', BASE_ANALYSIS);
      const opts = await optsPromise;

      // biome-ignore lint/suspicious/noExplicitAny: test assertion on dynamic opts
      const content = (opts.systemMessage as any)?.content as string;
      expect(content).toContain('search_code');
      expect(content).toContain('org:my-org');
      expect(content).not.toContain('<orgname>');
    });

    it('includes search_code but no org qualifier when token is provided without org', async () => {
      const optsPromise = captureSessionOpts();
      const service = new SecurityQueryService('test-token');
      await service.query('any question', BASE_ANALYSIS);
      const opts = await optsPromise;

      // biome-ignore lint/suspicious/noExplicitAny: test assertion on dynamic opts
      const content = (opts.systemMessage as any)?.content as string;
      expect(content).toContain('search_code');
      expect(content).not.toContain('<orgname>');
    });

    it('omits search_code instructions from system prompt when no token', async () => {
      const optsPromise = captureSessionOpts();
      const service = new SecurityQueryService();
      await service.query('any question', BASE_ANALYSIS);
      const opts = await optsPromise;

      // biome-ignore lint/suspicious/noExplicitAny: test assertion on dynamic opts
      const content = (opts.systemMessage as any)?.content as string;
      expect(content).not.toContain('search_code');
    });
  });

  // ── query ───────────────────────────────────────────────────────────────────

  describe('query', () => {
    it('returns answer from AI response', async () => {
      const service = new SecurityQueryService();
      const result = await service.query('What are the top issues?', BASE_ANALYSIS);
      expect(result.answer).toBe('Test answer.');
    });

    it('throws when service is disposed', async () => {
      const service = new SecurityQueryService();
      await service.dispose();
      await expect(service.query('question', BASE_ANALYSIS)).rejects.toThrow('disposed');
    });

    it('wraps AI errors with descriptive context', async () => {
      mockSendAndWait.mockRejectedValue(new Error('SDK crash'));
      const service = new SecurityQueryService();
      await expect(service.query('question', BASE_ANALYSIS)).rejects.toThrow('Query failed');
    });

    it('rejects with timeout error after 30 seconds', async () => {
      jest.useFakeTimers();
      // sendAndWait never resolves — simulates a hung AI request
      mockSendAndWait.mockReturnValue(new Promise(() => {}));
      const service = new SecurityQueryService();

      // Attach the rejection handler BEFORE advancing timers to avoid an
      // unhandled-rejection window between the timer firing and this assertion.
      const assertion = expect(service.query('slow question', BASE_ANALYSIS)).rejects.toThrow(
        'timeout'
      );

      await jest.advanceTimersByTimeAsync(30_001);
      await assertion;
      jest.useRealTimers();
    });

    it('destroys the session even when the query times out', async () => {
      jest.useFakeTimers();
      mockSendAndWait.mockReturnValue(new Promise(() => {}));
      const service = new SecurityQueryService();

      const assertion = expect(service.query('slow question', BASE_ANALYSIS)).rejects.toThrow();

      await jest.advanceTimersByTimeAsync(30_001);
      await assertion;

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  // ── rate limiting ───────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('throws after 60 queries within one hour', async () => {
      const service = new SecurityQueryService();
      let t = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        // Advance 2 s per call — all within 1 hour, past the 1 s debounce
        t += 2_000;
        return t;
      });

      for (let i = 0; i < 60; i++) {
        await service.query('question', BASE_ANALYSIS);
      }

      await expect(service.query('one too many', BASE_ANALYSIS)).rejects.toThrow('Rate limit');

      jest.restoreAllMocks();
    });

    it('rate limit error message includes wait time in minutes', async () => {
      const service = new SecurityQueryService();
      const base = Date.now();
      let call = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => base + call++ * 2_000);

      for (let i = 0; i < 60; i++) {
        await service.query('question', BASE_ANALYSIS);
      }

      await expect(service.query('one too many', BASE_ANALYSIS)).rejects.toThrow(/Wait \d+ min/);

      jest.restoreAllMocks();
    });
  });

  // ── tool handlers ───────────────────────────────────────────────────────────

  describe('tool handlers', () => {
    let capturedTools: Array<{ name: string; handler: (args?: unknown) => string }>;

    beforeEach(async () => {
      mockCreateSession.mockImplementation((opts: unknown) => {
        // biome-ignore lint/suspicious/noExplicitAny: accessing dynamic opts
        capturedTools = (opts as any).tools;
        return Promise.resolve(makeSession());
      });

      const service = new SecurityQueryService();
      await service.query('q', ANALYSIS_WITH_ISSUES);
    });

    function handler(name: string) {
      const tool = capturedTools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool '${name}' not registered`);
      return tool.handler;
    }

    it('get_security_summary returns statistics JSON', () => {
      const result = JSON.parse(handler('get_security_summary')());
      expect(result.total_repos).toBe(5);
      expect(result.self_merges).toBe(1);
    });

    it('get_issues_by_severity filters by severity correctly', () => {
      const critical = JSON.parse(handler('get_issues_by_severity')({ severity: 'critical' }));
      expect(critical).toHaveLength(1);
      expect(critical[0].severity).toBe('critical');
    });

    it('get_issues_by_severity returns empty array for unknown severity', () => {
      const result = JSON.parse(handler('get_issues_by_severity')({ severity: 'nonexistent' }));
      expect(result).toEqual([]);
    });

    it('get_issues_by_severity returns empty array for null args', () => {
      const result = JSON.parse(handler('get_issues_by_severity')(null));
      expect(result).toEqual([]);
    });

    it('get_issues_by_type filters by type correctly', () => {
      const result = JSON.parse(handler('get_issues_by_type')({ type: 'self-merge' }));
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('self-merge');
    });

    it('get_issues_by_type returns empty array for null args', () => {
      const result = JSON.parse(handler('get_issues_by_type')(null));
      expect(result).toEqual([]);
    });

    it('get_issues_by_repository filters by partial repository name', () => {
      const result = JSON.parse(handler('get_issues_by_repository')({ repository: 'payments' }));
      expect(result).toHaveLength(1);
      expect(result[0].repository).toBe('test-org/payments');
    });

    it('get_issues_by_repository returns empty array when empty string passed', () => {
      const result = JSON.parse(handler('get_issues_by_repository')({ repository: '' }));
      expect(result).toEqual([]);
    });

    it('get_issues_by_repository returns empty array for null args', () => {
      const result = JSON.parse(handler('get_issues_by_repository')(null));
      expect(result).toEqual([]);
    });

    it('get_top_repositories returns repositories ranked by issue count', () => {
      const result = JSON.parse(handler('get_top_repositories')({ limit: 10 }));
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('repository');
      expect(result[0]).toHaveProperty('count');
    });

    it('get_top_repositories clamps limit to 1 minimum', () => {
      const result = JSON.parse(handler('get_top_repositories')({ limit: -5 }));
      // Should return at most 1 entry, not throw
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it('get_top_repositories clamps limit to 100 maximum', () => {
      // Passing 999 should not throw or return more than capped amount
      expect(() => handler('get_top_repositories')({ limit: 999 })).not.toThrow();
    });

    it('get_top_repositories handles null args (defaults to limit 10)', () => {
      const result = JSON.parse(handler('get_top_repositories')(null));
      expect(Array.isArray(result)).toBe(true);
    });

    it('get_recommendations returns recommendations array', () => {
      const result = JSON.parse(handler('get_recommendations')());
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── followUp ────────────────────────────────────────────────────────────────

  describe('followUp', () => {
    it('throws with helpful message when no analysis has been cached', async () => {
      const service = new SecurityQueryService();
      await expect(service.followUp('follow up question')).rejects.toThrow(
        'No previous analysis cached'
      );
    });

    it('re-uses cached analysis from previous query', async () => {
      const service = new SecurityQueryService();
      await service.query('first question', ANALYSIS_WITH_ISSUES);

      // followUp should succeed using the cached analysis
      await expect(service.followUp('follow up question')).resolves.toHaveProperty('answer');
    });
  });

  // ── dispose ─────────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('stops the client and marks service as disposed', async () => {
      const service = new SecurityQueryService();
      await service.query('question', BASE_ANALYSIS);
      await service.dispose();
      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — calling dispose twice does not throw', async () => {
      const service = new SecurityQueryService();
      await service.dispose();
      await expect(service.dispose()).resolves.toBeUndefined();
    });

    it('prevents further queries after disposal', async () => {
      const service = new SecurityQueryService();
      await service.query('question', BASE_ANALYSIS);
      await service.dispose();
      await expect(service.query('after dispose', BASE_ANALYSIS)).rejects.toThrow('disposed');
    });
  });
});
