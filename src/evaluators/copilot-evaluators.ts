/**
 * Copilot governance evaluators (HH-GH-011 to HH-GH-020).
 *
 * All are `github.copilot` evaluators: they read `context.copilot` (a
 * `CopilotUsageModel`) and return no issues when it is absent, so `analyze`
 * and other commands without Copilot data are unaffected.
 *
 * @module evaluators/copilot-evaluators
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type {
  EvaluationContext,
  EvaluationResult,
  EvaluatorKind,
  Severity,
} from '../policy/types.js';
import type { CopilotUsageModel } from '../services/copilot/model.js';
import { scopeSlug } from '../types/copilot.js';
import type { CopilotIssueType, SecurityIssue, SecurityIssueDetails } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

abstract class CopilotEvaluator extends BaseEvaluator {
  readonly kind: EvaluatorKind = 'github.copilot';
  protected abstract readonly issueType: CopilotIssueType;

  protected abstract check(
    model: CopilotUsageModel,
    parameters: Record<string, unknown>,
    severity: Severity
  ): SecurityIssue[];

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const start = Date.now();
    const model = context.copilot;
    const issues = model ? this.check(model, parameters, severity) : [];
    return {
      controlId: this.controlId,
      issues,
      metadata: { itemsEvaluated: model ? 1 : 0, executionTimeMs: Date.now() - start },
    };
  }

  protected issue(
    model: CopilotUsageModel,
    severity: Severity,
    subject: string | undefined,
    description: string,
    details: SecurityIssueDetails
  ): SecurityIssue {
    return {
      type: this.issueType,
      severity,
      repository: subject || scopeSlug(model.scope),
      description,
      details: { control_id: this.controlId, ...details },
      detected_at: model.generatedAt,
    };
  }

  protected number(parameters: Record<string, unknown>, key: string, fallback: number): number {
    return this.getNumberParam(parameters, key, false) ?? fallback;
  }

  protected list(parameters: Record<string, unknown>, key: string): string[] {
    return (this.getStringArrayParam(parameters, key, false) ?? []).map((s) => s.toLowerCase());
  }
}

/** Matches when the value equals, or starts with, an allow-list entry (e.g. `gpt-5` allows `gpt-5-mini`). */
function allowed(value: string, list: string[]): boolean {
  const v = value.toLowerCase();
  return list.some(
    (entry) => v === entry || v.startsWith(`${entry}-`) || v.startsWith(`${entry}.`)
  );
}

function pct(value: number): number {
  return Math.round(value * 1000) / 10;
}

@registerEvaluator('copilot-idle-seat')
export class CopilotIdleSeatEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-011';
  protected readonly issueType = 'copilot-idle-seat' as const;

  protected check(model: CopilotUsageModel, p: Record<string, unknown>, severity: Severity) {
    const threshold = this.number(p, 'inactive_days', 30);
    return model.seats.all
      .filter((s) => s.idleDays === null || s.idleDays > threshold)
      .map((s) =>
        this.issue(
          model,
          severity,
          s.org,
          !s.lastActivityAt
            ? `Copilot seat for ${s.login} has not been used since it was assigned${s.idleDays === null ? '' : ` ${s.idleDays} days ago`}`
            : `Copilot seat for ${s.login} has been idle for ${s.idleDays} days`,
          {
            login: s.login,
            org: s.org,
            idle_days: s.idleDays,
            last_activity_at: s.lastActivityAt,
            assigning_team: s.assigningTeam,
          }
        )
      );
  }
}

