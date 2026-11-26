/**
 * Unit tests for the policy loader (catalogue and profile YAML) and the
 * policy error types it raises.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import {
  EvaluatorError,
  PolicyError,
  PolicyLoadError,
  PolicyResolutionError,
  PolicyValidationError,
} from '../policy/errors.js';
import { loadCatalog, loadCatalogForProfile, loadProfile } from '../policy/loader.js';

const CATALOG_PATH = 'policies/catalog.yaml';

/** Captures a rejected promise's error for detailed assertions. */
async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the promise to reject');
}

describe('policy loader', () => {
  let dir: string;

  const write = (name: string, content: string): string => {
    const file = join(dir, name);
    writeFileSync(file, content, 'utf-8');
    return file;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'hubhelper-policy-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('shipped policies', () => {
    it('loads and validates the control catalogue', async () => {
      const catalog = await loadCatalog(CATALOG_PATH);
      expect(catalog.metadata.version).toBeTruthy();
      expect(catalog.controls.length).toBeGreaterThan(0);
      expect(catalog.controls.every((c) => /^HH-GH-\d{3}$/.test(c.id))).toBe(true);
    });

    it.each(['policies/default.yaml', 'policies/strict.yaml'])(
      'loads %s and its referenced catalogue',
      async (profilePath) => {
        const profile = await loadProfile(profilePath);
        const catalog = await loadCatalogForProfile(profile, profilePath);
        expect(catalog.metadata.version).toBe(profile['catalog-ref'].version);
      }
    );
  });

  describe('loadCatalog', () => {
    it('reports a missing file', async () => {
      const error = await rejectionOf(loadCatalog(join(dir, 'missing.yaml')));
      expect(error).toBeInstanceOf(PolicyLoadError);
      expect(error.message).toMatch(/^Catalog file not found: /);
      expect((error as PolicyLoadError).code).toBe('POLICY_LOAD_ERROR');
    });

    it('reports malformed YAML with the parser error as cause', async () => {
      const file = write('bad.yaml', 'controls: [unclosed');
      const error = (await rejectionOf(loadCatalog(file))) as PolicyLoadError;
      expect(error).toBeInstanceOf(PolicyLoadError);
      expect(error.message).toMatch(/^Failed to parse YAML: /);
      expect(error.filePath).toBe(resolve(file));
      expect(error.cause).toBeInstanceOf(Error);
    });

    it('reports schema violations as a PolicyValidationError', async () => {
      const file = write('invalid-catalog.yaml', 'metadata:\n  title: 42\ncontrols: nope\n');
      const error = (await rejectionOf(loadCatalog(file))) as PolicyValidationError;
      expect(error).toBeInstanceOf(PolicyValidationError);
      expect(error.message).toBe('Catalog validation failed');
      expect(error.code).toBe('POLICY_VALIDATION_ERROR');
      expect(error.formatErrors()).toMatch(/Validation errors:\n {2}- /);
    });

    it('wraps other read failures', async () => {
      // Reading a directory fails with EISDIR rather than ENOENT.
      const error = await rejectionOf(loadCatalog(dir));
      expect(error).toBeInstanceOf(PolicyLoadError);
      expect(error.message).toMatch(/^Failed to load catalog: /);
    });
  });

  describe('loadProfile', () => {
    it('reports a missing file', async () => {
      const error = await rejectionOf(loadProfile(join(dir, 'missing.yaml')));
      expect(error).toBeInstanceOf(PolicyLoadError);
      expect(error.message).toMatch(/^Profile file not found: /);
    });

    it('reports malformed YAML', async () => {
      const file = write('bad-profile.yaml', 'metadata: {');
      const error = await rejectionOf(loadProfile(file));
      expect(error).toBeInstanceOf(PolicyLoadError);
      expect(error.message).toMatch(/^Failed to parse YAML: /);
    });

    it('reports schema violations', async () => {
      const file = write('invalid-profile.yaml', 'metadata:\n  title: Only a title\n');
      const error = await rejectionOf(loadProfile(file));
      expect(error).toBeInstanceOf(PolicyValidationError);
      expect(error.message).toBe('Profile validation failed');
    });

    it('wraps other read failures', async () => {
      const error = await rejectionOf(loadProfile(dir));
      expect(error).toBeInstanceOf(PolicyLoadError);
      expect(error.message).toMatch(/^Failed to load profile: /);
    });
  });

  describe('loadCatalogForProfile', () => {
    it('rejects a catalogue whose version differs from the profile reference', async () => {
      const profile = await loadProfile('policies/default.yaml');
      const mismatched = {
        ...profile,
        'catalog-ref': {
          href: resolve(CATALOG_PATH),
          version: '0.0.0-does-not-exist',
        },
      };

      const error = await rejectionOf(loadCatalogForProfile(mismatched, join(dir, 'p.yaml')));
      expect(error).toBeInstanceOf(PolicyLoadError);
      expect(error.message).toMatch(
        /^Catalog version mismatch: profile expects 0\.0\.0-does-not-exist, catalog is /
      );
    });

    it('resolves the catalogue path relative to the profile file', async () => {
      const profile = await loadProfile('policies/default.yaml');
      const relocated = {
        ...profile,
        'catalog-ref': { ...profile['catalog-ref'], href: './nope.yaml' },
      };

      const error = await rejectionOf(loadCatalogForProfile(relocated, join(dir, 'p.yaml')));
      expect(error.message).toBe(`Catalog file not found: ${join(dir, 'nope.yaml')}`);
    });
  });
});

