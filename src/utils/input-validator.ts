/**
 * Input validation utilities for CLI parameters
 */

// GitHub username/org rules: 1-39 chars, alphanumeric + hyphens, can't start/end with hyphen
const GITHUB_ORG_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string | number;
}

/**
 * Validates a GitHub organization name
 */
export function validateOrganizationName(org: unknown): ValidationResult {
  if (!org) {
    return {
      valid: false,
      error: 'Organization name is required',
    };
  }

  if (typeof org !== 'string') {
    return {
      valid: false,
      error: 'Organization name must be a string',
    };
  }

  const trimmed = org.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Organization name cannot be empty',
    };
  }

  if (trimmed.length > 39) {
    return {
      valid: false,
      error: 'Organization name too long (max 39 characters)',
    };
  }

  if (!GITHUB_ORG_REGEX.test(trimmed)) {
    return {
      valid: false,
      error:
        'Invalid organization name format. Must be alphanumeric with hyphens, and cannot start or end with a hyphen.',
    };
  }

  return {
    valid: true,
    sanitized: trimmed,
  };
}

/**
 * Validates the days parameter
 */
export function validateDays(daysInput: unknown): ValidationResult {
  if (daysInput === undefined || daysInput === null) {
    return {
      valid: false,
      error: 'Days parameter is required',
    };
  }

  // Reject non-primitive types
  if (typeof daysInput === 'object') {
    return {
      valid: false,
      error: 'Days must be a valid number',
    };
  }

  // For strings, validate format before parsing
  if (typeof daysInput === 'string') {
    const trimmed = daysInput.trim();
    // Only accept strings that are pure integers (no decimals, no trailing chars)
    if (!/^\d+$/.test(trimmed)) {
      return {
        valid: false,
        error: 'Days must be a valid number',
      };
    }
  }

  const days = typeof daysInput === 'string' ? Number.parseInt(daysInput, 10) : Number(daysInput);

  if (Number.isNaN(days)) {
    return {
      valid: false,
      error: 'Days must be a valid number',
    };
  }

  if (!Number.isInteger(days)) {
    return {
      valid: false,
      error: 'Days must be an integer',
    };
  }

  if (days < 1) {
    return {
      valid: false,
      error: 'Days must be at least 1',
    };
  }

  if (days > 365) {
    return {
      valid: false,
      error: 'Days cannot exceed 365 (to prevent API abuse)',
    };
  }

  return {
    valid: true,
    sanitized: days,
  };
}

/**
 * Validates a GitHub token format (basic check)
 */
export function validateGitHubToken(token: unknown): ValidationResult {
  if (!token) {
    return {
      valid: false,
      error: 'GitHub token is required',
    };
  }

  if (typeof token !== 'string') {
    return {
      valid: false,
      error: 'GitHub token must be a string',
    };
  }

  const trimmed = token.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'GitHub token cannot be empty',
    };
  }

  // GitHub tokens are typically at least 40 characters
  if (trimmed.length < 40) {
    return {
      valid: false,
      error: 'GitHub token appears to be invalid (too short)',
    };
  }

  // Check for obvious invalid characters (spaces, newlines, etc.)
  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      error: 'GitHub token contains invalid whitespace characters',
    };
  }

  return {
    valid: true,
    sanitized: trimmed,
  };
}
