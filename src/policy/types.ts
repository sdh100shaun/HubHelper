/**
 * Policy System Type Definitions
 *
 * Zod schemas and TypeScript types for the YAML-based policy system.
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

/**
 * Lifecycle state of a resolved control.
 * - active   : evaluated; issues included in compliance reports and fail-threshold
 * - disabled : not evaluated; no issues generated
 * - review   : evaluated; issues are collected but excluded from compliance reports
 *              and fail-threshold — appears in a separate informational section
 *
 * The legacy `enabled: boolean` field is kept as a backward-compatible alias:
 *   enabled: false  → state: 'disabled'
 *   enabled: true   → state: 'active'
 */
export const ControlStateSchema = z.enum(['active', 'disabled', 'review']);
export type ControlState = z.infer<typeof ControlStateSchema>;

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

const CatalogMetadataSchema = z.object({
  title: z.string(),
  version: z.string(),
  'last-modified': z.string().datetime(),
  'oscal-version': z.string(),
});

const ParameterSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  type: ParameterTypeSchema,
  'item-type': z.string().optional(),
  default: z.unknown().optional(),
  values: z.array(z.string()).optional(),
  required: z.boolean().optional().default(false),
});

export type Parameter = z.infer<typeof ParameterSchema>;

const EvaluatorConfigSchema = z.object({
  kind: EvaluatorKindSchema,
  detector: DetectorTypeSchema,
  'depends-on': z.array(z.string()).optional(),
});

export type EvaluatorConfig = z.infer<typeof EvaluatorConfigSchema>;

const FrameworkMappingSchema = z.record(z.string(), z.array(z.string()));
export type FrameworkMapping = z.infer<typeof FrameworkMappingSchema>;

const ControlSchema = z.object({
  id: z.string(),
  statement: z.string(),
  family: z.string(),
  evaluator: EvaluatorConfigSchema,
  parameter: z.array(ParameterSchema).optional().default([]),
  'default-severity': SeveritySchema,
  mappings: FrameworkMappingSchema.optional(),
  // `state` takes precedence; `enabled` is a deprecated backward-compat alias
  state: ControlStateSchema.optional(),
  enabled: z.boolean().optional().default(true),
});

export type Control = z.infer<typeof ControlSchema>;

export const CatalogSchema = z.object({
  metadata: CatalogMetadataSchema,
  controls: z.array(ControlSchema),
});

export type Catalog = z.infer<typeof CatalogSchema>;

// ============================================================================
// Profile Schema (profile.yaml)
// ============================================================================

const ProfileMetadataSchema = z.object({
  title: z.string(),
  version: z.string(),
  owner: z.string().optional(),
  contact: z.string().email().optional(),
  description: z.string().optional(),
});

const CatalogReferenceSchema = z.object({
  href: z.string(),
  version: z.string(),
});

const ParameterValueSchema = z.record(z.string(), z.unknown());
export type ParameterValue = z.infer<typeof ParameterValueSchema>;

const ControlTailoringSchema = z.object({
  'control-id': z.string(),
  'parameter-values': ParameterValueSchema.optional(),
  severity: SeveritySchema.optional(),
  // `state` takes precedence; `enabled` is a deprecated backward-compat alias
  state: ControlStateSchema.optional(),
  enabled: z.boolean().optional(),
});

export type ControlTailoring = z.infer<typeof ControlTailoringSchema>;

const ControlsConfigSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional().default([]),
  tailoring: z.array(ControlTailoringSchema).optional().default([]),
});

const ScopeConfigSchema = z.object({
  repositories: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  'lookback-days': z.number().int().positive().optional().default(30),
});

export type ScopeConfig = z.infer<typeof ScopeConfigSchema>;

const ReportingConfigSchema = z.object({
  formats: z.array(ReportFormatSchema),
  'output-dir': z.string().optional(),
  'fail-threshold': SeveritySchema.optional(),
  'include-recommendations': z.boolean().optional().default(true),
});

export type ReportingConfig = z.infer<typeof ReportingConfigSchema>;

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

export interface ResolvedParameter extends Parameter {
  value: unknown;
}

export interface ResolvedControl {
  id: string;
  statement: string;
  family: string;
  evaluator: EvaluatorConfig;
  parameters: ResolvedParameter[];
  severity: Severity;
  mappings?: FrameworkMapping;
  /** Resolved lifecycle state — replaces the legacy `enabled` boolean. */
  state: ControlState;
  /** @deprecated Use `state` instead. Kept for backward compatibility. */
  enabled: boolean;
}

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

export interface EvaluationContext {
  repositories: Repository[];
  pullRequests: PullRequest[];
  workflowRuns: WorkflowRun[];
  scope: ScopeConfig;
  classifierResults?: Map<string, unknown>;
}

export interface EvaluationResult {
  controlId: string;
  issues: unknown[];
  metadata?: {
    itemsEvaluated: number;
    executionTimeMs: number;
  };
}

export interface Evaluator {
  readonly controlId: string;
  readonly kind: EvaluatorKind;

  evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult>;

  validateParameters(parameters: Record<string, unknown>): void;
}