@registerEvaluator('copilot-public-code-matching')
export class CopilotPublicCodeMatchingEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-012';
  protected readonly issueType = 'copilot-public-code-matching' as const;

  protected check(model: CopilotUsageModel, p: Record<string, unknown>, severity: Severity) {
    const required = (this.getStringParam(p, 'required_setting', false) ?? 'block').toLowerCase();
    return model.settings
      .filter(
        (s) =>
          s.publicCodeSuggestions !== undefined &&
          s.publicCodeSuggestions.toLowerCase() !== required
      )
      .map((s) =>
        this.issue(
          model,
          severity,
          s.orgLogin,
          `Copilot suggestions matching public code are "${s.publicCodeSuggestions}" in ${s.orgLogin} (expected "${required}")`,
          { org: s.orgLogin, actual: s.publicCodeSuggestions, expected: required }
        )
      );
  }
}

@registerEvaluator('copilot-unapproved-model')
export class CopilotUnapprovedModelEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-013';
  protected readonly issueType = 'copilot-unapproved-model' as const;

  protected check(model: CopilotUsageModel, p: Record<string, unknown>, severity: Severity) {
    const allow = this.list(p, 'allowed_models');
    if (allow.length === 0) return [];
    return model.breakdowns.model
      .filter((m) => m.key.toLowerCase() !== 'unknown' && !allowed(m.key, allow))
      .map((m) =>
        this.issue(
          model,
          severity,
          undefined,
          `Copilot model ${m.key} is not on the approved list (${m.users} user(s))`,
          { model: m.key, users: m.users, interactions: m.interactions }
        )
      );
  }
}

@registerEvaluator('copilot-unapproved-client')
export class CopilotUnapprovedClientEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-014';
  protected readonly issueType = 'copilot-unapproved-client' as const;

  protected check(model: CopilotUsageModel, p: Record<string, unknown>, severity: Severity) {
    const allow = this.list(p, 'allowed_clients');
    if (allow.length === 0) return [];
    const seen = new Map<string, number>();
    for (const entry of [...model.breakdowns.ide, ...model.breakdowns.client]) {
      if (entry.key.toLowerCase() === 'unknown' || allowed(entry.key, allow)) continue;
      seen.set(entry.key, Math.max(seen.get(entry.key) ?? 0, entry.users));
    }
    return [...seen.entries()].map(([client, users]) =>
      this.issue(
        model,
        severity,
        undefined,
        `Copilot is used from ${client}, which is not on the approved list (${users} user(s))`,
        { client, users }
      )
    );
  }
}

@registerEvaluator('copilot-agent-pr-unreviewed')
export class CopilotAgentPrUnreviewedEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-015';
  protected readonly issueType = 'copilot-agent-pr-unreviewed' as const;

  protected check(model: CopilotUsageModel, _p: Record<string, unknown>, severity: Severity) {
    return model.agentPrs.mergedWithoutHumanApproval.map((pr) =>
      this.issue(
        model,
        severity,
        pr.repo,
        `Copilot coding agent PR #${pr.number} was merged without a human approval`,
        {
          pr_number: pr.number,
          title: pr.title,
          url: pr.url,
          requested_by: pr.requestedBy,
          merged_at: pr.mergedAt,
        }
      )
    );
  }
}

@registerEvaluator('copilot-spend-threshold')
export class CopilotSpendThresholdEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-016';
  protected readonly issueType = 'copilot-spend-threshold' as const;

  protected check(model: CopilotUsageModel, p: Record<string, unknown>, severity: Severity) {
    const budget = this.number(p, 'monthly_budget', 0);
    const cap = this.number(p, 'per_user_cap', 0);
    const issues: SecurityIssue[] = [];
    const forecast = model.spend.monthToDate.forecastNetAmount;
    if (budget > 0 && forecast > budget) {
      issues.push(
        this.issue(
          model,
          severity,
          undefined,
          `Copilot spend for ${model.spend.monthToDate.month} is forecast at ${forecast.toFixed(2)}, above the budget of ${budget}`,
          {
            actual: Number(forecast.toFixed(2)),
            limit: budget,
            month: model.spend.monthToDate.month,
          }
        )
      );
    }
    if (cap > 0) {
      for (const user of model.spend.byUser.filter((u) => u.aiCreditsUsed > cap)) {
        issues.push(
          this.issue(
            model,
            severity,
            undefined,
            `${user.login} used ${user.aiCreditsUsed} ${model.spend.unit}, above the per-user cap of ${cap}`,
            { login: user.login, actual: user.aiCreditsUsed, limit: cap }
          )
        );
      }
    }
    return issues;
  }
}

