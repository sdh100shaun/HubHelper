/**
 * CopilotStore — writes and housekeeping for the Copilot Insights database.
 *
 * Every ingest replaces the rows for one scope and day inside a single
 * transaction, so re-syncing a day is idempotent. Read queries used by the
 * aggregator live in `queries.ts`.
 *
 * @module services/copilot/store/copilot-store
 */

import { statSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  AgentPullRequest,
  CopilotOrgSettings,
  CopilotScope,
  CopilotSeat,
  CopilotSpendItem,
  CostCentre,
  NormalisedScopeDay,
  NormalisedUserDay,
  RawRecord,
  ReportKind,
  SyncDayStatus,
  UserTeamDay,
} from '../../../types/copilot.js';
import { scopeSlug } from '../../../types/copilot.js';
import { addDays } from '../dates.js';
import { openDatabase, withTransaction } from './database.js';
import { migrate } from './migrations.js';

/** Convert `undefined` to SQL NULL. */
function v(value: string | number | null | undefined): SQLInputValue {
  return value === undefined ? null : value;
}

export interface StoreStatus {
  path: string;
  schemaVersion: number;
  sizeBytes: number | null;
  scopes: Array<{ kind: string; slug: string; firstDay: string | null; lastDay: string | null }>;
  rowCounts: Record<string, number>;
}

export interface CachedSummary {
  content: string;
  createdAt: string;
}

export class CopilotStore {
  private constructor(
    readonly db: DatabaseSync,
    readonly path: string
  ) {}

  /** Open a store, applying pending migrations unless read-only. */
  static open(path: string, options: { readOnly?: boolean } = {}): CopilotStore {
    const db = openDatabase(path, options);
    if (!options.readOnly) migrate(db);
    return new CopilotStore(db, path);
  }

  close(): void {
    this.db.close();
  }

  // ── Scopes ────────────────────────────────────────────────────────────────

  getScopeId(scope: CopilotScope): number | undefined {
    const row = this.db
      .prepare('SELECT id FROM scopes WHERE kind = ? AND slug = ?')
      .get(scope.kind, scopeSlug(scope)) as { id: number } | undefined;
    return row?.id;
  }

  ensureScope(scope: CopilotScope): number {
    this.db
      .prepare('INSERT OR IGNORE INTO scopes (kind, slug) VALUES (?, ?)')
      .run(scope.kind, scopeSlug(scope));
    return this.getScopeId(scope)!;
  }

  // ── Sync bookkeeping ──────────────────────────────────────────────────────

  startSyncRun(scopeId: number, now: Date = new Date()): number {
    const result = this.db
      .prepare('INSERT INTO sync_runs (scope_id, started_at) VALUES (?, ?)')
      .run(scopeId, now.toISOString());
    return Number(result.lastInsertRowid);
  }

  finishSyncRun(runId: number, status: 'ok' | 'partial' | 'error', error?: string): void {
    this.db
      .prepare('UPDATE sync_runs SET finished_at = ?, status = ?, error = ? WHERE id = ?')
      .run(new Date().toISOString(), status, v(error), runId);
  }

  /** Days in `days` that still need fetching (not `ok` and not `suppressed`). */
  missingDays(scopeId: number, kind: ReportKind, days: string[]): string[] {
    if (days.length === 0) return [];
    const done = new Set(
      (
        this.db
          .prepare(
            `SELECT day FROM sync_days WHERE scope_id = ? AND report_kind = ?
             AND status IN ('ok', 'suppressed') AND day BETWEEN ? AND ?`
          )
          .all(scopeId, kind, days[0], days[days.length - 1]) as Array<{ day: string }>
      ).map((r) => r.day)
    );
    return days.filter((d) => !done.has(d));
  }

