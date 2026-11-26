/**
 * Fetches Copilot seat assignments and per-organisation Copilot settings.
 *
 * @module services/copilot/seats-fetcher
 */

import type {
  CopilotOrgSettings,
  CopilotScope,
  CopilotSeat,
  RawRecord,
} from '../../types/copilot.js';
import { normaliseOrgSettings, normaliseSeat } from '../../types/copilot.js';
import { type CopilotApi, mapWithConcurrency, statusOf } from './api.js';
import { orgSettingsPath, seatsPath } from './scope.js';

const PER_PAGE = 100;
const MAX_PAGES = 1000;

export interface OrgSettingsResult {
  settings: CopilotOrgSettings[];
  /** Orgs the token could not read; reported as "not assessed". */
  notAssessed: string[];
}

export class CopilotSeatsFetcher {
  constructor(private readonly api: CopilotApi) {}

  /**
   * Fetch every seat. The seats endpoint returns `{ total_seats, seats }`,
   * which Octokit's paginate does not unwrap, so pages are walked here.
   */
  async fetchSeats(scope: CopilotScope): Promise<CopilotSeat[]> {
    const seats: CopilotSeat[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await this.api.request<{ seats?: RawRecord[] }>(seatsPath(scope), {
        per_page: PER_PAGE,
        page,
      });
      const batch = Array.isArray(response.data?.seats) ? response.data.seats : [];
      for (const raw of batch) {
        const seat = normaliseSeat(raw);
        if (!seat) continue;
        if (scope.kind === 'org' && !seat.orgLogin) seat.orgLogin = scope.org;
        if (
          scope.kind === 'enterprise' &&
          scope.orgs &&
          seat.orgLogin &&
          !scope.orgs.includes(seat.orgLogin)
        ) {
          continue;
        }
        seats.push(seat);
      }
      if (batch.length < PER_PAGE) break;
    }
    return seats;
  }

  /** Member orgs to assess: the explicit list, else orgs seen on seats. */
  memberOrgs(scope: CopilotScope, seats: CopilotSeat[]): string[] {
    if (scope.kind === 'org') return [scope.org];
    if (scope.orgs && scope.orgs.length > 0) return [...scope.orgs];
    return [...new Set(seats.map((s) => s.orgLogin).filter((o): o is string => !!o))].sort();
  }

  /** Fetch Copilot settings for each org, with limited concurrency. */
  async fetchOrgSettings(orgs: string[]): Promise<OrgSettingsResult> {
    const notAssessed: string[] = [];
    const results = await mapWithConcurrency(orgs, 4, async (org) => {
      try {
        const response = await this.api.request<RawRecord>(orgSettingsPath(org));
        return normaliseOrgSettings(org, response.data ?? {});
      } catch (error) {
        const status = statusOf(error);
        if (status === 401 || status === 403 || status === 404) {
          notAssessed.push(org);
          return null;
        }
        throw error;
      }
    });
    return {
      settings: results.filter((s): s is CopilotOrgSettings => s !== null),
      notAssessed: notAssessed.sort(),
    };
  }
}
