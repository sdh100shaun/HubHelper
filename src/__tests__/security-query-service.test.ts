import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SecurityQueryService } from '../services/security-query-service.js';
import type { AnalysisResult } from '../types/index.js';

// ── SDK mock ──────────────────────────────────────────────────────────────────

const mockStop = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDestroy = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
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

function makeSession() {
  return { sendAndWait: mockSendAndWait, destroy: mockDestroy };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecurityQueryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue(makeSession());
    mockSendAndWait.mockResolvedValue({ data: { content: 'Test answer.' } });
  });

  describe('constructor', () => {
    it('creates instance without token', () => {
      const service = new SecurityQueryService();
      expect(service).toBeInstanceOf(SecurityQueryService);
    });

    it('creates instance with token', () => {
      const service = new SecurityQueryService('token');
      expect(service).toBeInstanceOf(SecurityQueryService);
    });
  });

  describe('GitHub MCP integration', () => {
    it('configures GitHub MCP server when token is provided', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: capturing session config for assertion
      let capturedOpts: any;
      mockCreateSession.mockImplementation((opts: unknown) => {
        capturedOpts = opts;
        return Promise.resolve(makeSession());
      });

      const service = new SecurityQueryService('test-token');
      await service.query('any question', BASE_ANALYSIS);

      expect(capturedOpts.mcpServers).toBeDefined();
      expect(capturedOpts.mcpServers.github.type).toBe('http');
      expect(capturedOpts.mcpServers.github.url).toBe('https://api.githubcopilot.com/mcp/');
      expect(capturedOpts.mcpServers.github.headers.Authorization).toBe('Bearer test-token');
    });

    it('omits MCP servers when no token is provided', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: capturing session config for assertion
      let capturedOpts: any;
      mockCreateSession.mockImplementation((opts: unknown) => {
        capturedOpts = opts;
        return Promise.resolve(makeSession());
      });

      const service = new SecurityQueryService();
      await service.query('any question', BASE_ANALYSIS);

      expect(capturedOpts.mcpServers).toBeUndefined();
    });

    it('mentions search_code in system prompt when token is provided', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: capturing session config for assertion
      let capturedOpts: any;
      mockCreateSession.mockImplementation((opts: unknown) => {
        capturedOpts = opts;
        return Promise.resolve(makeSession());
      });

      const service = new SecurityQueryService('test-token');
      await service.query('any question', BASE_ANALYSIS);

      expect(capturedOpts.systemMessage.content).toContain('search_code');
    });

    it('omits search_code instructions from system prompt when no token', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: capturing session config for assertion
      let capturedOpts: any;
      mockCreateSession.mockImplementation((opts: unknown) => {
        capturedOpts = opts;
        return Promise.resolve(makeSession());
      });

      const service = new SecurityQueryService();
      await service.query('any question', BASE_ANALYSIS);

      expect(capturedOpts.systemMessage.content).not.toContain('search_code');
    });
  });

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
  });

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
  });
});