  markDay(
    scopeId: number,
    kind: ReportKind,
    day: string,
    status: SyncDayStatus,
    details: { rowCount?: number; invalidRows?: number; error?: string } = {}
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sync_days
         (scope_id, report_kind, day, status, row_count, invalid_rows, error, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        scopeId,
        kind,
        day,
        status,
        details.rowCount ?? 0,
        details.invalidRows ?? 0,
        v(details.error),
        new Date().toISOString()
      );
  }

  dayStatuses(scopeId: number, kind: ReportKind, from: string, to: string): Map<string, string> {
    const rows = this.db
      .prepare(
        'SELECT day, status FROM sync_days WHERE scope_id = ? AND report_kind = ? AND day BETWEEN ? AND ?'
      )
      .all(scopeId, kind, from, to) as Array<{ day: string; status: string }>;
    return new Map(rows.map((r) => [r.day, r.status]));
  }

  // ── Ingest ────────────────────────────────────────────────────────────────

  private saveRaw(scopeId: number, kind: ReportKind, day: string, raw: RawRecord[]): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO raw_reports (scope_id, report_kind, day, payload_json) VALUES (?, ?, ?, ?)'
      )
      .run(scopeId, kind, day, JSON.stringify(raw));
  }

  private upsertUser(id: number, login: string, day: string): void {
    this.db
      .prepare(
        `INSERT INTO users (id, login, first_seen, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           login = CASE WHEN excluded.last_seen >= users.last_seen THEN excluded.login ELSE users.login END,
           first_seen = MIN(users.first_seen, excluded.first_seen),
           last_seen = MAX(users.last_seen, excluded.last_seen)`
      )
      .run(id, login, day, day);
  }

  private upsertOrg(scopeId: number, login: string | undefined): void {
    if (!login) return;
    this.db
      .prepare('INSERT OR IGNORE INTO orgs (scope_id, login) VALUES (?, ?)')
      .run(scopeId, login);
  }

  ingestScopeDay(scopeId: number, day: string, raw: RawRecord[], rows: NormalisedScopeDay[]): void {
    withTransaction(this.db, () => {
      this.saveRaw(scopeId, 'scope-1-day', day, raw);
      for (const table of ['scope_day_metrics', 'scope_day_breakdown', 'scope_day_flags']) {
        this.db.prepare(`DELETE FROM ${table} WHERE scope_id = ? AND day = ?`).run(scopeId, day);
      }
      const metric = this.db.prepare(
        `INSERT INTO scope_day_metrics (scope_id, day, metric, value) VALUES (?, ?, ?, ?)
         ON CONFLICT DO UPDATE SET value = value + excluded.value`
      );
      const breakdown = this.db.prepare(
        `INSERT INTO scope_day_breakdown (scope_id, day, dimension, key, sub_key, metric, value)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET value = value + excluded.value`
      );
      const flags: string[] = [];
      for (const row of rows) {
        for (const [name, value] of Object.entries(row.metrics)) {
          metric.run(scopeId, day, name, value);
        }
        for (const b of row.breakdowns) {
          breakdown.run(scopeId, day, b.dimension, b.key, b.subKey, b.metric, b.value);
        }
        flags.push(...row.flags);
      }
      if (flags.length > 0) {
        this.db
          .prepare('INSERT INTO scope_day_flags (scope_id, day, flags_json) VALUES (?, ?, ?)')
          .run(scopeId, day, JSON.stringify([...new Set(flags)]));
      }
    });
  }

  ingestUserDays(scopeId: number, day: string, raw: RawRecord[], rows: NormalisedUserDay[]): void {
    withTransaction(this.db, () => {
      this.saveRaw(scopeId, 'users-1-day', day, raw);
      this.db
        .prepare('DELETE FROM user_day_metrics WHERE scope_id = ? AND day = ?')
        .run(scopeId, day);
      this.db
        .prepare('DELETE FROM user_day_breakdown WHERE scope_id = ? AND day = ?')
        .run(scopeId, day);
      const metrics = this.db.prepare(
        `INSERT OR REPLACE INTO user_day_metrics
         (scope_id, day, user_id, org_login, interactions, code_gen, code_accept, loc_suggested,
          loc_accepted, chat_turns, agent_turns, ai_credits_used, flags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const breakdown = this.db.prepare(
        `INSERT INTO user_day_breakdown
         (scope_id, day, user_id, dimension, key, sub_key, metric, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET value = value + excluded.value`
      );
      for (const row of rows) {
        this.upsertUser(row.userId, row.login, row.day);
        this.upsertOrg(scopeId, row.orgLogin);
        metrics.run(
          scopeId,
          day,
          row.userId,
          v(row.orgLogin),
          row.interactions,
          row.codeGen,
          row.codeAccept,
          row.locSuggested,
          row.locAccepted,
          row.chatTurns,
          row.agentTurns,
          row.aiCreditsUsed,
          JSON.stringify(row.flags)
        );
        for (const b of row.breakdowns) {
          breakdown.run(scopeId, day, row.userId, b.dimension, b.key, b.subKey, b.metric, b.value);
        }
      }
    });
  }

  ingestUserTeams(scopeId: number, day: string, raw: RawRecord[], rows: UserTeamDay[]): void {
    withTransaction(this.db, () => {
      this.saveRaw(scopeId, 'user-teams-1-day', day, raw);
      this.db.prepare('DELETE FROM user_team_day WHERE scope_id = ? AND day = ?').run(scopeId, day);
      const team = this.db.prepare(
        `INSERT INTO teams (scope_id, id, slug, name) VALUES (?, ?, ?, ?)
         ON CONFLICT DO UPDATE SET slug = excluded.slug, name = excluded.name`
      );
      const member = this.db.prepare(
        'INSERT OR IGNORE INTO user_team_day (scope_id, day, user_id, team_id) VALUES (?, ?, ?, ?)'
      );
      for (const row of rows) {
        team.run(scopeId, row.teamId, row.teamSlug, row.teamName);
        member.run(scopeId, day, row.userId, row.teamId);
      }
    });
  }

  /** Record today's seat assignments. Seats are snapshotted daily to keep history. */
  ingestSeats(scopeId: number, day: string, seats: CopilotSeat[]): void {
    withTransaction(this.db, () => {
      this.db.prepare('DELETE FROM seat_day WHERE scope_id = ? AND day = ?').run(scopeId, day);
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO seat_day
         (scope_id, day, user_id, org_login, assigning_team_slug, plan_type, created_at,
          last_activity_at, last_activity_editor, pending_cancellation_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const seat of seats) {
        this.upsertUser(seat.userId, seat.login, day);
        this.upsertOrg(scopeId, seat.orgLogin);
        insert.run(
          scopeId,
          day,
          seat.userId,
          seat.orgLogin ?? '',
          v(seat.assigningTeamSlug),
          v(seat.planType),
          v(seat.createdAt),
          v(seat.lastActivityAt),
          v(seat.lastActivityEditor),
          v(seat.pendingCancellationDate)
        );
      }
    });
  }

  ingestOrgSettings(scopeId: number, day: string, settings: CopilotOrgSettings[]): void {
    withTransaction(this.db, () => {
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO org_settings_day (scope_id, day, org_login, settings_json)
         VALUES (?, ?, ?, ?)`
      );
      for (const s of settings) {
        this.upsertOrg(scopeId, s.orgLogin);
        insert.run(scopeId, day, s.orgLogin, JSON.stringify(s));
      }
    });
  }

  /** Replace spend rows for the given days. */
  ingestSpend(scopeId: number, days: string[], items: CopilotSpendItem[]): void {
    withTransaction(this.db, () => {
      const del = this.db.prepare('DELETE FROM spend_day WHERE scope_id = ? AND day = ?');
      for (const day of days) del.run(scopeId, day);
      const insert = this.db.prepare(
        `INSERT INTO spend_day
         (scope_id, day, user_login, org_login, cost_centre_id, model, product, unit, quantity,
          gross_amount, discount_amount, net_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const i of items) {
        insert.run(
          scopeId,
          i.day,
          v(i.userLogin),
          v(i.orgLogin),
          v(i.costCentreId),
          i.model,
          i.product,
          i.unit,
          i.quantity,
          i.grossAmount,
          i.discountAmount,
          i.netAmount
        );
      }
    });
  }

  /** Replace the cost-centre list and memberships for a scope. */
  ingestCostCentres(scopeId: number, centres: CostCentre[]): void {
    withTransaction(this.db, () => {
      this.db.prepare('DELETE FROM cost_centre_members WHERE scope_id = ?').run(scopeId);
      this.db.prepare('DELETE FROM cost_centres WHERE scope_id = ?').run(scopeId);
      const centre = this.db.prepare(
        'INSERT INTO cost_centres (scope_id, id, name) VALUES (?, ?, ?)'
      );
      const member = this.db.prepare(
        `INSERT OR IGNORE INTO cost_centre_members (scope_id, cost_centre_id, member_type, member_ref)
         VALUES (?, ?, ?, ?)`
      );
      for (const c of centres) {
        centre.run(scopeId, c.id, c.name);
        for (const u of c.users) member.run(scopeId, c.id, 'user', u);
        for (const o of c.orgs) member.run(scopeId, c.id, 'org', o);
      }
    });
  }

  ingestAgentPrs(scopeId: number, prs: AgentPullRequest[]): void {
    withTransaction(this.db, () => {
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO agent_prs
         (scope_id, repo, number, org_login, title, url, requested_by, opened_at, merged_at,
          human_approved, reviewers_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const pr of prs) {
        insert.run(
          scopeId,
          pr.repo,
          pr.number,
          pr.orgLogin,
          pr.title,
          pr.url,
          v(pr.requestedBy),
          pr.openedAt,
          v(pr.mergedAt),
          pr.humanApproved ? 1 : 0,
          JSON.stringify(pr.reviewers)
        );
      }
    });
  }

  saveFindings(
    scopeId: number,
    findings: Array<{ type: string; severity: string; subject: string; description: string }>,
    now: Date = new Date()
  ): void {
    const insert = this.db.prepare(
      `INSERT INTO findings (scope_id, detected_at, issue_type, severity, subject, description)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    withTransaction(this.db, () => {
      for (const f of findings) {
        insert.run(scopeId, now.toISOString(), f.type, f.severity, f.subject, f.description);
      }
    });
  }

  // ── AI summary cache ──────────────────────────────────────────────────────

  cacheSummary(
    scopeId: number,
    kind: string,
    content: string,
    subjectUserId?: number,
    now: Date = new Date()
  ): void {
    this.db
      .prepare(
        `INSERT INTO ai_summaries (scope_id, subject_user_id, kind, created_at, content)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(scopeId, v(subjectUserId), kind, now.toISOString(), content);
  }

  latestSummary(scopeId: number, kind: string, subjectUserId?: number): CachedSummary | undefined {
    const row = this.db
      .prepare(
        `SELECT content, created_at FROM ai_summaries
         WHERE scope_id = ? AND kind = ? AND subject_user_id IS ?
         ORDER BY id DESC LIMIT 1`
      )
      .get(scopeId, kind, v(subjectUserId)) as { content: string; created_at: string } | undefined;
    return row ? { content: row.content, createdAt: row.created_at } : undefined;
  }

  // ── Housekeeping ──────────────────────────────────────────────────────────

  /**
   * Delete per-user rows older than `perUserDays`. Scope-level aggregates are
   * kept indefinitely. Returns the number of rows removed.
   */
  applyRetention(perUserDays: number, today: string): number {
    const cutoff = addDays(today, -perUserDays);
    let removed = 0;
    withTransaction(this.db, () => {
      for (const table of ['user_day_metrics', 'user_day_breakdown', 'user_team_day', 'seat_day']) {
        removed += Number(
          this.db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(cutoff).changes
        );
      }
      removed += Number(
        this.db
          .prepare(
            "DELETE FROM raw_reports WHERE report_kind IN ('users-1-day', 'user-teams-1-day') AND day < ?"
          )
          .run(cutoff).changes
      );
    });
    return removed;
  }

  findUserId(login: string): number | undefined {
    const row = this.db
      .prepare(
        'SELECT id FROM users WHERE login = ? COLLATE NOCASE ORDER BY last_seen DESC LIMIT 1'
      )
      .get(login) as { id: number } | undefined;
    return row?.id;
  }

  /**
   * Remove one person's data (for data-subject requests). Access-log entries
   * are kept, with the login replaced by a hash, so the record of who viewed
   * the data survives. Raw report payloads are rewritten without the user.
   */
  purgeUser(login: string, loginHash: string): number {
    const userId = this.findUserId(login);
    if (userId === undefined) return 0;
    let removed = 0;
    withTransaction(this.db, () => {
      for (const table of ['user_day_metrics', 'user_day_breakdown', 'user_team_day', 'seat_day']) {
        removed += Number(
          this.db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId).changes
        );
      }
      removed += Number(
        this.db.prepare('DELETE FROM ai_summaries WHERE subject_user_id = ?').run(userId).changes
      );
      removed += Number(
        this.db.prepare('DELETE FROM spend_day WHERE user_login = ? COLLATE NOCASE').run(login)
          .changes
      );
      this.db
        .prepare('UPDATE agent_prs SET requested_by = NULL WHERE requested_by = ? COLLATE NOCASE')
        .run(login);
      this.db
        .prepare(
          'UPDATE access_log SET subject_login = ?, subject_user_id = NULL WHERE subject_user_id = ?'
        )
        .run(loginHash, userId);
      const raws = this.db
        .prepare(
          "SELECT scope_id, report_kind, day, payload_json FROM raw_reports WHERE report_kind IN ('users-1-day', 'user-teams-1-day')"
        )
        .all() as Array<{
        scope_id: number;
        report_kind: string;
        day: string;
        payload_json: string;
      }>;
      const update = this.db.prepare(
        'UPDATE raw_reports SET payload_json = ? WHERE scope_id = ? AND report_kind = ? AND day = ?'
      );
      for (const raw of raws) {
        const records = JSON.parse(raw.payload_json) as RawRecord[];
        const kept = records.filter((r) => r.user_id !== userId);
        if (kept.length !== records.length) {
          update.run(JSON.stringify(kept), raw.scope_id, raw.report_kind, raw.day);
          removed += records.length - kept.length;
        }
      }
      removed += Number(this.db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes);
    });
    return removed;
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }

  status(): StoreStatus {
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version;
    const scopes = this.db
      .prepare(
        `SELECT s.kind, s.slug, MIN(d.day) AS firstDay, MAX(d.day) AS lastDay
         FROM scopes s LEFT JOIN sync_days d ON d.scope_id = s.id AND d.status = 'ok'
         GROUP BY s.id ORDER BY s.kind, s.slug`
      )
      .all() as StoreStatus['scopes'];
    const rowCounts: Record<string, number> = {};
    for (const table of [
      'users',
      'user_day_metrics',
      'user_day_breakdown',
      'seat_day',
      'spend_day',
      'agent_prs',
      'access_batch',
    ]) {
      rowCounts[table] = (
        this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
      ).n;
    }
    let sizeBytes: number | null = null;
    if (this.path !== ':memory:') {
      try {
        sizeBytes = statSync(this.path).size;
      } catch {
        sizeBytes = null;
      }
    }
    return { path: this.path, schemaVersion: version, sizeBytes, scopes, rowCounts };
  }
}