@registerEvaluator('copilot-seat-sprawl')
export class CopilotSeatSprawlEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-017';
  protected readonly issueType = 'copilot-seat-sprawl' as const;

  protected check(model: CopilotUsageModel, p: Record<string, unknown>, severity: Severity) {
    const max = this.number(p, 'max_direct_pct', 50);
    const direct = model.seats.directAssignedPct;
    if (direct === null || pct(direct) <= max) return [];
    return [
      this.issue(
        model,
        severity,
        undefined,
        `${pct(direct)}% of Copilot seats are assigned directly rather than through teams (limit ${max}%)`,
        { direct_pct: pct(direct), limit: max, seats: model.seats.total }
      ),
    ];
  }
}

@registerEvaluator('copilot-duplicate-seat')
export class CopilotDuplicateSeatEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-018';
  protected readonly issueType = 'copilot-duplicate-seat' as const;

  protected check(model: CopilotUsageModel, _p: Record<string, unknown>, severity: Severity) {
    if (model.scope.kind !== 'enterprise') return [];
    return model.seats.multiOrgUsers.map((u) =>
      this.issue(
        model,
        severity,
        undefined,
        `${u.login} holds Copilot seats in ${u.orgs.length} organisations`,
        { login: u.login, orgs: u.orgs }
      )
    );
  }
}

@registerEvaluator('copilot-org-policy-drift')
export class CopilotOrgPolicyDriftEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-019';
  protected readonly issueType = 'copilot-org-policy-drift' as const;

  protected check(model: CopilotUsageModel, p: Record<string, unknown>, severity: Severity) {
    if (model.scope.kind !== 'enterprise') return [];
    const baseline = (this.getStringArrayParam(p, 'baseline', false) ?? [])
      .map((entry) => entry.split('='))
      .filter((parts) => parts.length === 2 && parts[0].trim() && parts[1].trim())
      .map(([key, value]) => ({ key: key.trim(), value: value.trim().toLowerCase() }));
    const issues: SecurityIssue[] = [];
    for (const settings of model.settings) {
      for (const { key, value } of baseline) {
        const actual = settings.all[key];
        if (actual === undefined || actual.toLowerCase() === value) continue;
        issues.push(
          this.issue(
            model,
            severity,
            settings.orgLogin,
            `Copilot setting ${key} in ${settings.orgLogin} is "${actual}" (baseline "${value}")`,
            { org: settings.orgLogin, setting: key, actual, expected: value }
          )
        );
      }
    }
    return issues;
  }
}

@registerEvaluator('copilot-unallocated-spend')
export class CopilotUnallocatedSpendEvaluator extends CopilotEvaluator {
  readonly controlId = 'HH-GH-020';
  protected readonly issueType = 'copilot-unallocated-spend' as const;

  protected check(model: CopilotUsageModel, p: Record<string, unknown>, severity: Severity) {
    if (model.scope.kind !== 'enterprise' || model.spend.byCostCentre.length === 0) return [];
    const max = this.number(p, 'max_unallocated_pct', 10);
    const total = model.kpis.aiCreditsUsed;
    if (total <= 0) return [];
    const share = pct(model.spend.unallocatedCredits / total);
    if (share <= max) return [];
    return [
      this.issue(
        model,
        severity,
        undefined,
        `${share}% of Copilot usage is not assigned to a cost centre (limit ${max}%)`,
        { unallocated_pct: share, limit: max, unallocated: model.spend.unallocatedCredits }
      ),
    ];
  }
}
