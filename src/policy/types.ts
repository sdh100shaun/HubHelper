/**
 * Policy System Type Definitions
 *
 * Zod schemas and TypeScript types for the YAML-based policy system.
 * Defines the structure for:
 * - Control Catalog (controls definitions with parameters)
 * - Profiles (control selections and tailoring)
 * - Policy Resolution (merged runtime configuration)
 *
 * @module policy/types
 */

import { z } from 'zod';
import type { PullRequest, Repository, WorkflowRun } from '../types/index.js';

// ============================================================================
// Shared Enums and Constants
// ============================================================================

export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof SeveritySchema>;

export const EvaluatorKindSchema = z.enum([
  'github.pull-request',
  'github.workflow',
  'github.repository',
  'classifier',
  'meta',
]);
export type EvaluatorKind = z.infer<typeof EvaluatorKindSchema>;

export const DetectorTypeSchema = z.enum([
  'self-merge',
  'security-pr',
  'security-pr-classifier',
  'unreviewed-security-pr',
  'disabled-actions',
  'paused-workflow',
  'disabled-workflow',
  'action-failure',
  'repeated-action-failure',
  'security-pr-volume',
]);
export type DetectorType = z.infer<typeof DetectorTypeSchema>;

export const ParameterTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'string-array',
  'severity',
  'severity-map',
]);
export type ParameterType = z.infer<typeof ParameterTypeSchema>;

export const ReportFormatSchema = z.enum(['console', 'json', 'html', 'sarif']);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

// ============================================================================
// Catalog Schema (catalog.yaml)
// ============================================================================

/**
 * Catalog metadata
 */
const CatalogMetadataSchema = z.object({
  title: z.string(),
  version: z.string(),
  'last-modified': z.string().datetime(),
  'oscal-version': z.string(),
});

/**
 * Parameter definition in a control
 */
const ParameterSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  type: ParameterTypeSchema,
  'item-type': z.string().optional(), // For arrays, the type of array items
  default: z.unknown().optional(), // Can be any type - validated by resolver based on 'type' field
  values: z.array(z.string()).optional(), // Allowed values (enum)
  required: z.boolean().optional().default(false),
});

export type Parameter = z.infer<typeof ParameterSchema>;

/**
 * Evaluator configuration in a control
 */
const EvaluatorConfigSchema = z.object({
  kind: EvaluatorKindSchema,
  detector: DetectorTypeSchema,
  'depends-on': z.array(z.string()).optional(), // Control IDs this evaluator depends on
});

export type EvaluatorConfig = z.infer<typeof EvaluatorConfigSchema>;

/**
 * Framework mapping for compliance
 */
const FrameworkMappingSchema = z.record(z.string(), z.array(z.string()));

export type FrameworkMapping = z.infer<typeof FrameworkMappingSchema>;

/**
 * Control definition in catalog
 */
const ControlSchema = z.object({
  id: z.string(),
  statement: z.string(),
  family: z.string(),
  evaluator: EvaluatorConfigSchema,
  parameter: z.array(ParameterSchema).optional().default([]),
  'default-severity': SeveritySchema,
  mappings: FrameworkMappingSchema.optional(),
  enabled: z.boolean().optional().default(true),
});

export type Control = z.infer<typeof ControlSchema>;

/**
 * Complete catalog structure
 */
export const CatalogSchema = z.object({
  metadata: CatalogMetadataSchema,
  controls: z.array(ControlSchema),
});

export type Catalog = z.infer<typeof CatalogSchema>;

// ============================================================================
// Profile Schema (profile.yaml)
// ============================================================================

/**
 * Profile metadata
 */
const ProfileMetadataSchema = z.object({
  title: z.string(),
  version: z.string(),
  owner: z.string().optional(),
  contact: z.string().email().optional(),
  description: z.string().optional(),
});

/**
 * Catalog reference
 */
