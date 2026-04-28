/**
 * Tests for AIExplainerService
 */

import { AIExplainerService } from '../services/ai-explainer.js';
import type { SecurityIssue } from '../types/index.js';
import type { AnalysisResult } from '../types/index.js';

// ─── Mock dependencies ────────────────────────────────────────────────────

const mockComplete = jest.fn();
const mockDispose = jest.fn().mockResolvedValue(undefined);

jest.mock('../services/copilot-ai-client.js', () => ({
  CopilotAIClient: jest.fn().mockImplementation(() => ({
    complete: mockComplete,
    dispose: mockDispose,
  })),
}));

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn().mockResolvedValue(undefined);

jest.mock('../services/explanation-cache.js', () => ({
  ExplanationCache: jest.fn().mockImplementation(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
  })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<SecurityIssue> = {}): SecurityIssue {
  return {
    type: 'disabled-actions',
    severity: 'medium',
    repository: 'my-org/my-repo',
    description: 'GitHub Actions is disabled',
    details: {},
    detected_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeResult(issues: SecurityIssue[] = []): AnalysisResult {
  return {
    summary: 'test',
    issues,
    recommendations: [],
    statistics: {
      total_repos: 1,
      total_prs: 0,
      self_merges: 0,
      security_prs: 0,
      repos_with_disabled_actions: 0,
      paused_workflows: 0,
      disabled_workflows: 0,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('AIExplainerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('explainIssue()', () => {
    it('returns cached explanation when available', async () => {
      mockCacheGet.mockResolvedValueOnce('cached explanation');
      const service = new AIExplainerService();
      const result = await service.explainIssue(makeIssue());
      expect(result).toBe('cached explanation');
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('calls AI and caches result when cache misses', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockComplete.mockResolvedValueOnce('fresh explanation');

      const service = new AIExplainerService();
      const result = await service.explainIssue(makeIssue());

      expect(result).toBe('fresh explanation');
      expect(mockComplete).toHaveBeenCalledTimes(1);
      expect(mockCacheSet).toHaveBeenCalledWith(expect.any(Object), 'fresh explanation');
    });

    it('returns null when AI is unavailable', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockComplete.mockResolvedValueOnce(null);

      const service = new AIExplainerService();
      const result = await service.explainIssue(makeIssue());

      expect(result).toBeNull();
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it('does not cache when AI returns null', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockComplete.mockResolvedValueOnce(null);

      const service = new AIExplainerService();
      await service.explainIssue(makeIssue());

      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it('passes issue fields to the prompt', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockComplete.mockResolvedValueOnce('explanation');

      const issue = makeIssue({ type: 'self-merge', repository: 'org/special-repo' });
      const service = new AIExplainerService();
      await service.explainIssue(issue);

      const prompt = mockComplete.mock.calls[0][0] as string;
      expect(prompt).toContain('self-merge');
      expect(prompt).toContain('org/special-repo');
    });
  });

  describe('summarize()', () => {
    it('returns AI summary when available', async () => {
      mockComplete.mockResolvedValueOnce('executive summary text');
      const service = new AIExplainerService();
      const result = await service.summarize(makeResult([makeIssue()]));
      expect(result).toBe('executive summary text');
    });

    it('returns null when AI is unavailable', async () => {
      mockComplete.mockResolvedValueOnce(null);
      const service = new AIExplainerService();
      const result = await service.summarize(makeResult());
      expect(result).toBeNull();
    });

    it('includes statistics in the prompt', async () => {
      mockComplete.mockResolvedValueOnce('summary');
      const service = new AIExplainerService();
      await service.summarize(makeResult([makeIssue()]));

      const prompt = mockComplete.mock.calls[0][0] as string;
      expect(prompt).toContain('total_repos');
    });

    it('does not use the explanation cache for summaries', async () => {
      mockComplete.mockResolvedValueOnce('summary');
      const service = new AIExplainerService();
      await service.summarize(makeResult());
      expect(mockCacheGet).not.toHaveBeenCalled();
      expect(mockCacheSet).not.toHaveBeenCalled();
    });
  });

  describe('dispose()', () => {
    it('disposes the underlying AI client', async () => {
      const service = new AIExplainerService();
      await service.dispose();
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
  });
});
