/**
 * Policy Engine
 *
 * Orchestrates policy-driven security analysis by:
 * 1. Loading catalog and profile
 * 2. Resolving policy (merging catalog + profile)
 * 3. Executing evaluators in dependency order
 * 4. Collecting and returning results
 *
 * @module policy/engine
 */

import type { PullRequest, Repository, SecurityIssue, WorkflowRun } from '../types/index.js';
import { EvaluatorError } from './errors.js';
import { evaluatorRegistry } from './evaluator-registry.js';
import { loadCatalog, loadCatalogForProfile, loadProfile } from './loader.js';
import { resolvePolicy } from './resolver.js';
import type {
  EvaluationContext,
  EvaluationResult,
  ResolvedControl,
  ResolvedPolicy,
} from './types.js';

// Ensure evaluators are registered
import '../evaluators/index.js';

export interface PolicyEngineResult {
  /** Issues from active controls — included in compliance reports and fail-threshold. */
  issues: SecurityIssue[];
  /** Issues from controls in 'review' state — collected but excluded from compliance scoring. */
  reviewIssues: SecurityIssue[];
  statistics: {
    controlsEvaluated: number;
    totalIssues: number;
    issuesBySeverity: Record<string, number>;
    executionTimeMs: number;
  };
  policy: ResolvedPolicy;
}

export class PolicyEngine {
  private policy: ResolvedPolicy | null = null;

  /**
   * Load policy from files
   */
  async loadPolicy(profilePath: string): Promise<void> {
    const profile = await loadProfile(profilePath);
    const catalog = await loadCatalogForProfile(profile, profilePath);
    this.policy = resolvePolicy(catalog, profile);
  }

  /**
   * Evaluate using loaded policy
   */
  async evaluate(
    repositories: Repository[],
    pullRequests: PullRequest[],
    workflowRuns: WorkflowRun[]
  ): Promise<PolicyEngineResult> {
    if (!this.policy) {
      throw new Error('Policy not loaded. Call loadPolicy() first.');
    }

    const startTime = Date.now();
    const context: EvaluationContext = {
      repositories,
      pullRequests,
      workflowRuns,
      scope: this.policy.scope,
      classifierResults: new Map(),
    };

    const allIssues: SecurityIssue[] = [];
    const reviewIssues: SecurityIssue[] = [];
    const evaluationResults: EvaluationResult[] = [];

    // Execute controls in order (already sorted by resolver)
    for (const control of this.policy.controls) {
      // disabled controls are filtered out during resolution; skip any that slip through
      if (control.state === 'disabled') {
        continue;
      }

      try {
        const result = await this.evaluateControl(control, context);
        evaluationResults.push(result);

        // Store classifier results for dependent controls
        if (control.evaluator.kind === 'classifier') {
          context.classifierResults?.set(control.id, result.issues);
        }

        // Collect issues (skip classifiers - they're just data providers)
        if (control.evaluator.kind !== 'classifier') {
          if (control.state === 'review') {
            reviewIssues.push(...(result.issues as SecurityIssue[]));
          } else {
            allIssues.push(...(result.issues as SecurityIssue[]));
          }
        }
      } catch (error) {
        console.error(`Error evaluating control ${control.id}:`, error);
        throw new EvaluatorError(
          `Failed to evaluate control ${control.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          control.id,
          control.evaluator.kind
        );
      }
    }

    // Calculate statistics (active issues only — review issues excluded from scoring)
    const issuesBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const issue of allIssues) {
      issuesBySeverity[issue.severity]++;
    }

    return {
      issues: allIssues,
      reviewIssues,
      statistics: {
        controlsEvaluated: evaluationResults.length,
        totalIssues: allIssues.length,
        issuesBySeverity,
        executionTimeMs: Date.now() - startTime,
      },
      policy: this.policy,
    };
  }

  /**
   * Evaluate a single control
   */
  private async evaluateControl(
    control: ResolvedControl,
    context: EvaluationContext
  ): Promise<EvaluationResult> {
    // Get evaluator
    const evaluator = evaluatorRegistry.get(control.evaluator.detector, control.id);

    // Build parameters map
    const parameters: Record<string, unknown> = {};
    for (const param of control.parameters) {
      parameters[param.id] = param.value;
    }

    // Validate parameters
    evaluator.validateParameters(parameters);

    // Execute evaluation
    return evaluator.evaluate(context, parameters, control.severity);
  }

  /**
   * Get loaded policy
   */
  getPolicy(): ResolvedPolicy | null {
    return this.policy;
  }
}
