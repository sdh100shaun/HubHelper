/**
 * Evaluator Registry
 *
 * Central registry for mapping detector types to evaluator implementations.
 * Allows evaluators to be registered and looked up by control ID or detector type.
 *
 * @module policy/evaluator-registry
 */

import { EvaluatorError } from './errors.js';
import type { DetectorType, Evaluator } from './types.js';

/**
 * Global evaluator registry
 */
class EvaluatorRegistry {
  private evaluators = new Map<string, new () => Evaluator>();
  private instances = new Map<string, Evaluator>();

  /**
   * Register an evaluator class for a detector type
   */
  register(detectorType: DetectorType, evaluatorClass: new () => Evaluator): void {
    this.evaluators.set(detectorType, evaluatorClass);
  }

  /**
   * Get evaluator instance for a detector type
   *
   * Evaluators are singletons - same instance returned for same detector type.
   */
  get(detectorType: DetectorType, controlId: string): Evaluator {
    // Check if already instantiated
    if (this.instances.has(detectorType)) {
      return this.instances.get(detectorType)!;
    }

    // Get class and instantiate
    const EvaluatorClass = this.evaluators.get(detectorType);
    if (!EvaluatorClass) {
      throw new EvaluatorError(
        `No evaluator registered for detector type: ${detectorType}`,
        controlId,
        detectorType
      );
    }

    const instance = new EvaluatorClass();
    this.instances.set(detectorType, instance);
    return instance;
  }

  /**
   * Check if evaluator is registered for detector type
   */
  has(detectorType: DetectorType): boolean {
    return this.evaluators.has(detectorType);
  }

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.evaluators.clear();
    this.instances.clear();
  }

  /**
   * Get all registered detector types
   */
  getRegisteredTypes(): DetectorType[] {
    return Array.from(this.evaluators.keys()) as DetectorType[];
  }
}

/**
 * Global singleton instance
 */
export const evaluatorRegistry = new EvaluatorRegistry();

/**
 * Register an evaluator (decorator or direct call)
 */
export function registerEvaluator(detectorType: DetectorType) {
  return (target: new () => Evaluator): void => {
    evaluatorRegistry.register(detectorType, target);
  };
}
