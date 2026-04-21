/**
 * Policy File Loader
 *
 * Loads and validates catalog.yaml and profile.yaml files.
 * Uses Zod for runtime validation against schemas.
 *
 * @module policy/loader
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { PolicyLoadError, PolicyValidationError } from './errors.js';
import { type Catalog, CatalogSchema, type Profile, ProfileSchema } from './types.js';

/**
 * Load and validate a catalog file
 */
export async function loadCatalog(filePath: string): Promise<Catalog> {
  try {
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Parse YAML
    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch (error) {
      throw new PolicyLoadError(
        `Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
        absolutePath,
        error instanceof Error ? error : undefined
      );
    }

    // Validate against schema
    const result = CatalogSchema.safeParse(parsed);
    if (!result.success) {
      throw new PolicyValidationError('Catalog validation failed', absolutePath, result.error);
    }

    return result.data;
  } catch (error) {
    if (error instanceof PolicyLoadError || error instanceof PolicyValidationError) {
      throw error;
    }

    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new PolicyLoadError(`Catalog file not found: ${filePath}`, filePath);
    }

    throw new PolicyLoadError(
      `Failed to load catalog: ${error instanceof Error ? error.message : 'Unknown error'}`,
      filePath,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Load and validate a profile file
 */
export async function loadProfile(filePath: string): Promise<Profile> {
  try {
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Parse YAML
    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch (error) {
      throw new PolicyLoadError(
        `Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
        absolutePath,
        error instanceof Error ? error : undefined
      );
    }

    // Validate against schema
    const result = ProfileSchema.safeParse(parsed);
    if (!result.success) {
      throw new PolicyValidationError('Profile validation failed', absolutePath, result.error);
    }

    return result.data;
  } catch (error) {
    if (error instanceof PolicyLoadError || error instanceof PolicyValidationError) {
      throw error;
    }

    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new PolicyLoadError(`Profile file not found: ${filePath}`, filePath);
    }

    throw new PolicyLoadError(
      `Failed to load profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
      filePath,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Load catalog referenced by a profile
 *
 * Resolves the catalog href relative to the profile's directory.
 */
export async function loadCatalogForProfile(
  profile: Profile,
  profilePath: string
): Promise<Catalog> {
  const profileDir = path.dirname(path.resolve(profilePath));
  const catalogPath = path.resolve(profileDir, profile['catalog-ref'].href);

  const catalog = await loadCatalog(catalogPath);

  // Verify version matches
  if (catalog.metadata.version !== profile['catalog-ref'].version) {
    throw new PolicyLoadError(
      `Catalog version mismatch: profile expects ${profile['catalog-ref'].version}, catalog is ${catalog.metadata.version}`,
      catalogPath
    );
  }

  return catalog;
}
