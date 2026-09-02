/**
 * ExplanationCache
 *
 * Filesystem cache for AI-generated issue explanations.
 * Keyed by a SHA-256 fingerprint of the issue's type + repository + description.
 * Entries expire after 24 hours to ensure freshness.
 *
 * Cache location: ~/.hubhelper/cache/explanations/
 *
 * @module services/explanation-cache
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SecurityIssue } from '../types/index.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  explanation: string;
  cachedAt: number;
}

export class ExplanationCache {
  private readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? join(homedir(), '.hubhelper', 'cache', 'explanations');
  }

  /** Derive a stable cache key from the issue fields that determine its identity. */
  fingerprint(issue: SecurityIssue): string {
    const raw = `${issue.type}::${issue.repository}::${issue.description}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  async get(issue: SecurityIssue): Promise<string | null> {
    const key = this.fingerprint(issue);
    const filePath = join(this.cacheDir, `${key}.json`);
    try {
      const content = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(content) as unknown;
      const entry = validateCacheEntry(parsed);
      // Malformed/tampered file → miss, not a hit with NaN TTL that never expires.
      if (entry === null) {
        return null;
      }
      if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
        return null;
      }
      return entry.explanation;
    } catch {
      return null;
    }
  }

  async set(issue: SecurityIssue, explanation: string): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const key = this.fingerprint(issue);
    const filePath = join(this.cacheDir, `${key}.json`);
    const entry: CacheEntry = { explanation, cachedAt: Date.now() };
    await writeFile(filePath, JSON.stringify(entry), 'utf8');
  }
}

function validateCacheEntry(value: unknown): CacheEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.explanation !== 'string') return null;
  if (typeof obj.cachedAt !== 'number' || !Number.isFinite(obj.cachedAt)) return null;
  return { explanation: obj.explanation, cachedAt: obj.cachedAt };
}
