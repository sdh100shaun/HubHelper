import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CopilotService } from '../services/copilot-service.js';
import type { AnalysisResult, SecurityIssue } from '../types/index.js';

// ── SDK mock setup ────────────────────────────────────────────────────────────

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
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_RESULT: AnalysisResult = {
  summary: 'Test summary',
  issues: [],
  recommendations: [],
  statistics: {
    total_repos: 10,
    total_prs: 50,
    self_merges: 0,
    security_prs: 0,
    repos_with_disabled_actions: 0,
    paused_workflows: 0,
    disabled_workflows: 0,
  },
};

const SELF_MERGE_ISSUE: SecurityIssue = {
  type: 'self-merge',
  severity: 'medium',
  repository: 'org/repo',
  description: 'Self-merge detected',
  details: { author: 'alice' },
  detected_at: '2026-01-01T00:00:00Z',
};

function makeValidAIJson(overrides: object = {}): string {
  return JSON.stringify({
    risk_level: 'low',
    insights: 'All looks good.',
    action_items: ['Enable Dependabot'],
    ...overrides,
  });
}

function makeSession() {
  return { sendAndWait: mockSendAndWait, destroy: mockDestroy };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CopilotService', () => {
  let service: CopilotService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue(makeSession());
    service = new CopilotService();
  });

  // ── analyzeWithAI ───────────────────────────────────────────────────────────

  describe('analyzeWithAI', () => {
    it('returns AI output when SDK is available and response is valid JSON', async () => {
      mockSendAndWait.mockResolvedValue({
        data: {
          content: makeValidAIJson({ risk_level: 'high', insights: 'Concerning patterns.' }),
        },
      });

      const result = await service.analyzeWithAI(BASE_RESULT);

      expect(result.risk_level).toBe('high');
      expect(result.insights).toBe('Concerning patterns.');
      expect(result.action_items).toContain('Enable Dependabot');
    });

    it('strips markdown fences from AI response', async () => {
      const wrapped = `\`\`\`json\n${makeValidAIJson({ risk_level: 'medium' })}\n\`\`\``;
      mockSendAndWait.mockResolvedValue({ data: { content: wrapped } });

      const result = await service.analyzeWithAI(BASE_RESULT);

      expect(result.risk_level).toBe('medium');
    });

    it('falls back when SDK start() throws', async () => {
      mockStart.mockRejectedValue(new Error('Copilot CLI not found'));
      service = new CopilotService();

      const result = await service.analyzeWithAI(BASE_RESULT);

      expect(typeof result.insights).toBe('string');
      expect(result.action_items.length).toBeGreaterThan(0);
      expect(mockCreateSession).not.toHaveBeenCalled();
    });

    it('falls back when sendAndWait returns undefined', async () => {
      mockSendAndWait.mockResolvedValue(undefined);

      const result = await service.analyzeWithAI(BASE_RESULT);

      expect(typeof result.insights).toBe('string');
    });

    it('falls back when AI response is not parseable JSON', async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: 'Sorry, I cannot help with that.' } });

      const result = await service.analyzeWithAI(BASE_RESULT);

      expect(typeof result.insights).toBe('string');
      expect(result.risk_level).toBe('low');
    });

    it('falls back when sendAndWait rejects', async () => {
      mockSendAndWait.mockRejectedValue(new Error('session error'));

      const result = await service.analyzeWithAI(BASE_RESULT);

      expect(typeof result.insights).toBe('string');
    });

    it('always destroys the session even when sendAndWait rejects', async () => {
      mockSendAndWait.mockRejectedValue(new Error('boom'));

      await service.analyzeWithAI(BASE_RESULT);

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('always destroys the session on success', async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: makeValidAIJson() } });

      await service.analyzeWithAI(BASE_RESULT);

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('reuses the same client across multiple calls', async () => {
      const { CopilotClient } = await import('@github/copilot-sdk');
      mockSendAndWait.mockResolvedValue({ data: { content: makeValidAIJson() } });

      await service.analyzeWithAI(BASE_RESULT);
      await service.analyzeWithAI(BASE_RESULT);

      expect(CopilotClient).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('configures session idle timeout to auto-clean leaked CLI sessions', async () => {
      const { CopilotClient } = await import('@github/copilot-sdk');
      mockSendAndWait.mockResolvedValue({ data: { content: makeValidAIJson() } });

      await service.analyzeWithAI(BASE_RESULT);

      expect(CopilotClient).toHaveBeenCalledWith(
        expect.objectContaining({ sessionIdleTimeoutSeconds: 300 })
      );
    });

    describe('fallback risk scoring (SDK unavailable)', () => {
      beforeEach(() => {
        mockStart.mockRejectedValue(new Error('no CLI'));
        service = new CopilotService();
      });

      it('returns critical for critical-severity issues', async () => {
        const result = await service.analyzeWithAI({
          ...BASE_RESULT,
          issues: [{ ...SELF_MERGE_ISSUE, type: 'unreviewed-security-pr', severity: 'critical' }],
        });
        expect(result.risk_level).toBe('critical');
      });

      it('returns high when more than 3 high-severity issues', async () => {
        const high: SecurityIssue = { ...SELF_MERGE_ISSUE, severity: 'high' };
        const result = await service.analyzeWithAI({
          ...BASE_RESULT,
          issues: [high, high, high, high],
        });
        expect(result.risk_level).toBe('high');
      });

      it('returns medium when more than 10 total issues', async () => {
        const issues = Array(11).fill(SELF_MERGE_ISSUE) as SecurityIssue[];
        const result = await service.analyzeWithAI({ ...BASE_RESULT, issues });
        expect(result.risk_level).toBe('medium');
      });

      it('returns low for few low-severity issues', async () => {
        const result = await service.analyzeWithAI({
          ...BASE_RESULT,
          issues: [SELF_MERGE_ISSUE],
        });
        expect(result.risk_level).toBe('low');
      });
    });
  });

  // ── explainIssue ────────────────────────────────────────────────────────────

  describe('explainIssue', () => {
    it('returns AI explanation when SDK is available', async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: 'Alice merged her own PR.' } });

      const explanation = await service.explainIssue(SELF_MERGE_ISSUE);

      expect(explanation).toBe('Alice merged her own PR.');
    });

    it('returns fallback explanation when SDK is unavailable', async () => {
      mockStart.mockRejectedValue(new Error('no CLI'));
      service = new CopilotService();

      const explanation = await service.explainIssue(SELF_MERGE_ISSUE);

      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    });

    it('returns fallback when sendAndWait returns undefined', async () => {
      mockSendAndWait.mockResolvedValue(undefined);

      const explanation = await service.explainIssue(SELF_MERGE_ISSUE);

      expect(typeof explanation).toBe('string');
    });

    it('destroys session after explain call', async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: 'explanation' } });

      await service.explainIssue(SELF_MERGE_ISSUE);

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('provides a non-empty fallback for every issue type', async () => {
      mockStart.mockRejectedValue(new Error('no CLI'));
      service = new CopilotService();

      const types: SecurityIssue['type'][] = [
        'self-merge',
        'security-pr',
        'disabled-actions',
        'paused-workflow',
        'disabled-workflow',
        'unreviewed-security-pr',
      ];

      for (const type of types) {
        const issue: SecurityIssue = {
          ...SELF_MERGE_ISSUE,
          type,
          details: {
            author: 'alice',
            title: 'fix: patch',
            repo_name: 'org/repo',
            workflow_name: 'ci.yml',
            was_self_merged: false,
          },
        };
        const result = await service.explainIssue(issue);
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  // ── dispose ─────────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('stops the client after it has been initialised', async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: makeValidAIJson() } });
      await service.analyzeWithAI(BASE_RESULT);

      await service.dispose();

      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the client was never started', async () => {
      mockStart.mockRejectedValue(new Error('no CLI'));
      service = new CopilotService();
      await service.analyzeWithAI(BASE_RESULT);

      await service.dispose();

      expect(mockStop).not.toHaveBeenCalled();
    });

    it('allows re-initialisation after dispose', async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: makeValidAIJson() } });
      await service.analyzeWithAI(BASE_RESULT);
      await service.dispose();

      jest.clearAllMocks();
      mockStart.mockResolvedValue(undefined);
      mockCreateSession.mockResolvedValue(makeSession());
      mockSendAndWait.mockResolvedValue({
        data: { content: makeValidAIJson({ risk_level: 'medium' }) },
      });

      const result = await service.analyzeWithAI(BASE_RESULT);

      expect(result.risk_level).toBe('medium');
    });
  });
});
