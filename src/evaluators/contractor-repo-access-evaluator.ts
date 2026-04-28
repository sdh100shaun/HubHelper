/**
 * Contractor Repository Access Evaluator (HH-GH-010)
 *
 * Detects org members whose email matches a contractor domain and who have
 * pull-request activity in repositories outside the permitted list.
 *
 * Requires `context.orgMembers` to be populated (the policy engine accepts
 * an optional orgMembers array and forwards it to the context).
 *
 * @module evaluators/contractor-repo-access-evaluator
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { SecurityIssue } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluator for contractor repository access policy violations
 */
@registerEvaluator('contractor-repo-access')
export class ContractorRepoAccessEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-GH-010';
  readonly kind = 'github.repository' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    const contractorDomains =
      this.getStringArrayParam(parameters, 'contractor_domains', false) ?? [];
    const allowedRepos = this.getStringArrayParam(parameters, 'allowed_repos', false) ?? [];

    // Nothing to check if no contractor domains are configured
    if (contractorDomains.length === 0) {
      return {
        controlId: this.controlId,
        issues: [],
        metadata: { itemsEvaluated: 0, executionTimeMs: Date.now() - startTime },
      };
    }

    const orgMembers = context.orgMembers ?? [];

    // Build login → email map for members whose email matches a contractor domain
    const contractorsByLogin = new Map<string, string>(); // login (lower) → email
    for (const member of orgMembers) {
      if (!member.email) continue;
      const emailLower = member.email.toLowerCase();
      for (const domain of contractorDomains) {
        if (emailLower.endsWith(`@${domain.toLowerCase().replace(/^@/, '')}`)) {
          contractorsByLogin.set(member.login.toLowerCase(), member.email);
          break;
        }
      }
    }

    if (contractorsByLogin.size === 0) {
      return {
        controlId: this.controlId,
        issues: [],
        metadata: {
          itemsEvaluated: context.repositories.length,
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Normalise allowed repos: strip any org prefix, lowercase
    const allowedRepoNames = new Set(
      allowedRepos.map((r) => r.toLowerCase().split('/').pop() ?? r.toLowerCase())
    );

    const issues: SecurityIssue[] = [];
    // Deduplicate: one issue per (contractor login, repository) pair
    const seen = new Set<string>();

    for (const pr of context.pullRequests) {
      const authorLogin = pr.author.toLowerCase();
      const contractorEmail = contractorsByLogin.get(authorLogin);
      if (contractorEmail === undefined) continue;

      const repoShortName =
        pr.repository.split('/').pop()?.toLowerCase() ?? pr.repository.toLowerCase();
      const dedupeKey = `${authorLogin}|${repoShortName}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (!allowedRepoNames.has(repoShortName)) {
        issues.push({
          type: 'contractor-repo-access',
          severity,
          repository: pr.repository,
          description: `Contractor ${pr.author} has pull-request activity in ${pr.repository}, which is not in the permitted repository list for their domain`,
          details: {
            contractor_login: pr.author,
            contractor_email: contractorEmail,
            repo_name: repoShortName,
            full_name: pr.repository,
            allowed_repos: allowedRepos,
            contractor_domains: contractorDomains,
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

  validateParameters(parameters: Record<string, unknown>): void {
    this.getStringArrayParam(parameters, 'contractor_domains', false);
    this.getStringArrayParam(parameters, 'allowed_repos', false);
  }
}