const CatalogReferenceSchema = z.object({
  href: z.string(), // Path to catalog.yaml
  version: z.string(),
});

/**
 * Parameter value override in profile
 */
const ParameterValueSchema = z.record(z.string(), z.unknown()); // Values can be any type

export type ParameterValue = z.infer<typeof ParameterValueSchema>;

/**
 * Control tailoring (overrides)
 */
const ControlTailoringSchema = z.object({
  'control-id': z.string(),
  'parameter-values': ParameterValueSchema.optional(),
  severity: SeveritySchema.optional(),
  enabled: z.boolean().optional(),
});

export type ControlTailoring = z.infer<typeof ControlTailoringSchema>;

/**
 * Controls selection and tailoring
 */
const ControlsConfigSchema = z.object({
  include: z.array(z.string()).optional(), // Control IDs to include (if omitted, all)
  exclude: z.array(z.string()).optional().default([]),
  tailoring: z.array(ControlTailoringSchema).optional().default([]),
});

/**
 * Scope configuration
 */
const ScopeConfigSchema = z.object({
  repositories: z.array(z.string()).optional(), // Specific repos (if omitted, all in org)
  topics: z.array(z.string()).optional(), // Filter by topic
  'lookback-days': z.number().int().positive().optional().default(30),
});

export type ScopeConfig = z.infer<typeof ScopeConfigSchema>;

/**
 * Reporting configuration
 */
const ReportingConfigSchema = z.object({
  formats: z.array(ReportFormatSchema),
  'output-dir': z.string().optional(),
  'fail-threshold': SeveritySchema.optional(), // Exit with error if issues >= threshold
  'include-recommendations': z.boolean().optional().default(true),
});

export type ReportingConfig = z.infer<typeof ReportingConfigSchema>;

/**
 * Complete profile structure
 */
export const ProfileSchema = z.object({
  metadata: ProfileMetadataSchema,
  'catalog-ref': CatalogReferenceSchema,
  controls: ControlsConfigSchema,
  scope: ScopeConfigSchema.optional(),
  reporting: ReportingConfigSchema.optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;

// ============================================================================
// Resolved Policy (runtime merged configuration)
// ============================================================================

/**
 * Resolved parameter with value
 */
export interface ResolvedParameter extends Parameter {
  value: unknown; // Type depends on parameter 'type' field
}

/**
 * Resolved control (catalog + profile tailoring)
 */
export interface ResolvedControl {
  id: string;
  statement: string;
  family: string;
  evaluator: EvaluatorConfig;
  parameters: ResolvedParameter[];
  severity: Severity;
  mappings?: FrameworkMapping;
  enabled: boolean;
}

/**
 * Resolved policy (ready for evaluation)
 */
export interface ResolvedPolicy {
  metadata: {
    catalogVersion: string;
    profileVersion: string;
    profileTitle: string;
  };
  controls: ResolvedControl[];
  scope: ScopeConfig;
  reporting: ReportingConfig;
}

// ============================================================================
// Evaluator Interface
// ============================================================================

/**
 * Context passed to evaluators
 */
export interface EvaluationContext {
  repositories: Repository[];
  pullRequests: PullRequest[];
  workflowRuns: WorkflowRun[];
  scope: ScopeConfig;
  classifierResults?: Map<string, unknown>; // Results from classifier controls
}

/**
 * Result from an evaluator
 */
export interface EvaluationResult {
  controlId: string;
  issues: unknown[]; // SecurityIssue[] or classifier data
  metadata?: {
    itemsEvaluated: number;
    executionTimeMs: number;
  };
}

/**
 * Base evaluator interface
 */
export interface Evaluator {
  readonly controlId: string;
  readonly kind: EvaluatorKind;

  /**
   * Execute evaluation with resolved parameters
   */
  evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult>;

  /**
   * Validate that required parameters are present
   */
  validateParameters(parameters: Record<string, unknown>): void;
}
