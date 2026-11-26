/**
 * CopilotSyncService — fetches whatever is missing for a scope and date range
 * and writes it to the store.
 *
 * - Daily reports: only days not already `ok` or `suppressed` are fetched.
 * - Seats and org settings: snapshotted once per sync, under today's date,
 *   because the API only shows current state.
 * - Spend: fetched for every day in the range (recent days change as usage
 *   is billed), unless spend is unavailable to the token.
 * - Coding agent PRs: fetched per org for the range.
 *
 * @module services/copilot/sync-service
 */

import type { CopilotScope, ReportKind, SyncDayStatus } from '../../types/copilot.js';
import {
  normaliseScopeDay,
  normaliseUserDay,
  normaliseUserTeam,
  REPORT_KINDS,
} from '../../types/copilot.js';
import { AgentPullRequestFetcher } from './agent-pr-fetcher.js';
import { type CopilotApi, mapWithConcurrency, statusOf } from './api.js';
import { CopilotBillingFetcher } from './billing-fetcher.js';
import { type DateRange, dayRange, toDay } from './dates.js';
import { CopilotMetricsFetcher } from './metrics-fetcher.js';
import { CopilotSeatsFetcher } from './seats-fetcher.js';
import type { CopilotStore } from './store/copilot-store.js';

export interface SyncOptions {
  range: DateRange;
  includeSpend?: boolean;
  includeAgentPrs?: boolean;
  /** Per-user retention in days; older per-user rows are deleted after sync. */
  retentionDays?: number;
  concurrency?: number;
  onProgress?: (message: string) => void;
}

export interface SyncSummary {
  days: Record<ReportKind, Record<SyncDayStatus, number>>;
  seats: number;
  orgsAssessed: string[];
  orgsNotAssessed: string[];
  spendDays: number;
  agentPrs: number;
  warnings: string[];
  retentionRemoved: number;
}

function emptyCounts(): Record<SyncDayStatus, number> {
  return { ok: 0, suppressed: 0, unavailable: 0, error: 0 };
}

export class CopilotSyncService {
  private readonly metrics: CopilotMetricsFetcher;
  private readonly seats: CopilotSeatsFetcher;
  private readonly billing: CopilotBillingFetcher;
  private readonly agentPrs: AgentPullRequestFetcher;

  constructor(
    api: CopilotApi,
    private readonly store: CopilotStore,
    private readonly now: () => Date = () => new Date()
  ) {
    this.metrics = new CopilotMetricsFetcher(api);
    this.seats = new CopilotSeatsFetcher(api);
    this.billing = new CopilotBillingFetcher(api);
    this.agentPrs = new AgentPullRequestFetcher(api);
  }

  async sync(scope: CopilotScope, options: SyncOptions): Promise<SyncSummary> {
    const scopeId = this.store.ensureScope(scope);
    const runId = this.store.startSyncRun(scopeId, this.now());
    const progress = options.onProgress ?? (() => {});
    const summary: SyncSummary = {
      days: {
        'scope-1-day': emptyCounts(),
        'users-1-day': emptyCounts(),
        'user-teams-1-day': emptyCounts(),
      },
      seats: 0,
      orgsAssessed: [],
      orgsNotAssessed: [],
      spendDays: 0,
      agentPrs: 0,
      warnings: [],
      retentionRemoved: 0,
    };

    try {
      const days = dayRange(options.range.from, options.range.to);
      for (const kind of REPORT_KINDS) {
        const missing = this.store.missingDays(scopeId, kind, days);
        if (missing.length > 0) progress(`Fetching ${kind} for ${missing.length} day(s)`);
        try {
          await mapWithConcurrency(missing, options.concurrency ?? 4, async (day) => {
            const status = await this.syncReportDay(scope, scopeId, kind, day);
            summary.days[kind][status]++;
          });
        } catch (error) {
          // 401/403 apply to every day: record once and carry on with other data.
          summary.warnings.push(`${kind} not synced: ${describeError(error)}`);
        }
      }

      await this.syncSeatsAndSettings(scope, scopeId, summary, progress);

      if (options.includeSpend !== false) {
        await this.syncSpend(scope, scopeId, days, summary, progress);
      }

      if (options.includeAgentPrs !== false) {
        await this.syncAgentPrs(scopeId, options.range, summary, progress);
      }

      if (options.retentionDays) {
        summary.retentionRemoved = this.store.applyRetention(
          options.retentionDays,
          toDay(this.now())
        );
      }

      const anyErrors = Object.values(summary.days).some((c) => c.error > 0);
      this.store.finishSyncRun(runId, anyErrors || summary.warnings.length > 0 ? 'partial' : 'ok');
      return summary;
    } catch (error) {
      this.store.finishSyncRun(
        runId,
        'error',
        error instanceof Error ? error.message.slice(0, 300) : 'Unknown error'
      );
      throw error;
    }
  }

