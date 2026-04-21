/**
 * Paused Workflow Evaluator (HH-GH-005)
 *
 * Detects workflows paused due to repository inactivity.
 * Paused scheduled workflows may indicate abandoned security processes.
 *
 * @module evaluators/paused-workflow-evaluator
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { SecurityIssue } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluator for paused workflows
 */
@registerEvaluator('paused-workflow')
export class PausedWorkflowEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-005';
  readonly kind = 'github.workflow' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Extract parameters
    const workflowState =
      this.getStringParam(parameters, 'workflow_state', false) || 'disabled_inactivity';
    const severityIfScheduled =
      this.getSeverityParam(parameters, 'severity_if_scheduled', false) || severity;
    const severityDefault = this.getSeverityParam(parameters, 'severity_default', false) || 'low';
    const inactivityPeriodDays =
      this.getNumberParam(parameters, 'inactivity_period_days', false) || 60;

    const issues: SecurityIssue[] = [];

    for (const repo of context.repositories) {
      if (!repo.workflows) continue;

      for (const workflow of repo.workflows) {
        if (workflow.state === workflowState) {
          const issueSeverity = workflow.is_scheduled ? severityIfScheduled : severityDefault;

          issues.push({
            type: 'paused-workflow',
            severity: issueSeverity,
            repository: repo.full_name,
            description: `Workflow "${workflow.name}" is paused due to inactivity`,
            details: {
              workflow_name: workflow.name,
              workflow_path: workflow.path,
              workflow_url: workflow.url,
              is_scheduled: workflow.is_scheduled,
              updated_at: workflow.updated_at,
              reason: `Workflows are automatically disabled after ${inactivityPeriodDays} days of repository inactivity`,
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
    // Validate parameters if provided
    if (parameters.workflow_state !== undefined) {
      this.getStringParam(parameters, 'workflow_state', false);
    }
    if (parameters.severity_if_scheduled !== undefined) {
      this.getSeverityParam(parameters, 'severity_if_scheduled', false);
    }
    if (parameters.severity_default !== undefined) {
      this.getSeverityParam(parameters, 'severity_default', false);
    }
    if (parameters.inactivity_period_days !== undefined) {
      this.getNumberParam(parameters, 'inactivity_period_days', false);
    }
  }
}
