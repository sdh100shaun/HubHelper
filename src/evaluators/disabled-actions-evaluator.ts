/**
 * Disabled Actions Evaluator (HH-GH-004)
 *
 * Detects repositories with GitHub Actions disabled.
 * Disabled Actions prevent automated security scanning and CI/CD workflows.
 *
 * @module evaluators/disabled-actions-evaluator
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { SecurityIssue } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluator for disabled GitHub Actions
 */
@registerEvaluator('disabled-actions')
export class DisabledActionsEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-004';
  readonly kind = 'github.repository' as const;

  async evaluate(
    context: EvaluationContext,
    _parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    const issues: SecurityIssue[] = [];

    for (const repo of context.repositories) {
      if (!repo.actions_enabled) {
        issues.push({
          type: 'disabled-actions',
          severity,
          repository: repo.full_name,
          description: `GitHub Actions is disabled on ${repo.name}`,
          details: {
            repo_name: repo.name,
            full_name: repo.full_name,
            is_private: repo.private,
            security_enabled: repo.security_enabled,
          },
          detected_at: new Date().toISOString(),
        });
      }
    }

    return {
      controlId: this.controlId,
      issues,
      metadata: {
        itemsEvaluated: context.repositories.length,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  validateParameters(_parameters: Record<string, unknown>): void {
    // No parameters to validate
  }
}
