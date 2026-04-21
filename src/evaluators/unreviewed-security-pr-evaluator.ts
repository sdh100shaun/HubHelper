/**
 * Unreviewed Security PR Evaluator (HH-GH-002)
 *
 * Detects security-related PRs that were merged without external review (self-merged).
 * This is a critical security risk.
 *
 * @module evaluators/unreviewed-security-pr-evaluator
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { SecurityIssue } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluator for unreviewed security PRs
 */
@registerEvaluator('unreviewed-security-pr')
export class UnreviewedSecurityPREvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-002';
  readonly kind = 'github.pull-request' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Extract parameters
    const fileLimit = this.getNumberParam(parameters, 'file_limit', false) || 10;

    // Get classifier results
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

    // Detect unreviewed security PRs
    const issues: SecurityIssue[] = [];

    for (const pr of context.pullRequests) {
      // Must be security-related AND self-merged
      if (securityPRs.has(pr.number) && pr.author === pr.merged_by && pr.merged_by !== null) {
        issues.push({
          type: 'unreviewed-security-pr',
          severity,
          repository: pr.repository,
          description: `CRITICAL: Security PR #${pr.number} "${pr.title}" was merged by author ${pr.author} without external review`,
          details: {
            pr_number: pr.number,
            title: pr.title,
            url: pr.url,
            author: pr.author,
            merged_by: pr.merged_by,
            merged_at: pr.merged_at,
            labels: pr.labels,
            files_changed: pr.files_changed.slice(0, fileLimit),
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

  validateParameters(parameters: Record<string, unknown>): void {
    // file_limit is optional
    const fileLimit = parameters.file_limit;
    if (fileLimit !== undefined) {
      this.getNumberParam(parameters, 'file_limit', false);
    }
  }
}
