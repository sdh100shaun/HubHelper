/**
 * Evaluator Stub Template
 *
 * Used by PolicyAuthorService to generate skeleton evaluator source files
 * from natural-language control descriptions.
 *
 * @module templates/evaluator-stub
 */

export interface EvaluatorStubParams {
  /** Control ID, e.g. HH-GH-011 */
  controlId: string;
  /** Detector slug used in catalog.yaml, e.g. branch-protection-check */
  detectorSlug: string;
  /** Pascal-case class name, e.g. BranchProtectionCheckEvaluator */
  className: string;
  /** EvaluatorKind: github.pull-request | github.workflow | github.repository | classifier | meta */
  kind: string;
  /** Short human-readable statement from the control definition */
  statement: string;
}

/**
 * Generate a TypeScript evaluator stub file for a new control.
 */
export function generateEvaluatorStub(params: EvaluatorStubParams): string {
  const { controlId, detectorSlug, className, kind, statement } = params;

  return `import { registerEvaluator } from '../policy/evaluator-registry.js';
import type {
  EvaluationContext,
  EvaluationResult,
  EvaluatorKind,
} from '../policy/types.js';
import { BaseEvaluator } from './base-evaluator.js';

@registerEvaluator('${detectorSlug}')
export class ${className} extends BaseEvaluator {
  readonly controlId = '${controlId}';
  readonly kind: EvaluatorKind = '${kind}';

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: import('../policy/types.js').Severity
  ): Promise<EvaluationResult> {
    // TODO: implement evaluation logic for:
    // ${statement}
    //
    // Use context.repositories, context.pullRequests, context.workflowRuns
    // Return issues as SecurityIssue objects via this.makeIssue(...)
    return {
      controlId: this.controlId,
      issues: [],
      metadata: {
        itemsEvaluated: 0,
        executionTimeMs: 0,
      },
    };
  }
}
`;
}

/**
 * Generate a catalog.yaml snippet for a new control.
 */
export function generateCatalogSnippet(params: {
  controlId: string;
  statement: string;
  family: string;
  detectorSlug: string;
  kind: string;
  severity: string;
  nistMappings?: string[];
}): string {
  const { controlId, statement, family, detectorSlug, kind, severity, nistMappings = [] } = params;

  const mappingLines =
    nistMappings.length > 0
      ? `\n  mappings:\n    NIST-800-53:\n${nistMappings.map((m) => `      - ${m}`).join('\n')}`
      : '';

  return `- id: ${controlId}
  statement: "${statement}"
  family: ${family}
  evaluator:
    kind: ${kind}
    detector: ${detectorSlug}
  default-severity: ${severity}${mappingLines}
`;
}