describe('policy errors', () => {
  it('give each error type a name, code and prototype chain', () => {
    const cases: Array<[PolicyError, string, string]> = [
      [new PolicyError('m', 'CUSTOM'), 'PolicyError', 'CUSTOM'],
      [new PolicyLoadError('m', 'f.yaml'), 'PolicyLoadError', 'POLICY_LOAD_ERROR'],
      [
        new PolicyValidationError('m', 'f.yaml'),
        'PolicyValidationError',
        'POLICY_VALIDATION_ERROR',
      ],
      [
        new PolicyResolutionError('m', 'HH-GH-001'),
        'PolicyResolutionError',
        'POLICY_RESOLUTION_ERROR',
      ],
      [new EvaluatorError('m', 'HH-GH-001', 'meta'), 'EvaluatorError', 'EVALUATOR_ERROR'],
    ];

    for (const [error, name, code] of cases) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PolicyError);
      expect(error.name).toBe(name);
      expect(error.code).toBe(code);
      expect(error.message).toBe('m');
    }
  });

  it('keep their context fields', () => {
    const cause = new Error('root');
    expect(new PolicyLoadError('m', 'f.yaml', cause)).toMatchObject({
      filePath: 'f.yaml',
      cause,
    });
    expect(new PolicyResolutionError('m', 'HH-GH-002').controlId).toBe('HH-GH-002');
    expect(new EvaluatorError('m', 'HH-GH-003', 'classifier')).toMatchObject({
      controlId: 'HH-GH-003',
      evaluatorKind: 'classifier',
    });
  });

  describe('PolicyValidationError.formatErrors', () => {
    it('returns the message alone without a Zod error', () => {
      expect(new PolicyValidationError('Profile validation failed', 'p.yaml').formatErrors()).toBe(
        'Profile validation failed'
      );
    });

    it('lists each Zod issue with its path', () => {
      const parsed = z
        .object({ metadata: z.object({ version: z.string() }), controls: z.array(z.string()) })
        .safeParse({ metadata: { version: 1 }, controls: 'x' });
      if (parsed.success) throw new Error('expected validation to fail');

      const formatted = new PolicyValidationError('Invalid', 'p.yaml', parsed.error).formatErrors();

      expect(formatted.startsWith('Invalid\n\nValidation errors:\n')).toBe(true);
      expect(formatted).toContain('  - metadata.version: ');
      expect(formatted).toContain('  - controls: ');
    });
  });
});
