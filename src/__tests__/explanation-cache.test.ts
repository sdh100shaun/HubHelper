/**
 * Tests for ExplanationCache
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExplanationCache } from '../services/explanation-cache.js';
import type { SecurityIssue } from '../types/index.js';

jest.mock('node:fs/promises');

const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

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

describe('ExplanationCache', () => {
  const cacheDir = join(tmpdir(), 'hubhelper-test-cache');
  let cache: ExplanationCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new ExplanationCache(cacheDir);
  });

  describe('fingerprint()', () => {
    it('produces a 64-char hex string', () => {
      const issue = makeIssue();
      const fp = cache.fingerprint(issue);
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is stable for identical issues', () => {
      const issue = makeIssue();
      expect(cache.fingerprint(issue)).toBe(cache.fingerprint(issue));
    });

    it('differs when type changes', () => {
      const a = cache.fingerprint(makeIssue({ type: 'disabled-actions' }));
      const b = cache.fingerprint(makeIssue({ type: 'self-merge' }));
      expect(a).not.toBe(b);
    });

    it('differs when repository changes', () => {
      const a = cache.fingerprint(makeIssue({ repository: 'org/repo-a' }));
      const b = cache.fingerprint(makeIssue({ repository: 'org/repo-b' }));
      expect(a).not.toBe(b);
    });

    it('differs when description changes', () => {
      const a = cache.fingerprint(makeIssue({ description: 'desc A' }));
      const b = cache.fingerprint(makeIssue({ description: 'desc B' }));
      expect(a).not.toBe(b);
    });
  });

  describe('get()', () => {
    it('returns cached explanation when entry is fresh', async () => {
      const entry = JSON.stringify({ explanation: 'cached text', cachedAt: Date.now() });
      // biome-ignore lint/suspicious/noExplicitAny: mock return
      mockReadFile.mockResolvedValueOnce(entry as any);

      const result = await cache.get(makeIssue());
      expect(result).toBe('cached text');
    });

    it('returns null when entry is older than 24 hours', async () => {
      const expired = Date.now() - 25 * 60 * 60 * 1000;
      const entry = JSON.stringify({ explanation: 'stale text', cachedAt: expired });
      // biome-ignore lint/suspicious/noExplicitAny: mock return
      mockReadFile.mockResolvedValueOnce(entry as any);

      const result = await cache.get(makeIssue());
      expect(result).toBeNull();
    });

    it('returns null when file does not exist', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await cache.get(makeIssue());
      expect(result).toBeNull();
    });

    it('returns null when file contains invalid JSON', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock return
      mockReadFile.mockResolvedValueOnce('not-json' as any);
      const result = await cache.get(makeIssue());
      expect(result).toBeNull();
    });
  });

  describe('set()', () => {
    it('creates the cache directory and writes the file', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock return
      mockMkdir.mockResolvedValueOnce(undefined as any);
      mockWriteFile.mockResolvedValueOnce(undefined);

      await cache.set(makeIssue(), 'new explanation');

      expect(mockMkdir).toHaveBeenCalledWith(cacheDir, { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.stringContaining('new explanation'),
        'utf8'
      );
    });

    it('writes a valid JSON entry with cachedAt', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock return
      mockMkdir.mockResolvedValueOnce(undefined as any);
      let writtenContent = '';
      mockWriteFile.mockImplementationOnce(((_path, content) => {
        writtenContent = content as string;
        return Promise.resolve();
      }) as typeof writeFile);

      const before = Date.now();
      await cache.set(makeIssue(), 'explanation text');
      const after = Date.now();

      const parsed = JSON.parse(writtenContent) as { explanation: string; cachedAt: number };
      expect(parsed.explanation).toBe('explanation text');
      expect(parsed.cachedAt).toBeGreaterThanOrEqual(before);
      expect(parsed.cachedAt).toBeLessThanOrEqual(after);
    });
  });
});
