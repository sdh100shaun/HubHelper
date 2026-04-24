/**
 * Security PR Volume Evaluator (HH-GH-009)
 *
 * Meta-recommendation control that suggests automated dependency updates
 * when there's a high volume of security-related PRs.
 *
 * @module evaluators/security-pr-volume-evaluator
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { SecurityIssue } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluator for security PR volume recommendation
 */
@registerEvaluator('security-pr-volume')
export class SecurityPRVolumeEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-009';
  readonly kind = 'meta' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Extract parameters
    const threshold = this.getNumberParam(parameters, 'threshold', false) || 5;
    const recommendation =
      this.getStringParam(parameters, 'recommendation', false) ||
      'Consider implementing automated dependency updates with Dependabot';

    // Get classifier results to count security PRs
    const classifierResults = context.classifierResults?.get('HH-GH-003');
    let securityPRCount = 0;

    if (classifierResults && Array.isArray(classifierResults)) {
      securityPRCount = classifierResults.length;
    }

    const issues: SecurityIssue[] = [];

    // Generate recommendation if threshold exceeded
    if (securityPRCount > threshold) {
      // Group by repository for more detailed recommendation
      const prsByRepo = new Map<string, number>();

      if (classifierResults && Array.isArray(classifierResults)) {
        for (const issue of classifierResults) {
          if (
            typeof issue === 'object' &&
            issue !== null &&
            'repository' in issue &&
            typeof issue.repository === 'string'
          ) {
            const repo = issue.repository;
            prsByRepo.set(repo, (prsByRepo.get(repo) || 0) + 1);
          }
        }
      }

      // Find repositories with most security PRs
      const topRepos = Array.from(prsByRepo.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([repo, count]) => `${repo} (${count} PRs)`)
        .join(', ');

      issues.push({
        type: 'security-pr-volume',
        severity,
        repository: 'organization-wide',
        description: `High volume of security PRs detected (${securityPRCount} PRs). ${recommendation}`,
        details: {
          security_pr_count: securityPRCount,
          threshold,
          recommendation,
          top_repositories: topRepos,
        },
        detected_at: new Date().toISOString(),
      });
    }

    return {
      controlId: this.controlId,
      issues,
      metadata: {
        itemsEvaluated: securityPRCount,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  validateParameters(parameters: Record<string, unknown>): void {
    // Parameters are optional
    if (parameters.threshold !== undefined) {
      this.getNumberParam(parameters, 'threshold', false);
    }
    if (parameters.recommendation !== undefined) {
      this.getStringParam(parameters, 'recommendation', false);
    }
  }
}
