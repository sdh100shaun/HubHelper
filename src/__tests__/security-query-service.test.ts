import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SecurityQueryService } from '../services/security-query-service.js';
import type { AnalysisResult, CodeSearchResult } from '../types/index.js';

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

// ── CopilotService mock (used inside the tool handler) ────────────────────────

const mockExplainCode = jest.fn<() => Promise<string>>();
const mockCopilotDispose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('../services/copilot-service.js', () => ({
  CopilotService: jest.fn().mockImplementation(() => ({
    explainCode: mockExplainCode,
    dispose: mockCopilotDispose,
  })),
}));

// ── GitHubFetcher mock ────────────────────────────────────────────────────────

const mockSearchCode = jest.fn<() => Promise<CodeSearchResult[]>>();

function makeFetcher() {
  return { searchCode: mockSearchCode } as unknown as import(
    '../services/github-fetcher.js'
  ).GitHubFetcher;
}

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

const SEARCH_RESULTS: CodeSearchResult[] = [
  {
    repository: 'test-org/repo1',
    path: 'src/utils.ts',
    url: 'https://github.com/test-org/repo1/blob/main/src/utils.ts',
    sha: 'abc123',
    snippet: 'const x = eval(userInput);',
  },
];

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
    mockExplainCode.mockResolvedValue('This code calls eval which is dangerous.');
    mockSearchCode.mockResolvedValue(SEARCH_RESULTS);
  });

  describe('constructor', () => {
    it('creates instance without fetcher', () => {
      const service = new SecurityQueryService();
      expect(service).toBeInstanceOf(SecurityQueryService);
    });

    it('creates instance with fetcher', () => {
      const service = new SecurityQueryService(undefined, 'claude-sonnet-4-5', makeFetcher());
      expect(service).toBeInstanceOf(SecurityQueryService);
    });
  });

  describe('search_code_in_repositories tool', () => {
    it('calls fetcher.searchCode and copilot.explainCode and returns JSON', async () => {
      const fetcher = makeFetcher();
      const service = new SecurityQueryService('token', 'claude-sonnet-4-5', fetcher);

      // Capture the tools passed to createSession
      let capturedTools: Array<{ name: string; handler: (args: unknown) => Promise<string> }> = [];
      mockCreateSession.mockImplementation((opts: { tools: typeof capturedTools }) => {
        capturedTools = opts.tools;
        return Promise.resolve(makeSession());
      });

      await service.query('find eval usage', BASE_ANALYSIS);

      const tool = capturedTools.find((t) => t.name === 'search_code_in_repositories');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: 'eval(', max_results: 5 });
      const parsed = JSON.parse(result) as CodeSearchResult[];

      expect(mockSearchCode).toHaveBeenCalledWith('eval(', 5);
      expect(mockExplainCode).toHaveBeenCalledTimes(1);
      expect(parsed[0].explanation).toBe('This code calls eval which is dangerous.');
      expect(parsed[0].repository).toBe('test-org/repo1');
    });

    it('is absent when no fetcher is provided', async () => {
      const service = new SecurityQueryService('token');

      let capturedTools: Array<{ name: string }> = [];
      mockCreateSession.mockImplementation((opts: { tools: typeof capturedTools }) => {
        capturedTools = opts.tools;
        return Promise.resolve(makeSession());
      });

      await service.query('any question', BASE_ANALYSIS);

      const tool = capturedTools.find((t) => t.name === 'search_code_in_repositories');
      expect(tool).toBeUndefined();
    });

    it('disposes CopilotService after enriching results', async () => {
      const fetcher = makeFetcher();
      const service = new SecurityQueryService('token', 'claude-sonnet-4-5', fetcher);

      let capturedTools: Array<{ name: string; handler: (args: unknown) => Promise<string> }> = [];
      mockCreateSession.mockImplementation((opts: { tools: typeof capturedTools }) => {
        capturedTools = opts.tools;
        return Promise.resolve(makeSession());
      });

      await service.query('find code', BASE_ANALYSIS);

      const tool = capturedTools.find((t) => t.name === 'search_code_in_repositories');
      await tool!.handler({ query: 'eval(' });

      expect(mockCopilotDispose).toHaveBeenCalledTimes(1);
    });

    it('defaults max_results to 10 when not provided', async () => {
      const fetcher = makeFetcher();
      const service = new SecurityQueryService('token', 'claude-sonnet-4-5', fetcher);

      let capturedTools: Array<{ name: string; handler: (args: unknown) => Promise<string> }> = [];
      mockCreateSession.mockImplementation((opts: { tools: typeof capturedTools }) => {
        capturedTools = opts.tools;
        return Promise.resolve(makeSession());
      });

      await service.query('find code', BASE_ANALYSIS);

      const tool = capturedTools.find((t) => t.name === 'search_code_in_repositories');
      await tool!.handler({ query: 'eval(' });

      expect(mockSearchCode).toHaveBeenCalledWith('eval(', 10);
    });

    it('caps max_results at 30', async () => {
      const fetcher = makeFetcher();
      const service = new SecurityQueryService('token', 'claude-sonnet-4-5', fetcher);

      let capturedTools: Array<{ name: string; handler: (args: unknown) => Promise<string> }> = [];
      mockCreateSession.mockImplementation((opts: { tools: typeof capturedTools }) => {
        capturedTools = opts.tools;
        return Promise.resolve(makeSession());
      });

      await service.query('find code', BASE_ANALYSIS);

      const tool = capturedTools.find((t) => t.name === 'search_code_in_repositories');
      await tool!.handler({ query: 'eval(', max_results: 999 });

      expect(mockSearchCode).toHaveBeenCalledWith('eval(', 30);
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
