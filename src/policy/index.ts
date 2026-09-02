/**
 * Policy System
 *
 * YAML-based declarative policy system for security analysis.
 *
 * Main exports:
 * - PolicyEngine - Main orchestrator for policy-driven evaluation
 * - loadCatalog, loadProfile, loadCatalogForProfile - Load and validate YAML files
 * - resolvePolicy - Merge catalog + profile into resolved policy
 * - evaluatorRegistry, registerEvaluator - Evaluator registration
 * - All type definitions and schemas
 * - Custom error classes
 *
 * @module policy
 */

export type { PolicyEngineResult } from './engine.js';
// Policy engine
export { PolicyEngine } from './engine.js';
// Errors
export {
  EvaluatorError,
  ParameterValidationError,
  PolicyError,
  PolicyLoadError,
  PolicyResolutionError,
  PolicyValidationError,
} from './errors.js';
// Evaluator registry
export { evaluatorRegistry, registerEvaluator } from './evaluator-registry.js';

// Loaders
export { loadCatalog, loadCatalogForProfile, loadProfile } from './loader.js';

// Policy resolution
export { resolvePolicy } from './resolver.js';
// Type definitions and schemas
export type {
  Catalog,
  Control,
  ControlTailoring,
  DetectorType,
  EvaluationContext,
  EvaluationResult,
  Evaluator,
  EvaluatorConfig,
  EvaluatorKind,
  FrameworkMapping,
  Parameter,
  ParameterType,
  ParameterValue,
  Profile,
  ReportFormat,
  ReportingConfig,
  ResolvedControl,
  ResolvedParameter,
  ResolvedPolicy,
  ScopeConfig,
  Severity,
} from './types.js';
export {
  CatalogSchema,
  DetectorTypeSchema,
  EvaluatorKindSchema,
  ParameterTypeSchema,
  ProfileSchema,
  ReportFormatSchema,
  SeveritySchema,
} from './types.js';
