import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';

/**
 * Validates and sanitizes file paths to prevent path traversal attacks
 */

const ALLOWED_EXTENSIONS = ['.json', '.html', '.txt', '.md'];
const MAX_PATH_LENGTH = 255;

export interface PathValidationOptions {
  allowedDir?: string;
  allowedExtensions?: string[];
  createDirIfMissing?: boolean;
}

/**
 * Validates a file path for security
 * @throws Error if path is invalid or unsafe
 */
export function validateFilePath(filePath: string, options: PathValidationOptions = {}): string {
  const {
    allowedDir = process.cwd(),
    allowedExtensions = ALLOWED_EXTENSIONS,
    createDirIfMissing = true,
  } = options;

  // Check for null/undefined
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  // Check length
  if (filePath.length > MAX_PATH_LENGTH) {
    throw new Error(`File path too long (max ${MAX_PATH_LENGTH} characters)`);
  }

  // Check for null bytes (directory traversal technique) - do this early
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: null byte detected');
  }

  // Normalize and resolve path
  const normalizedPath = normalize(resolve(allowedDir, filePath));
  const normalizedAllowedDir = normalize(resolve(allowedDir));

  // Check for path traversal
  const relativePath = relative(normalizedAllowedDir, normalizedPath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(
      'Invalid file path: path traversal detected. File must be in current directory or subdirectory.'
    );
  }

  // Check file extension
  const ext = normalizedPath.substring(normalizedPath.lastIndexOf('.')).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Invalid file extension "${ext}". Allowed: ${allowedExtensions.join(', ')}`);
  }

  // Create parent directory if needed
  if (createDirIfMissing) {
    const parentDir = dirname(normalizedPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
  }

  return normalizedPath;
}

/**
 * Checks if a path is safe without throwing
 */
export function isPathSafe(filePath: string, options?: PathValidationOptions): boolean {
  try {
    validateFilePath(filePath, options);
    return true;
  } catch {
    return false;
  }
}
