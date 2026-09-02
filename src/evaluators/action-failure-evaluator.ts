/**
 * Action Failure Evaluators (HH-GH-007 & HH-GH-008)
 *
 * Detects workflow failures:
 * - HH-GH-007: Repeated failures (threshold-based, high severity)
 * - HH-GH-008: Single failures (medium severity)
 *
 * @module evaluators/action-failure-evaluator
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { SecurityIssue, WorkflowRun } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluator for repeated action failures
 */
@registerEvaluator('repeated-action-failure')
export class RepeatedActionFailureEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-007';
  readonly kind = 'github.workflow' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Extract parameters
    const threshold = this.getNumberParam(parameters, 'threshold', false) || 3;
    const recentLimit = this.getNumberParam(parameters, 'recent_limit', false) || 5;

    const issues: SecurityIssue[] = [];

    // Group failures by repository:workflow
    const failuresByWorkflow = new Map<string, WorkflowRun[]>();

    for (const run of context.workflowRuns) {
      if (run.conclusion === 'failure') {
        const key = `${run.repository}:${run.workflow_name}`;
        if (!failuresByWorkflow.has(key)) {
          failuresByWorkflow.set(key, []);
        }
        failuresByWorkflow.get(key)!.push(run);
      }
    }

    // Check for repeated failures
    for (const [key, failures] of failuresByWorkflow) {
      if (failures.length >= threshold) {
        const [repository, workflowName] = key.split(':');
        const sortedFailures = [...failures].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const recentRuns = sortedFailures.slice(0, recentLimit).map((run) => ({
          run_number: run.run_number,
          created_at: run.created_at,
          head_branch: run.head_branch,
        }));

        issues.push({
          type: 'repeated_action_failure',
          severity,
          repository,
          description: `Workflow "${workflowName}" has failed ${failures.length} times`,
          details: {
            workflow_name: workflowName,
            failure_count: failures.length,
            recent_runs: recentRuns,
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return {
      controlId: this.controlId,
      issues,
      metadata: {
        itemsEvaluated: context.workflowRuns.length,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  validateParameters(parameters: Record<string, unknown>): void {
    // Parameters are optional
    if (parameters.threshold !== undefined) {
      this.getNumberParam(parameters, 'threshold', false);
    }
    if (parameters.recent_limit !== undefined) {
      this.getNumberParam(parameters, 'recent_limit', false);
    }
  }
}

/**
 * Evaluator for single action failures
 */
@registerEvaluator('action-failure')
export class ActionFailureEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-008';
  readonly kind = 'github.workflow' as const;

  async evaluate(
    context: EvaluationContext,
    _parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    const issues: SecurityIssue[] = [];

    // Group failures to avoid duplicates with repeated failure detector
    const failuresByWorkflow = new Map<string, WorkflowRun[]>();

    for (const run of context.workflowRuns) {
      if (run.conclusion === 'failure') {
        const key = `${run.repository}:${run.workflow_name}`;
        if (!failuresByWorkflow.has(key)) {
          failuresByWorkflow.set(key, []);
        }
        failuresByWorkflow.get(key)!.push(run);
      }
    }

    // Report single failures (workflows with exactly 1 failure)
    for (const [_key, failures] of failuresByWorkflow) {
      if (failures.length === 1) {
        const run = failures[0];
        issues.push({
          type: 'action_failure',
          severity,
          repository: run.repository,
          description: `Workflow "${run.workflow_name}" failed (run #${run.run_number})`,
          details: {
            workflow_name: run.workflow_name,
            run_number: run.run_number,
            run_id: run.id,
            head_branch: run.head_branch,
            head_sha: run.head_sha,
            event: run.event,
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return {
      controlId: this.controlId,
      issues,
      metadata: {
        itemsEvaluated: context.workflowRuns.length,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  validateParameters(_parameters: Record<string, unknown>): void {
    // No parameters to validate
  }
}
