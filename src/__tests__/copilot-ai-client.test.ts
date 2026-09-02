/**
 * Tests for CopilotAIClient
 *
 * All @github/copilot-sdk interactions are mocked so no real API calls are made.
 */

import { CopilotAIClient } from '../services/copilot-ai-client.js';

// ─── Mock @github/copilot-sdk ─────────────────────────────────────────────

const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockSendAndWait = jest.fn();
const mockCreateSession = jest.fn();
const mockStart = jest.fn().mockResolvedValue(undefined);
const mockStop = jest.fn().mockResolvedValue(undefined);

jest.mock('@github/copilot-sdk', () => {
  return {
    CopilotClient: jest.fn().mockImplementation(() => ({
      start: mockStart,
      stop: mockStop,
      createSession: mockCreateSession,
    })),
    approveAll: jest.fn(),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeResponse(content: string) {
  return { data: { content } };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('CopilotAIClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
    mockStop.mockResolvedValue(undefined);
    mockDestroy.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue({
      sendAndWait: mockSendAndWait,
      destroy: mockDestroy,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isAvailable()', () => {
    it('returns true when SDK starts successfully', async () => {
      const client = new CopilotAIClient();
      const available = await client.isAvailable();
      expect(available).toBe(true);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('returns false when SDK start throws', async () => {
      mockStart.mockRejectedValueOnce(new Error('auth failed'));
      const client = new CopilotAIClient();
      const available = await client.isAvailable();
      expect(available).toBe(false);
    });

    it('only initialises once when called multiple times', async () => {
      const client = new CopilotAIClient();
      await client.isAvailable();
      await client.isAvailable();
      expect(mockStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('complete()', () => {
    it('returns response content on success', async () => {
      mockSendAndWait.mockResolvedValue(makeResponse('hello world'));
      const client = new CopilotAIClient();
      const result = await client.complete('say hello');
      expect(result).toBe('hello world');
    });

    it('returns null when SDK is unavailable', async () => {
      mockStart.mockRejectedValueOnce(new Error('no token'));
      const client = new CopilotAIClient();
      const result = await client.complete('test');
      expect(result).toBeNull();
    });

    it('returns null when sendAndWait returns undefined', async () => {
      mockSendAndWait.mockResolvedValue(undefined);
      const client = new CopilotAIClient();
      const result = await client.complete('test');
      expect(result).toBeNull();
    });

    it('retries on failure and succeeds on second attempt', async () => {
      mockSendAndWait
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(makeResponse('retry worked'));

      const client = new CopilotAIClient({ maxAttempts: 3 });
      const completePromise = client.complete('test');
      // Advance past the backoff delay for attempt 1 (2000ms)
      await jest.advanceTimersByTimeAsync(2001);
      const result = await completePromise;
      expect(result).toBe('retry worked');
      expect(mockSendAndWait).toHaveBeenCalledTimes(2);
    });

    it('returns null after exhausting all attempts', async () => {
      mockSendAndWait.mockRejectedValue(new Error('persistent error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const client = new CopilotAIClient({ maxAttempts: 2 });
      const completePromise = client.complete('test');
      // Advance past the backoff delay for attempt 1 (2000ms)
      await jest.advanceTimersByTimeAsync(2001);
      const result = await completePromise;

      expect(result).toBeNull();
      expect(mockSendAndWait).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2 attempts failed'));

      consoleSpy.mockRestore();
    });

    it('retries when createSession() itself throws (not just sendAndWait)', async () => {
      // First attempt: createSession fails (auth / network / SDK error).
      // Second attempt: createSession succeeds and sendAndWait returns content.
      mockCreateSession
        .mockRejectedValueOnce(new Error('session create failed'))
        .mockResolvedValueOnce({ sendAndWait: mockSendAndWait, destroy: mockDestroy });
      mockSendAndWait.mockResolvedValueOnce(makeResponse('retry after create-fail'));

      const client = new CopilotAIClient({ maxAttempts: 3 });
      const completePromise = client.complete('test');
      await jest.advanceTimersByTimeAsync(2001);
      const result = await completePromise;

      expect(result).toBe('retry after create-fail');
      expect(mockCreateSession).toHaveBeenCalledTimes(2);
    });

    it('does not attempt to destroy a session that failed to create', async () => {
      mockCreateSession.mockRejectedValue(new Error('cannot create'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const client = new CopilotAIClient({ maxAttempts: 1 });
      await client.complete('test');

      expect(mockDestroy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('destroys session after successful call', async () => {
      mockSendAndWait.mockResolvedValue(makeResponse('ok'));
      const client = new CopilotAIClient();
      await client.complete('test');
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('destroys session even after failure', async () => {
      mockSendAndWait.mockRejectedValue(new Error('fail'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const client = new CopilotAIClient({ maxAttempts: 1 });
      await client.complete('test');
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });

    it('passes model option to createSession', async () => {
      mockSendAndWait.mockResolvedValue(makeResponse('ok'));
      const client = new CopilotAIClient({ model: 'claude-opus-4-7' });
      await client.complete('test');
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-4-7' })
      );
    });

    it('defaults to claude-sonnet-4-6 when no model specified', async () => {
      mockSendAndWait.mockResolvedValue(makeResponse('ok'));
      const client = new CopilotAIClient();
      await client.complete('test');
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' })
      );
    });
  });

  describe('dispose()', () => {
    it('stops the client on dispose', async () => {
      const client = new CopilotAIClient();
      await client.isAvailable();
      await client.dispose();
      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('is safe to call dispose before init', async () => {
      const client = new CopilotAIClient();
      await expect(client.dispose()).resolves.toBeUndefined();
      expect(mockStop).not.toHaveBeenCalled();
    });

    it('is safe to call dispose multiple times', async () => {
      const client = new CopilotAIClient();
      await client.isAvailable();
      await client.dispose();
      await client.dispose();
      expect(mockStop).toHaveBeenCalledTimes(1);
    });
  });
});
