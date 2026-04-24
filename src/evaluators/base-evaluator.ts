/**
 * Base Evaluator Class
 *
 * Abstract base class for all evaluators providing common functionality.
 *
 * @module evaluators/base-evaluator
 */

import { ParameterValidationError } from '../policy/errors.js';
import type {
  EvaluationContext,
  EvaluationResult,
  Evaluator,
  EvaluatorKind,
  Severity,
} from '../policy/types.js';

/**
 * Abstract base evaluator with parameter validation helpers
 */
export abstract class BaseEvaluator implements Evaluator {
  abstract readonly controlId: string;
  abstract readonly kind: EvaluatorKind;

  /**
   * Execute evaluation - must be implemented by subclasses
   */
  abstract evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult>;

  /**
   * Validate parameters - override for custom validation
   */
  validateParameters(parameters: Record<string, unknown>): void {
    // Base implementation - subclasses can override
  }

  /**
   * Get required string parameter
   */
  protected getStringParam(
    parameters: Record<string, unknown>,
    key: string,
    required = true
  ): string | undefined {
    const value = parameters[key];

    if (value === undefined) {
      if (required) {
        throw new ParameterValidationError(
          `Required parameter '${key}' is missing`,
          this.controlId,
          key
        );
      }
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new ParameterValidationError(
        `Parameter '${key}' must be a string, got ${typeof value}`,
        this.controlId,
        key
      );
    }

    return value;
  }

  /**
   * Get required number parameter
   */
  protected getNumberParam(
    parameters: Record<string, unknown>,
    key: string,
    required = true
  ): number | undefined {
    const value = parameters[key];

    if (value === undefined) {
      if (required) {
        throw new ParameterValidationError(
          `Required parameter '${key}' is missing`,
          this.controlId,
          key
        );
      }
      return undefined;
    }

    if (typeof value !== 'number') {
      throw new ParameterValidationError(
        `Parameter '${key}' must be a number, got ${typeof value}`,
        this.controlId,
        key
      );
    }

    return value;
  }

  /**
   * Get required string array parameter
   */
  protected getStringArrayParam(
    parameters: Record<string, unknown>,
    key: string,
    required = true
  ): string[] | undefined {
    const value = parameters[key];

    if (value === undefined) {
      if (required) {
        throw new ParameterValidationError(
          `Required parameter '${key}' is missing`,
          this.controlId,
          key
        );
      }
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new ParameterValidationError(
        `Parameter '${key}' must be an array, got ${typeof value}`,
        this.controlId,
        key
      );
    }

    if (!value.every((item) => typeof item === 'string')) {
      throw new ParameterValidationError(
        `Parameter '${key}' must be an array of strings`,
        this.controlId,
        key
      );
    }

    return value;
  }

  /**
   * Get severity parameter
   */
  protected getSeverityParam(
    parameters: Record<string, unknown>,
    key: string,
    required = true
  ): Severity | undefined {
    const value = this.getStringParam(parameters, key, required);

    if (value === undefined) {
      return undefined;
    }

    const validSeverities: Severity[] = ['low', 'medium', 'high', 'critical'];
    if (!validSeverities.includes(value as Severity)) {
      throw new ParameterValidationError(
        `Parameter '${key}' must be a valid severity (${validSeverities.join(', ')}), got '${value}'`,
        this.controlId,
        key
      );
    }

    return value as Severity;
  }
}
