/**
 * Evaluator Implementations
 *
 * Exports all evaluator implementations and ensures they are registered.
 *
 * @module evaluators
 */

export { BaseEvaluator } from './base-evaluator.js';
export { SecurityPRClassifier } from './security-pr-classifier.js';
export { SelfMergeEvaluator } from './self-merge-evaluator.js';

// Import to trigger decorator registration
import './security-pr-classifier.js';
import './self-merge-evaluator.js';