  private async syncReportDay(
    scope: CopilotScope,
    scopeId: number,
    kind: ReportKind,
    day: string
  ): Promise<SyncDayStatus> {
    const result = await this.metrics.fetchDay(scope, kind, day);
    if (result.status === 'ok') {
      let rowCount = 0;
      if (kind === 'scope-1-day') {
        const rows = result.records.map((r) => normaliseScopeDay(r, day));
        this.store.ingestScopeDay(scopeId, day, result.records, rows);
        rowCount = rows.length;
      } else if (kind === 'users-1-day') {
        const rows = result.records.map((r) => normaliseUserDay(r, day)).filter((r) => r !== null);
        this.store.ingestUserDays(scopeId, day, result.records, rows);
        rowCount = rows.length;
      } else {
        const rows = result.records.map((r) => normaliseUserTeam(r, day)).filter((r) => r !== null);
        this.store.ingestUserTeams(scopeId, day, result.records, rows);
        rowCount = rows.length;
      }
      this.store.markDay(scopeId, kind, day, 'ok', {
        rowCount,
        invalidRows: result.invalidRows,
      });
    } else {
      this.store.markDay(scopeId, kind, day, result.status, {
        invalidRows: result.invalidRows,
        error: result.error,
      });
    }
    return result.status;
  }

  private async syncSeatsAndSettings(
    scope: CopilotScope,
    scopeId: number,
    summary: SyncSummary,
    progress: (message: string) => void
  ): Promise<void> {
    const today = toDay(this.now());
    try {
      progress('Fetching seats');
      const seats = await this.seats.fetchSeats(scope);
      this.store.ingestSeats(scopeId, today, seats);
      summary.seats = seats.length;
      const orgs = this.seats.memberOrgs(scope, seats);
      progress(`Fetching Copilot settings for ${orgs.length} org(s)`);
      const settings = await this.seats.fetchOrgSettings(orgs);
      this.store.ingestOrgSettings(scopeId, today, settings.settings);
      summary.orgsAssessed = settings.settings.map((s) => s.orgLogin);
      summary.orgsNotAssessed = settings.notAssessed;
    } catch (error) {
      summary.warnings.push(`Seats not synced: ${describeError(error)}`);
    }
  }

  private async syncSpend(
    scope: CopilotScope,
    scopeId: number,
    days: string[],
    summary: SyncSummary,
    progress: (message: string) => void
  ): Promise<void> {
    try {
      progress(`Fetching spend for ${days.length} day(s)`);
      const items = (
        await mapWithConcurrency(days, 4, (day) => this.billing.fetchDay(scope, day))
      ).flat();
      this.store.ingestSpend(scopeId, days, items);
      summary.spendDays = days.length;
      if (scope.kind === 'enterprise') {
        const centres = await this.billing.fetchCostCentres(scope.enterprise);
        this.store.ingestCostCentres(scopeId, centres);
      }
    } catch (error) {
      summary.warnings.push(`Spend not synced: ${describeError(error)}`);
    }
  }

  private async syncAgentPrs(
    scopeId: number,
    range: DateRange,
    summary: SyncSummary,
    progress: (message: string) => void
  ): Promise<void> {
    const orgs = summary.orgsAssessed;
    if (orgs.length === 0) return;
    try {
      progress(`Fetching Copilot coding agent PRs for ${orgs.length} org(s)`);
      for (const org of orgs) {
        const prs = await this.agentPrs.fetch(org, range.from, range.to);
        this.store.ingestAgentPrs(scopeId, prs);
        summary.agentPrs += prs.length;
      }
    } catch (error) {
      summary.warnings.push(`Coding agent PRs not synced: ${describeError(error)}`);
    }
  }
}

function describeError(error: unknown): string {
  const status = statusOf(error);
  if (status === 401 || status === 403) return 'the token lacks permission';
  if (status === 404) return 'not available for this account';
  return error instanceof Error
    ? error.message.replace(/https?:\/\/\S+/g, '<url>').slice(0, 200)
    : 'unknown error';
}
