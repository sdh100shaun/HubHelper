import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUILT_IN_PROFILES,
  isBuiltInProfile,
  resolveProfilePath,
} from '../policy/profile-resolver';

describe('profile-resolver', () => {
  let cwd: string;
  let bundledDir: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'hh-profile-cwd-'));
    bundledDir = mkdtempSync(join(tmpdir(), 'hh-profile-bundled-'));
    writeFileSync(join(bundledDir, 'default.yaml'), 'bundled-default');
    writeFileSync(join(bundledDir, 'strict.yaml'), 'bundled-strict');
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(bundledDir, { recursive: true, force: true });
  });

  describe('repository policies folder', () => {
    it('contains every built-in profile and the catalog, so the package can bundle them', () => {
      const dir = join(process.cwd(), 'policies');
      for (const name of BUILT_IN_PROFILES) {
        expect(existsSync(join(dir, `${name}.yaml`))).toBe(true);
      }
      expect(existsSync(join(dir, 'catalog.yaml'))).toBe(true);
    });
  });

  describe('isBuiltInProfile', () => {
    it('recognises built-in names only', () => {
      expect(isBuiltInProfile('default')).toBe(true);
      expect(isBuiltInProfile('strict')).toBe(true);
      expect(isBuiltInProfile('policies/default.yaml')).toBe(false);
    });
  });

  describe('resolveProfilePath', () => {
    it('falls back to the bundled default when no profile is given', () => {
      expect(resolveProfilePath(undefined, { cwd, bundledDir })).toBe(
        join(bundledDir, 'default.yaml')
      );
    });

    it('treats a blank value as default', () => {
      expect(resolveProfilePath('  ', { cwd, bundledDir })).toBe(join(bundledDir, 'default.yaml'));
    });

    it('resolves the strict profile to the bundled copy', () => {
      expect(resolveProfilePath('strict', { cwd, bundledDir })).toBe(
        join(bundledDir, 'strict.yaml')
      );
    });

    it('prefers a workspace policies/ copy of a built-in profile', () => {
      mkdirSync(join(cwd, 'policies'));
      writeFileSync(join(cwd, 'policies', 'default.yaml'), 'workspace-default');

      expect(resolveProfilePath('default', { cwd, bundledDir })).toBe(
        join(cwd, 'policies', 'default.yaml')
      );
    });

    it('throws when a built-in profile is missing from the installation', () => {
      rmSync(join(bundledDir, 'strict.yaml'));

      expect(() => resolveProfilePath('strict', { cwd, bundledDir })).toThrow(
        'Built-in policy profile "strict" is missing'
      );
    });

    it('resolves a custom YAML path inside the working directory', () => {
      mkdirSync(join(cwd, '.github'));
      writeFileSync(join(cwd, '.github', 'policy.yml'), 'custom');

      expect(resolveProfilePath('.github/policy.yml', { cwd, bundledDir })).toBe(
        join(cwd, '.github', 'policy.yml')
      );
    });

    it('throws when a custom profile does not exist', () => {
      expect(() => resolveProfilePath('missing.yaml', { cwd, bundledDir })).toThrow(
        'Policy profile not found: missing.yaml'
      );
    });

    it('rejects paths outside the working directory', () => {
      expect(() => resolveProfilePath('../outside.yaml', { cwd, bundledDir })).toThrow(
        'path traversal'
      );
    });

    it('rejects files without a YAML extension', () => {
      writeFileSync(join(cwd, 'policy.json'), '{}');

      expect(() => resolveProfilePath('policy.json', { cwd, bundledDir })).toThrow(
        'Invalid file extension'
      );
    });

    it('resolves relative paths against process.cwd() when no cwd is given', () => {
      const resolved = resolveProfilePath('policies/strict.yaml', { bundledDir });
      expect(resolved).toBe(join(process.cwd(), 'policies', 'strict.yaml'));
    });
  });
});
