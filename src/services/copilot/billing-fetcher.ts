/**
 * Fetches Copilot spend: AI credits (usage-based billing) or premium requests
 * (legacy), plus enterprise cost centres.
 *
 * @module services/copilot/billing-fetcher
 */

import type {
  BillingModel,
  CopilotScope,
  CopilotSpendItem,
  CostCentre,
  RawRecord,
} from '../../types/copilot.js';
import { normaliseSpendItem } from '../../types/copilot.js';
import { type CopilotApi, statusOf } from './api.js';
import { billingUsagePath, costCentresPath } from './scope.js';

function routeModel(model: BillingModel): 'ai_credit' | 'premium_request' {
  return model === 'ai-credits' ? 'ai_credit' : 'premium_request';
}

function dayParams(day: string): Record<string, number> {
  return {
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)),
    day: Number(day.slice(8, 10)),
  };
}

export class CopilotBillingFetcher {
  private detected: BillingModel | null = null;

  constructor(
    private readonly api: CopilotApi,
    private readonly override?: BillingModel
  ) {}

  /**
   * Work out which billing model applies. AI credits are tried first; a 404
   * there means the account is still on premium requests.
   */
  async detectBillingModel(scope: CopilotScope, day: string): Promise<BillingModel> {
    if (this.override) return this.override;
    if (this.detected) return this.detected;
    try {
      await this.api.request(billingUsagePath(scope, 'ai_credit'), dayParams(day));
      this.detected = 'ai-credits';
    } catch (error) {
      const status = statusOf(error);
      if (status !== 404 && status !== 410) throw error;
      this.detected = 'premium-requests';
    }
    return this.detected;
  }

  /** Spend for one day, broken down by model and product. */
  async fetchDay(scope: CopilotScope, day: string): Promise<CopilotSpendItem[]> {
    const model = await this.detectBillingModel(scope, day);
    const response = await this.api.request<{ usageItems?: RawRecord[] }>(
      billingUsagePath(scope, routeModel(model)),
      dayParams(day)
    );
    const items = Array.isArray(response.data?.usageItems) ? response.data.usageItems : [];
    const orgLogin = scope.kind === 'org' ? scope.org : undefined;
    return items
      .filter((item) => !item.product || String(item.product).toLowerCase().includes('copilot'))
      .map((item) => normaliseSpendItem(item, { day, orgLogin }));
  }

  /** Enterprise cost centres and their user and organisation members. */
  async fetchCostCentres(enterprise: string): Promise<CostCentre[]> {
    const response = await this.api.request<{ costCenters?: RawRecord[] }>(
      costCentresPath(enterprise),
      { state: 'active' }
    );
    const centres = Array.isArray(response.data?.costCenters) ? response.data.costCenters : [];
    return centres
      .map((c): CostCentre | null => {
        const id = typeof c.id === 'string' ? c.id : undefined;
        if (!id) return null;
        const resources = Array.isArray(c.resources) ? (c.resources as RawRecord[]) : [];
        const names = (type: string) =>
          resources
            .filter((r) => String(r.type).toLowerCase() === type && typeof r.name === 'string')
            .map((r) => r.name as string);
        return {
          id,
          name: typeof c.name === 'string' ? c.name : id,
          users: names('user'),
          orgs: names('org'),
        };
      })
      .filter((c): c is CostCentre => c !== null);
  }
}
