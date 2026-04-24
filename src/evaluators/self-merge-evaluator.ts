/**
 * Self-Merge Evaluator (HH-GH-001)
 *
 * Detects pull requests that were merged by their author.
 * Uses security PR classifier (HH-GH-003) to apply conditional severity.
 *
 * @module evaluators/self-merge-evaluator
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { PullRequest, SecurityIssue } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluator for self-merged pull requests
 */
@registerEvaluator('self-merge')
export class SelfMergeEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-001';
  readonly kind = 'github.pull-request' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Extract parameters
    const severityIfSecurity =
      this.getSeverityParam(parameters, 'severity_if_security', false) || 'high';
    const severityDefault =
      this.getSeverityParam(parameters, 'severity_default', false) || severity;

    // Get classifier results (if available)
    const classifierResults = context.classifierResults?.get('HH-GH-003');
    const securityPRs = new Set<number>();

    // Build set of security PR numbers from classifier
    if (classifierResults && Array.isArray(classifierResults)) {
      for (const issue of classifierResults) {
        if (
          typeof issue === 'object' &&
          issue !== null &&
          'details' in issue &&
          typeof issue.details === 'object' &&
          issue.details !== null &&
          'pr_number' in issue.details
        ) {
          securityPRs.add(issue.details.pr_number as number);
        }
      }
    }

    // Detect self-merged PRs
    const issues: SecurityIssue[] = [];

    for (const pr of context.pullRequests) {
      if (this.isSelfMerged(pr)) {
        const isSecurityRelated = securityPRs.has(pr.number);
        const issueSeverity = isSecurityRelated ? severityIfSecurity : severityDefault;

        issues.push({
          type: 'self-merge',
          severity: issueSeverity,
          repository: pr.repository,
          description: isSecurityRelated
            ? `Security-related PR #${pr.number} was self-merged by ${pr.author}`
            : `PR #${pr.number} was self-merged by ${pr.author}`,
          details: {
            pr_number: pr.number,
            title: pr.title,
            url: pr.url,
            author: pr.author,
            merged_by: pr.merged_by,
            merged_at: pr.merged_at,
            was_self_merged: true,
            labels: pr.labels,
            files_changed: pr.files_changed,
            is_security_related: isSecurityRelated,
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return {
      controlId: this.controlId,
      issues,
      metadata: {
        itemsEvaluated: context.pullRequests.length,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Check if PR was self-merged
   */
  private isSelfMerged(pr: PullRequest): boolean {
    return pr.author === pr.merged_by && pr.merged_by !== null;
  }

  validateParameters(parameters: Record<string, unknown>): void {
    // Validate severity parameters if provided
    const severityIfSecurity = parameters.severity_if_security;
    const severityDefault = parameters.severity_default;

    if (severityIfSecurity !== undefined) {
      this.getSeverityParam(parameters, 'severity_if_security', false);
    }

    if (severityDefault !== undefined) {
      this.getSeverityParam(parameters, 'severity_default', false);
    }
  }
}
