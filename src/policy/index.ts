/**
 * Policy System
 *
 * YAML-based declarative policy system for security analysis.
 *
 * Main exports:
 * - loadCatalog, loadProfile, loadCatalogForProfile - Load and validate YAML files
 * - resolvePolicy - Merge catalog + profile into resolved policy
 * - evaluatorRegistry, registerEvaluator - Evaluator registration
 * - All type definitions and schemas
 * - Custom error classes
 *
 * @module policy
 */

// Type definitions and schemas
export type {
  Catalog,
  Profile,
  Control,
  Parameter,
  EvaluatorConfig,
  FrameworkMapping,
  ControlTailoring,
  ParameterValue,
  ScopeConfig,
  ReportingConfig,
  ResolvedPolicy,
  ResolvedControl,
  ResolvedParameter,
  EvaluationContext,
  EvaluationResult,
  Evaluator,
  Severity,
  EvaluatorKind,
  DetectorType,
  ParameterType,
  ReportFormat,
} from './types.js';

export {
  CatalogSchema,
  ProfileSchema,
  SeveritySchema,
  EvaluatorKindSchema,
  DetectorTypeSchema,
  ParameterTypeSchema,
  ReportFormatSchema,
} from './types.js';

// Loaders
export { loadCatalog, loadProfile, loadCatalogForProfile } from './loader.js';

// Policy resolution
export { resolvePolicy } from './resolver.js';

// Evaluator registry
export { evaluatorRegistry, registerEvaluator } from './evaluator-registry.js';

// Errors
export {
  PolicyError,
  PolicyLoadError,
  PolicyValidationError,
  PolicyResolutionError,
  EvaluatorError,
  ParameterValidationError,
} from './errors.js';
