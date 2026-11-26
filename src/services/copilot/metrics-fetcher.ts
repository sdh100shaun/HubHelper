/**
 * Fetches Copilot usage metrics reports.
 *
 * Report endpoints return short-lived signed download links rather than the
 * data. Links are downloaded immediately and never stored.
 *
 * @module services/copilot/metrics-fetcher
 */

import type { CopilotScope, RawRecord, ReportKind, SyncDayStatus } from '../../types/copilot.js';
import { parseRecords, ReportLinksSchema } from '../../types/copilot.js';
import { type CopilotApi, statusOf } from './api.js';
import { reportPath } from './scope.js';

export interface ReportFetchResult {
  status: SyncDayStatus;
  records: RawRecord[];
  invalidRows: number;
  error?: string;
}

/** Message safe to store and show: no URLs (signed links carry credentials). */
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/https?:\/\/\S+/g, '<url>').slice(0, 300);
}

export class CopilotMetricsFetcher {
  constructor(private readonly api: CopilotApi) {}

  /**
   * Fetch one report for one day.
   *
   * - No report or no links (fewer than five licensed users that day): `suppressed`.
   * - 404 (day outside the retention window or not yet generated): `unavailable`.
   * - 401/403: thrown, because every other day will fail the same way.
   */
  async fetchDay(scope: CopilotScope, kind: ReportKind, day: string): Promise<ReportFetchResult> {
    let links: string[];
    try {
      const response = await this.api.request(reportPath(scope, kind), { day });
      if (response.status === 204) {
        return { status: 'suppressed', records: [], invalidRows: 0 };
      }
      const parsed = ReportLinksSchema.safeParse(response.data);
      links = parsed.success ? parsed.data.download_links : [];
    } catch (error) {
      const status = statusOf(error);
      if (status === 401 || status === 403) throw error;
      if (status === 404) return { status: 'unavailable', records: [], invalidRows: 0 };
      if (status === 204 || status === 422) {
        return { status: 'suppressed', records: [], invalidRows: 0 };
      }
      return { status: 'error', records: [], invalidRows: 0, error: safeMessage(error) };
    }

    if (links.length === 0) return { status: 'suppressed', records: [], invalidRows: 0 };

    const records: RawRecord[] = [];
    let invalidRows = 0;
    try {
      for (const link of links) {
        const body = await this.api.download(link);
        const parsed = parseRecords(body);
        records.push(...parsed.records);
        invalidRows += parsed.invalid;
      }
    } catch (error) {
      return { status: 'error', records: [], invalidRows, error: safeMessage(error) };
    }
    return { status: 'ok', records, invalidRows };
  }
}
