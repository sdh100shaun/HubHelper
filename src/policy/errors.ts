/**
 * Policy System Error Classes
 *
 * Custom error types for policy loading, validation, and resolution.
 *
 * @module policy/errors
 */

import type { ZodError } from 'zod';

/**
 * Base class for all policy-related errors
 */
export class PolicyError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PolicyError';
    Object.setPrototypeOf(this, PolicyError.prototype);
  }
}

/**
 * Error loading or parsing YAML files
 */
export class PolicyLoadError extends PolicyError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: Error
  ) {
    super(message, 'POLICY_LOAD_ERROR');
    this.name = 'PolicyLoadError';
    Object.setPrototypeOf(this, PolicyLoadError.prototype);
  }
}

/**
 * Error validating policy against schema
 */
export class PolicyValidationError extends PolicyError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly zodError?: ZodError<unknown>
  ) {
    super(message, 'POLICY_VALIDATION_ERROR');
    this.name = 'PolicyValidationError';
    Object.setPrototypeOf(this, PolicyValidationError.prototype);
  }

  /**
   * Format Zod validation errors for display
   */
  formatErrors(): string {
    if (!this.zodError) return this.message;

    const errors = this.zodError.issues
      .map((err) => {
        const path = err.path.join('.');
        return `  - ${path}: ${err.message}`;
      })
      .join('\n');

    return `${this.message}\n\nValidation errors:\n${errors}`;
  }
}

/**
 * Error resolving policy (e.g., missing control, invalid parameter)
 */
export class PolicyResolutionError extends PolicyError {
  constructor(
    message: string,
    public readonly controlId?: string
  ) {
    super(message, 'POLICY_RESOLUTION_ERROR');
    this.name = 'PolicyResolutionError';
    Object.setPrototypeOf(this, PolicyResolutionError.prototype);
  }
}

/**
 * Error finding or instantiating evaluator
 */
export class EvaluatorError extends PolicyError {
  constructor(
    message: string,
    public readonly controlId: string,
    public readonly evaluatorKind?: string
  ) {
    super(message, 'EVALUATOR_ERROR');
    this.name = 'EvaluatorError';
    Object.setPrototypeOf(this, EvaluatorError.prototype);
  }
}

/**
 * Error during parameter validation
 */
export class ParameterValidationError extends PolicyError {
  constructor(
    message: string,
    public readonly controlId: string,
    public readonly parameterId: string
  ) {
    super(message, 'PARAMETER_VALIDATION_ERROR');
    this.name = 'ParameterValidationError';
    Object.setPrototypeOf(this, ParameterValidationError.prototype);
  }
}
