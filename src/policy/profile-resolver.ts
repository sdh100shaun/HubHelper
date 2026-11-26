/**
 * Profile Resolver
 *
 * Turns the value of `--profile` into a policy profile file path.
 *
 * The built-in profile names (`default`, `strict`) resolve to the copies in the
 * working directory's `policies/` folder when present (so existing checkouts keep
 * their behaviour), otherwise to the copies bundled with the npm package. This lets
 * `npx @sdh100shaun/hubhelper analyze` work from any directory, such as a CI runner.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateFilePath } from '../utils/path-validator.js';

export const BUILT_IN_PROFILES = ['default', 'strict'] as const;
export type BuiltInProfile = (typeof BUILT_IN_PROFILES)[number];

export interface ProfileResolverOptions {
  /** Directory that relative profile paths and `./policies/` are resolved against. */
  cwd?: string;
  /**
   * Directory holding the profiles bundled with the package. The CLI entry point
   * works this out from its own location (`import.meta.url`).
   */
  bundledDir: string;
}

export function isBuiltInProfile(value: string): value is BuiltInProfile {
  return (BUILT_IN_PROFILES as readonly string[]).includes(value);
}

/**
 * Resolve a `--profile` value to a profile file path.
 *
 * @param input - Built-in profile name, a YAML path inside `cwd`, or undefined for `default`
 * @throws Error if a custom path is unsafe, has the wrong extension, or does not exist
 */
export function resolveProfilePath(
  input: string | undefined,
  options: ProfileResolverOptions
): string {
  const cwd = options.cwd ?? process.cwd();
  const name = input?.trim() || 'default';

  if (isBuiltInProfile(name)) {
    const workspaceCopy = join(cwd, 'policies', `${name}.yaml`);
    if (existsSync(workspaceCopy)) {
      return workspaceCopy;
    }

    const bundledCopy = join(options.bundledDir, `${name}.yaml`);
    if (!existsSync(bundledCopy)) {
      throw new Error(`Built-in policy profile "${name}" is missing from this installation`);
    }
    return bundledCopy;
  }

  // Custom profiles must stay inside the working directory (path traversal prevention).
  const safePath = validateFilePath(name, {
    allowedDir: cwd,
    allowedExtensions: ['.yaml', '.yml'],
    createDirIfMissing: false,
  });

  if (!existsSync(safePath)) {
    throw new Error(
      `Policy profile not found: ${name}. Use a built-in profile (${BUILT_IN_PROFILES.join(', ')}) or a YAML file path.`
    );
  }

  return safePath;
}
