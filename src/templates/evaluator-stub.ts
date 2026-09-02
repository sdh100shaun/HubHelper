/**
 * Evaluator Stub Template
 *
 * Used by PolicyAuthorService to generate skeleton evaluator source files
 * from natural-language control descriptions.
 *
 * @module templates/evaluator-stub
 */

import { stringify as stringifyYaml } from 'yaml';

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
 *
 * All values are serialised via `yaml.stringify` so quotes, colons, newlines,
 * and other YAML metacharacters inside AI-generated strings cannot break out
 * of their scalar and inject structure into the emitted catalog fragment.
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

  const control: Record<string, unknown> = {
    id: controlId,
    statement,
    family,
    evaluator: {
      kind,
      detector: detectorSlug,
    },
    'default-severity': severity,
  };

  if (nistMappings.length > 0) {
    control.mappings = { 'NIST-800-53': nistMappings };
  }

  // stringify produces `id: ...` at column 0; the catalog uses a list item
  // (`- id: ...`), so indent all trailing lines by two spaces after prefixing
  // the leading `- `.
  const yaml = stringifyYaml([control]);
  return yaml;
}
