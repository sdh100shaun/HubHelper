/**
 * Scope helpers: REST paths for org and enterprise scopes, and a one-off
 * permission probe so commands can degrade instead of failing.
 *
 * @module services/copilot/scope
 */

import type { CopilotScope, ReportKind } from '../../types/copilot.js';
import { type CopilotApi, statusOf } from './api.js';

function base(scope: CopilotScope): string {
  return scope.kind === 'org'
    ? `/orgs/${encodeURIComponent(scope.org)}`
    : `/enterprises/${encodeURIComponent(scope.enterprise)}`;
}

/** Path of a daily report endpoint for the scope. */
export function reportPath(scope: CopilotScope, kind: ReportKind): string {
  const name =
    kind === 'scope-1-day'
      ? scope.kind === 'org'
        ? 'organization-1-day'
        : 'enterprise-1-day'
      : kind;
  return `GET ${base(scope)}/copilot/metrics/reports/${name}`;
}

export function seatsPath(scope: CopilotScope): string {
  return `GET ${base(scope)}/copilot/billing/seats`;
}

export function orgSettingsPath(org: string): string {
  return `GET /orgs/${encodeURIComponent(org)}/copilot/billing`;
}

/** Billing usage path. Org billing lives under `/organizations/`, not `/orgs/`. */
export function billingUsagePath(
  scope: CopilotScope,
  model: 'ai_credit' | 'premium_request'
): string {
  const owner =
    scope.kind === 'org'
      ? `/organizations/${encodeURIComponent(scope.org)}`
      : `/enterprises/${encodeURIComponent(scope.enterprise)}`;
  return `GET ${owner}/settings/billing/${model}/usage`;
}

export function costCentresPath(enterprise: string): string {
  return `GET /enterprises/${encodeURIComponent(enterprise)}/settings/billing/cost-centers`;
}

export type Capability = 'metrics' | 'seats' | 'spend' | 'costCentres';

export type CapabilityMap = Record<Capability, boolean>;

/**
 * Call each endpoint family once. A 401/403/404 marks it unavailable; other
 * errors (e.g. a suppressed day) still count as available, because the token
 * reached the endpoint.
 */
export async function probeAccess(
  api: CopilotApi,
  scope: CopilotScope,
  probeDay: string
): Promise<CapabilityMap> {
  const check = async (route: string, params: Record<string, unknown>) => {
    try {
      await api.request(route, params);
      return true;
    } catch (error) {
      const status = statusOf(error);
      return !(status === 401 || status === 403 || status === 404);
    }
  };
  const dayParams = {
    year: Number(probeDay.slice(0, 4)),
    month: Number(probeDay.slice(5, 7)),
    day: Number(probeDay.slice(8, 10)),
  };
  const [metrics, seats, aiCredit, premium, costCentres] = await Promise.all([
    check(reportPath(scope, 'scope-1-day'), { day: probeDay }),
    check(seatsPath(scope), { per_page: 1 }),
    check(billingUsagePath(scope, 'ai_credit'), dayParams),
    check(billingUsagePath(scope, 'premium_request'), dayParams),
    scope.kind === 'enterprise'
      ? check(costCentresPath(scope.enterprise), {})
      : Promise.resolve(false),
  ]);
  return { metrics, seats, spend: aiCredit || premium, costCentres };
}
