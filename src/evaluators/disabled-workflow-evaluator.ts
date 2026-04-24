/**
 * Disabled Workflow Evaluator (HH-GH-006)
 *
 * Detects workflows that were manually disabled.
 * Should be reviewed to ensure they're not needed for testing or deployment.
 *
 * @module evaluators/disabled-workflow-evaluator
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { SecurityIssue } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluator for manually disabled workflows
 */
@registerEvaluator('disabled-workflow')
export class DisabledWorkflowEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-006';
  readonly kind = 'github.workflow' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Extract parameters
    const workflowState =
      this.getStringParam(parameters, 'workflow_state', false) || 'disabled_manually';

    const issues: SecurityIssue[] = [];

    for (const repo of context.repositories) {
      if (!repo.workflows) continue;

      for (const workflow of repo.workflows) {
        if (workflow.state === workflowState) {
          issues.push({
            type: 'disabled-workflow',
            severity,
            repository: repo.full_name,
            description: `Workflow "${workflow.name}" has been manually disabled`,
            details: {
              workflow_name: workflow.name,
              workflow_path: workflow.path,
              workflow_url: workflow.url,
              updated_at: workflow.updated_at,
            },
            detected_at: new Date().toISOString(),
          });
        }
      }
    }

    return {
      controlId: this.controlId,
      issues,
      metadata: {
        itemsEvaluated: context.repositories.reduce(
          (sum, repo) => sum + (repo.workflows?.length || 0),
          0
        ),
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  validateParameters(parameters: Record<string, unknown>): void {
    // workflow_state is optional
    if (parameters.workflow_state !== undefined) {
      this.getStringParam(parameters, 'workflow_state', false);
    }
  }
}
