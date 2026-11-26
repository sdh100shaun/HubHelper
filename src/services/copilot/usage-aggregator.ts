/**
 * CopilotUsageAggregator — builds a `CopilotUsageModel` for one scope and
 * date range from the SQLite store. All SQL is parameterised.
 *
 * Organisation- and enterprise-wide figures come from per-user rows of the
 * scope's own report, never from adding up other scopes' reports. Team
 * figures count a user once per team, so they are never summed back up.
 *
 * @module services/copilot/usage-aggregator
 */

import type { SQLInputValue } from 'node:sqlite';
import type { CopilotOrgSettings, CopilotScope, FeatureCategory } from '../../types/copilot.js';
import { classifyFeature } from '../../types/copilot.js';
import { type DateRange, dayRange, daysBetween, monthRange } from './dates.js';
import type {
  AgentPrSummary,
  Anomaly,
  BreakdownDimension,
  BreakdownEntry,
  CopilotUsageModel,
  DailyPoint,
  OrgSummary,
  SeatSummary,
  SpendSummary,
  TeamSummary,
  UserSummary,
} from './model.js';
import type { CopilotStore } from './store/copilot-store.js';

export const INTERACTION_METRICS = ['user_initiated_interaction_count', 'interaction_count'];
export const CODE_GEN_METRICS = ['code_generation_activity_count', 'code_generation_count'];
export const CODE_ACCEPT_METRICS = ['code_acceptance_activity_count', 'code_acceptance_count'];
/**
 * Metrics that count as "using a feature": chat-style features report
 * interactions, completions report code generations.
 */
export const ACTIVITY_METRICS = [...INTERACTION_METRICS, ...CODE_GEN_METRICS];

/**
 * Where each breakdown is read from, in order of preference. Only the first
 * dimension present is used, so a language is never counted twice.
 */
export const BREAKDOWN_SOURCES: Record<
  BreakdownDimension,
  Array<{ dimension: string; field: 'key' | 'sub_key' }>
> = {
  ide: [{ dimension: 'ide', field: 'key' }],
  feature: [
    { dimension: 'feature', field: 'key' },
    { dimension: 'model_feature', field: 'sub_key' },
    { dimension: 'language_feature', field: 'sub_key' },
  ],
  language: [
    { dimension: 'language_feature', field: 'key' },
    { dimension: 'language_model', field: 'key' },
    { dimension: 'language', field: 'key' },
  ],
  model: [
    { dimension: 'model_feature', field: 'key' },
    { dimension: 'model', field: 'key' },
    { dimension: 'language_model', field: 'sub_key' },
  ],
  client: [{ dimension: 'client', field: 'key' }],
};

export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Flag points more than `threshold` standard deviations from the mean. */
export function detectAnomalies(
  series: Array<{ day: string; value: number }>,
  metric: string,
  threshold = 2.5
): Anomaly[] {
  if (series.length < 7) return [];
  const mean = series.reduce((a, p) => a + p.value, 0) / series.length;
  const variance = series.reduce((a, p) => a + (p.value - mean) ** 2, 0) / series.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return [];
  return series
    .map((p) => ({ day: p.day, metric, value: p.value, mean, zScore: (p.value - mean) / sd }))
    .filter((a) => Math.abs(a.zScore) >= threshold);
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

export class CopilotUsageAggregator {
  constructor(
    private readonly store: CopilotStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  private all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.store.db.prepare(sql).all(...params) as T[];
  }

  private get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.store.db.prepare(sql).get(...params) as T | undefined;
  }

  build(scope: CopilotScope, range: DateRange): CopilotUsageModel {
    const scopeId = this.store.getScopeId(scope);
    if (scopeId === undefined) {
      throw new Error('No Copilot data stored for this scope. Run `hubhelper copilot sync` first.');
    }
    const seats = this.seats(scopeId, range);
    const seatOrgs = new Map<number, string[]>();
    for (const seat of seats.all) {
      const list = seatOrgs.get(seat.userId) ?? [];
      if (seat.org) list.push(seat.org);
      seatOrgs.set(seat.userId, list);
    }
    const daily = this.daily(scopeId, range);
    const users = this.users(scopeId, range, seats.all, seatOrgs);
    const activeUsers = users.filter((u) => u.activeDays > 0);
    const totals = users.reduce(
      (acc, u) => {
        acc.interactions += u.interactions;
        acc.codeGen += u.codeGen;
        acc.codeAccept += u.codeAccept;
        acc.aiCreditsUsed += u.aiCreditsUsed;
        return acc;
      },
      { interactions: 0, codeGen: 0, codeAccept: 0, aiCreditsUsed: 0 }
    );
    const okDays = daily.filter((d) => d.status === 'ok');
    const engaged = users.filter((u) => u.chatTurns > 0 || u.agentTurns > 0).length;
    const locAccepted = daily.reduce((a, d) => a + d.locAccepted, 0);
    const seatCount = seats.total;

    const cohorts: CopilotUsageModel['cohorts'] = { power: 0, regular: 0, casual: 0, dormant: 0 };
    for (const u of users) cohorts[u.cohort]++;

    return {
      scope,
      range,
      generatedAt: this.now().toISOString(),
      kpis: {
        seats: seatCount,
        activeUsers: activeUsers.length,
        engagedUsers: engaged,
        activeRate: ratio(activeUsers.length, seatCount),
        averageDailyActiveUsers:
          okDays.length > 0 ? okDays.reduce((a, d) => a + d.activeUsers, 0) / okDays.length : 0,
        interactions: totals.interactions,
        codeGen: totals.codeGen,
        codeAccept: totals.codeAccept,
        acceptanceRate: ratio(totals.codeAccept, totals.codeGen),
        locAccepted,
        aiCreditsUsed: totals.aiCreditsUsed,
        creditsPerActiveUser: ratio(totals.aiCreditsUsed, activeUsers.length),
      },
      daily,
      featureMix: this.featureMix(scopeId, range),
      breakdowns: {
        ide: this.breakdown(scopeId, range, 'ide'),
        feature: this.breakdown(scopeId, range, 'feature'),
        language: this.breakdown(scopeId, range, 'language'),
        model: this.breakdown(scopeId, range, 'model'),
        client: this.breakdown(scopeId, range, 'client'),
      },
      cohorts,
      users,
      teams: this.teams(scopeId, range),
      orgs: this.orgs(scope, users, seats.all),
      seats,
      settings: this.settings(scopeId, range),
      spend: this.spend(scopeId, range, users, seats.all),
      agentPrs: this.agentPrs(scopeId, range),
      anomalies: [
        ...detectAnomalies(
          okDays.map((d) => ({ day: d.day, value: d.interactions })),
          'interactions'
        ),
        ...detectAnomalies(
          okDays.map((d) => ({ day: d.day, value: d.activeUsers })),
          'active users'
        ),
        ...detectAnomalies(
          okDays.map((d) => ({ day: d.day, value: d.agentTurns })),
          'agent turns'
        ),
      ].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)),
      dataQuality: {
        suppressedDays: daily.filter((d) => d.status === 'suppressed').map((d) => d.day),
        missingDays: daily
          .filter((d) => d.status === 'missing' || d.status === 'unavailable')
          .map((d) => d.day),
        flaggedDays: daily.filter((d) => d.flags.length > 0).map((d) => d.day),
      },
    };
  }

  // ── Daily series ──────────────────────────────────────────────────────────

  private daily(scopeId: number, range: DateRange): DailyPoint[] {
    const statuses = this.store.dayStatuses(scopeId, 'users-1-day', range.from, range.to);
    const rows = new Map(
      this.all<{
        day: string;
        active_users: number;
        engaged_users: number;
        interactions: number;
        code_gen: number;
        code_accept: number;
        loc_accepted: number;
        chat_turns: number;
        agent_turns: number;
        ai_credits_used: number;
        flagged: number;
      }>(
        `SELECT day,
                SUM(CASE WHEN interactions > 0 OR code_gen > 0 THEN 1 ELSE 0 END) AS active_users,
                SUM(CASE WHEN chat_turns > 0 OR agent_turns > 0 THEN 1 ELSE 0 END) AS engaged_users,
                SUM(interactions) AS interactions, SUM(code_gen) AS code_gen,
                SUM(code_accept) AS code_accept, SUM(loc_accepted) AS loc_accepted,
                SUM(chat_turns) AS chat_turns, SUM(agent_turns) AS agent_turns,
                SUM(ai_credits_used) AS ai_credits_used,
                SUM(CASE WHEN flags_json <> '[]' THEN 1 ELSE 0 END) AS flagged
         FROM user_day_metrics WHERE scope_id = ? AND day BETWEEN ? AND ?
         GROUP BY day`,
        scopeId,
        range.from,
        range.to
      ).map((r) => [r.day, r])
    );
    const scopeFlags = new Map(
      this.all<{ day: string; flags_json: string }>(
        'SELECT day, flags_json FROM scope_day_flags WHERE scope_id = ? AND day BETWEEN ? AND ?',
        scopeId,
        range.from,
        range.to
      ).map((r) => [r.day, JSON.parse(r.flags_json) as string[]])
    );
    return dayRange(range.from, range.to).map((day) => {
      const r = rows.get(day);
      const flags = [...(scopeFlags.get(day) ?? [])];
      if (r && r.flagged > 0) flags.push(`user-level flags on ${r.flagged} row(s)`);
      return {
        day,
        status: statuses.get(day) ?? 'missing',
        activeUsers: r?.active_users ?? 0,
        engagedUsers: r?.engaged_users ?? 0,
        interactions: r?.interactions ?? 0,
        codeGen: r?.code_gen ?? 0,
        codeAccept: r?.code_accept ?? 0,
        locAccepted: r?.loc_accepted ?? 0,
        chatTurns: r?.chat_turns ?? 0,
        agentTurns: r?.agent_turns ?? 0,
        aiCreditsUsed: r?.ai_credits_used ?? 0,
        flags,
      };
    });
  }

  private featureMix(scopeId: number, range: DateRange): CopilotUsageModel['featureMix'] {
    const rows = this.all<{ day: string; key: string; value: number }>(
      `SELECT day, key, SUM(value) AS value FROM user_day_breakdown
       WHERE scope_id = ? AND day BETWEEN ? AND ? AND dimension = 'feature'
         AND metric IN (${placeholders(ACTIVITY_METRICS)})
       GROUP BY day, key`,
      scopeId,
      range.from,
      range.to,
      ...ACTIVITY_METRICS
    );
    const byDay = new Map<string, Partial<Record<FeatureCategory, number>>>();
    for (const r of rows) {
      const entry = byDay.get(r.day) ?? {};
      const category = classifyFeature(r.key);
      entry[category] = (entry[category] ?? 0) + r.value;
      byDay.set(r.day, entry);
    }
    return dayRange(range.from, range.to).map((day) => ({ day, ...(byDay.get(day) ?? {}) }));
  }

  // ── Breakdowns ────────────────────────────────────────────────────────────

  /** Pick the first stored dimension that exists for this breakdown. */
  private resolveSource(
    scopeId: number,
    range: DateRange,
    which: BreakdownDimension,
    userId?: number
  ): { dimension: string; field: 'key' | 'sub_key' } | undefined {
    for (const source of BREAKDOWN_SOURCES[which]) {
      const found = this.get<{ n: number }>(
        `SELECT 1 AS n FROM user_day_breakdown
         WHERE scope_id = ? AND dimension = ? AND day BETWEEN ? AND ?
         ${userId === undefined ? '' : 'AND user_id = ?'} LIMIT 1`,
        scopeId,
        source.dimension,
        range.from,
        range.to,
        ...(userId === undefined ? [] : [userId])
      );
      if (found) return source;
    }
    return undefined;
  }

  /** Breakdown for the whole scope, or for one user when `userId` is given. */
  breakdown(
    scopeId: number,
    range: DateRange,
    which: BreakdownDimension,
    userId?: number
  ): BreakdownEntry[] {
    const source = this.resolveSource(scopeId, range, which, userId);
    if (!source) return [];
    const metricList = [...INTERACTION_METRICS, ...CODE_GEN_METRICS, ...CODE_ACCEPT_METRICS];
    // `field` is chosen from a fixed list above, never from user input.
    const keyColumn = source.field === 'key' ? 'key' : 'sub_key';
    const rows = this.all<{ k: string; metric: string; value: number; users: number }>(
      `SELECT ${keyColumn} AS k, metric, SUM(value) AS value,
              COUNT(DISTINCT CASE WHEN value > 0 THEN user_id END) AS users
       FROM user_day_breakdown
       WHERE scope_id = ? AND dimension = ? AND day BETWEEN ? AND ?
         AND metric IN (${placeholders(metricList)})
         ${userId === undefined ? '' : 'AND user_id = ?'}
       GROUP BY k, metric`,
      scopeId,
      source.dimension,
      range.from,
      range.to,
      ...metricList,
      ...(userId === undefined ? [] : [userId])
    );
    const entries = new Map<string, BreakdownEntry>();
    for (const r of rows) {
      if (!r.k) continue;
      const e = entries.get(r.k) ?? {
        key: r.k,
        interactions: 0,
        codeGen: 0,
        codeAccept: 0,
        acceptanceRate: null,
        users: 0,
      };
      if (INTERACTION_METRICS.includes(r.metric)) e.interactions += r.value;
      if (CODE_GEN_METRICS.includes(r.metric)) e.codeGen += r.value;
      if (CODE_ACCEPT_METRICS.includes(r.metric)) e.codeAccept += r.value;
      e.users = Math.max(e.users, r.users);
      entries.set(r.k, e);
    }
    return [...entries.values()]
      .map((e) => ({ ...e, acceptanceRate: ratio(e.codeAccept, e.codeGen) }))
      .sort((a, b) => b.interactions + b.codeGen - (a.interactions + a.codeGen));
  }

  // ── Users and cohorts ─────────────────────────────────────────────────────

  private users(
    scopeId: number,
    range: DateRange,
    seats: SeatSummary[],
    seatOrgs: Map<number, string[]>
  ): UserSummary[] {
    const rows = this.all<{
      user_id: number;
      login: string;
      active_days: number;
      interactions: number;
      code_gen: number;
      code_accept: number;
      chat_turns: number;
      agent_turns: number;
      ai_credits_used: number;
      last_active: string | null;
      orgs: string | null;
    }>(
      `SELECT m.user_id, u.login,
              SUM(CASE WHEN m.interactions > 0 OR m.code_gen > 0 THEN 1 ELSE 0 END) AS active_days,
              SUM(m.interactions) AS interactions, SUM(m.code_gen) AS code_gen,
              SUM(m.code_accept) AS code_accept, SUM(m.chat_turns) AS chat_turns,
              SUM(m.agent_turns) AS agent_turns, SUM(m.ai_credits_used) AS ai_credits_used,
              MAX(CASE WHEN m.interactions > 0 OR m.code_gen > 0 THEN m.day END) AS last_active,
              GROUP_CONCAT(DISTINCT m.org_login) AS orgs
       FROM user_day_metrics m JOIN users u ON u.id = m.user_id
       WHERE m.scope_id = ? AND m.day BETWEEN ? AND ?
       GROUP BY m.user_id`,
      scopeId,
      range.from,
      range.to
    );
    const teams = new Map<number, string[]>();
    for (const t of this.all<{ user_id: number; slug: string }>(
      `SELECT DISTINCT t.user_id, tm.slug FROM user_team_day t
       JOIN teams tm ON tm.scope_id = t.scope_id AND tm.id = t.team_id
       WHERE t.scope_id = ? AND t.day BETWEEN ? AND ?`,
      scopeId,
      range.from,
      range.to
    )) {
      teams.set(t.user_id, [...(teams.get(t.user_id) ?? []), t.slug]);
    }

    const summaries = new Map<number, UserSummary>();
    for (const r of rows) {
      const orgs = new Set([
        ...(r.orgs ? r.orgs.split(',') : []),
        ...(seatOrgs.get(r.user_id) ?? []),
      ]);
      summaries.set(r.user_id, {
        userId: r.user_id,
        login: r.login,
        orgs: [...orgs].filter(Boolean).sort(),
        teams: (teams.get(r.user_id) ?? []).sort(),
        activeDays: r.active_days,
        interactions: r.interactions,
        codeGen: r.code_gen,
        codeAccept: r.code_accept,
        acceptanceRate: ratio(r.code_accept, r.code_gen),
        chatTurns: r.chat_turns,
        agentTurns: r.agent_turns,
        aiCreditsUsed: r.ai_credits_used,
        lastActiveDay: r.last_active,
        cohort: 'regular',
      });
    }
    // Seat holders with no report rows at all are dormant.
    for (const seat of seats) {
      if (summaries.has(seat.userId)) continue;
      summaries.set(seat.userId, {
        userId: seat.userId,
        login: seat.login,
        orgs: seatOrgs.get(seat.userId) ?? [],
        teams: (teams.get(seat.userId) ?? []).sort(),
        activeDays: 0,
        interactions: 0,
        codeGen: 0,
        codeAccept: 0,
        acceptanceRate: null,
        chatTurns: 0,
        agentTurns: 0,
        aiCreditsUsed: 0,
        lastActiveDay: null,
        cohort: 'dormant',
      });
    }

    const list = [...summaries.values()];
    assignCohorts(list, daysBetween(range.from, range.to) + 1);
    return list.sort((a, b) => b.interactions + b.codeGen - (a.interactions + a.codeGen));
  }

  // ── Teams and orgs ────────────────────────────────────────────────────────

  private teams(scopeId: number, range: DateRange): TeamSummary[] {
    return this.all<{
      team_id: number;
      slug: string | null;
      members: number;
      active_users: number;
      interactions: number;
      code_gen: number;
      code_accept: number;
      ai_credits_used: number;
    }>(
      `SELECT t.team_id, tm.slug,
              COUNT(DISTINCT t.user_id) AS members,
              COUNT(DISTINCT CASE WHEN m.interactions > 0 OR m.code_gen > 0 THEN m.user_id END)
                AS active_users,
              COALESCE(SUM(m.interactions), 0) AS interactions,
              COALESCE(SUM(m.code_gen), 0) AS code_gen,
              COALESCE(SUM(m.code_accept), 0) AS code_accept,
              COALESCE(SUM(m.ai_credits_used), 0) AS ai_credits_used
       FROM user_team_day t
       LEFT JOIN user_day_metrics m
         ON m.scope_id = t.scope_id AND m.day = t.day AND m.user_id = t.user_id
       LEFT JOIN teams tm ON tm.scope_id = t.scope_id AND tm.id = t.team_id
       WHERE t.scope_id = ? AND t.day BETWEEN ? AND ?
       GROUP BY t.team_id ORDER BY interactions DESC`,
      scopeId,
      range.from,
      range.to
    ).map((r) => ({
      teamId: r.team_id,
      slug: r.slug ?? String(r.team_id),
      members: r.members,
      activeUsers: r.active_users,
      interactions: r.interactions,
      acceptanceRate: ratio(r.code_accept, r.code_gen),
      aiCreditsUsed: r.ai_credits_used,
    }));
  }

  private orgs(scope: CopilotScope, users: UserSummary[], seats: SeatSummary[]): OrgSummary[] {
    const orgNames = new Set<string>([
      ...seats.map((s) => s.org).filter(Boolean),
      ...users.flatMap((u) => u.orgs),
    ]);
    if (scope.kind === 'org') orgNames.add(scope.org);
    return [...orgNames]
      .sort()
      .map((org) => {
        const members = users.filter((u) => u.orgs.includes(org));
        const active = members.filter((u) => u.activeDays > 0);
        const seatCount = seats.filter((s) => s.org === org).length;
        const sum = (f: (u: UserSummary) => number) => members.reduce((a, u) => a + f(u), 0);
        const credits = sum((u) => u.aiCreditsUsed);
        return {
          org,
          seats: seatCount,
          activeUsers: active.length,
          activeRate: ratio(active.length, seatCount),
          interactions: sum((u) => u.interactions),
          acceptanceRate: ratio(
            sum((u) => u.codeAccept),
            sum((u) => u.codeGen)
          ),
          aiCreditsUsed: credits,
          creditsPerActiveUser: ratio(credits, active.length),
        };
      })
      .sort((a, b) => (b.activeRate ?? -1) - (a.activeRate ?? -1));
  }

  // ── Seats ─────────────────────────────────────────────────────────────────

  private seats(scopeId: number, range: DateRange, inactiveDays = 30): CopilotUsageModel['seats'] {
    const snapshot =
      this.get<{ day: string | null }>(
        'SELECT MAX(day) AS day FROM seat_day WHERE scope_id = ? AND day <= ?',
        scopeId,
        range.to
      )?.day ??
      this.get<{ day: string | null }>(
        'SELECT MIN(day) AS day FROM seat_day WHERE scope_id = ?',
        scopeId
      )?.day ??
      null;
    if (!snapshot) {
      return {
        total: 0,
        idle: [],
        all: [],
        directAssignedPct: null,
        multiOrgUsers: [],
        snapshotDay: null,
      };
    }
    const all = this.all<{
      user_id: number;
      login: string;
      org_login: string;
      assigning_team_slug: string | null;
      plan_type: string | null;
      last_activity_at: string | null;
      last_activity_editor: string | null;
      pending_cancellation_date: string | null;
      created_at: string | null;
    }>(
      `SELECT s.user_id, u.login, s.org_login, s.assigning_team_slug, s.plan_type,
              s.last_activity_at, s.last_activity_editor, s.pending_cancellation_date, s.created_at
       FROM seat_day s JOIN users u ON u.id = s.user_id
       WHERE s.scope_id = ? AND s.day = ? ORDER BY u.login`,
      scopeId,
      snapshot
    ).map(
      (r): SeatSummary => ({
        userId: r.user_id,
        login: r.login,
        org: r.org_login,
        assigningTeam: r.assigning_team_slug,
        planType: r.plan_type,
        lastActivityAt: r.last_activity_at,
        lastActivityEditor: r.last_activity_editor,
        idleDays: idleDaysFor(r.last_activity_at ?? r.created_at, snapshot),
        pendingCancellation: r.pending_cancellation_date,
      })
    );
    const byUser = new Map<string, Set<string>>();
    for (const s of all) {
      if (!s.org) continue;
      byUser.set(s.login, (byUser.get(s.login) ?? new Set()).add(s.org));
    }
    const direct = all.filter((s) => !s.assigningTeam).length;
    return {
      total: all.length,
      idle: all.filter((s) => s.idleDays === null || s.idleDays > inactiveDays),
      all,
      directAssignedPct: ratio(direct, all.length),
      multiOrgUsers: [...byUser.entries()]
        .filter(([, orgs]) => orgs.size > 1)
        .map(([login, orgs]) => ({ login, orgs: [...orgs].sort() })),
      snapshotDay: snapshot,
    };
  }

  private settings(scopeId: number, range: DateRange): CopilotOrgSettings[] {
    return this.all<{ settings_json: string }>(
      `SELECT s.settings_json FROM org_settings_day s
       WHERE s.scope_id = ? AND s.day = (
         SELECT COALESCE(
           (SELECT MAX(day) FROM org_settings_day WHERE scope_id = s.scope_id
              AND org_login = s.org_login AND day <= ?),
           (SELECT MIN(day) FROM org_settings_day WHERE scope_id = s.scope_id
              AND org_login = s.org_login)))
       ORDER BY s.org_login`,
      scopeId,
      range.to
    ).map((r) => JSON.parse(r.settings_json) as CopilotOrgSettings);
  }

  // ── Spend ─────────────────────────────────────────────────────────────────

  private spend(
    scopeId: number,
    range: DateRange,
    users: UserSummary[],
    seats: SeatSummary[]
  ): SpendSummary {
    const unit =
      this.get<{ unit: string }>(
        'SELECT unit FROM spend_day WHERE scope_id = ? ORDER BY day DESC LIMIT 1',
        scopeId
      )?.unit ?? 'ai credits';
    const byModel = this.all<{ model: string; quantity: number; net_amount: number }>(
      `SELECT model, SUM(quantity) AS quantity, SUM(net_amount) AS net_amount FROM spend_day
       WHERE scope_id = ? AND day BETWEEN ? AND ? GROUP BY model ORDER BY net_amount DESC`,
      scopeId,
      range.from,
      range.to
    ).map((r) => ({ model: r.model, quantity: r.quantity, netAmount: r.net_amount }));
    const byDay = this.all<{ day: string; quantity: number; net_amount: number }>(
      `SELECT day, SUM(quantity) AS quantity, SUM(net_amount) AS net_amount FROM spend_day
       WHERE scope_id = ? AND day BETWEEN ? AND ? GROUP BY day ORDER BY day`,
      scopeId,
      range.from,
      range.to
    ).map((r) => ({ day: r.day, quantity: r.quantity, netAmount: r.net_amount }));

    const month = range.to.slice(0, 7);
    const { from: monthStart, to: monthEnd } = monthRange(month);
    const mtd = this.get<{ quantity: number | null; net_amount: number | null }>(
      `SELECT SUM(quantity) AS quantity, SUM(net_amount) AS net_amount FROM spend_day
       WHERE scope_id = ? AND day BETWEEN ? AND ?`,
      scopeId,
      monthStart,
      range.to
    );
    const elapsed = daysBetween(monthStart, range.to) + 1;
    const daysInMonth = daysBetween(monthStart, monthEnd) + 1;
    const mtdNet = mtd?.net_amount ?? 0;

    // Cost-centre attribution: a user's own membership wins, else their seat org's.
    const centres = this.all<{ id: string; name: string }>(
      'SELECT id, name FROM cost_centres WHERE scope_id = ?',
      scopeId
    );
    const members = this.all<{ cost_centre_id: string; member_type: string; member_ref: string }>(
      'SELECT cost_centre_id, member_type, member_ref FROM cost_centre_members WHERE scope_id = ?',
      scopeId
    );
    const userCentre = new Map<string, string>();
    const orgCentre = new Map<string, string>();
    for (const m of members) {
      const target = m.member_type === 'user' ? userCentre : orgCentre;
      target.set(m.member_ref.toLowerCase(), m.cost_centre_id);
    }
    const seatOrg = new Map(seats.map((s) => [s.login.toLowerCase(), s.org.toLowerCase()]));
    const centreCredits = new Map<string, number>();
    let unallocated = 0;
    for (const u of users) {
      if (u.aiCreditsUsed === 0) continue;
      const login = u.login.toLowerCase();
      const org = seatOrg.get(login) ?? u.orgs[0]?.toLowerCase();
      const centre = userCentre.get(login) ?? (org ? orgCentre.get(org) : undefined);
      if (centre) centreCredits.set(centre, (centreCredits.get(centre) ?? 0) + u.aiCreditsUsed);
      else unallocated += u.aiCreditsUsed;
    }
    const orgCredits = new Map<string, number>();
    for (const u of users) {
      const org = seatOrg.get(u.login.toLowerCase()) ?? u.orgs[0] ?? '';
      if (org) orgCredits.set(org, (orgCredits.get(org) ?? 0) + u.aiCreditsUsed);
    }

    return {
      unit,
      total: byModel.reduce((a, m) => a + m.quantity, 0),
      netAmount: byModel.reduce((a, m) => a + m.netAmount, 0),
      byModel,
      byDay,
      byUser: users
        .filter((u) => u.aiCreditsUsed > 0)
        .map((u) => ({ login: u.login, aiCreditsUsed: u.aiCreditsUsed }))
        .sort((a, b) => b.aiCreditsUsed - a.aiCreditsUsed),
      byOrg: [...orgCredits.entries()]
        .map(([org, aiCreditsUsed]) => ({ org, aiCreditsUsed }))
        .sort((a, b) => b.aiCreditsUsed - a.aiCreditsUsed),
      byCostCentre: centres
        .map((c) => ({ id: c.id, name: c.name, aiCreditsUsed: centreCredits.get(c.id) ?? 0 }))
        .sort((a, b) => b.aiCreditsUsed - a.aiCreditsUsed),
      unallocatedCredits: centres.length > 0 ? unallocated : 0,
      monthToDate: {
        month,
        netAmount: mtdNet,
        quantity: mtd?.quantity ?? 0,
        forecastNetAmount: elapsed > 0 ? (mtdNet / elapsed) * daysInMonth : 0,
      },
    };
  }

  // ── Coding agent PRs ──────────────────────────────────────────────────────

  private agentPrs(scopeId: number, range: DateRange): AgentPrSummary {
    const rows = this.all<{
      repo: string;
      number: number;
      url: string;
      title: string;
      requested_by: string | null;
      opened_at: string;
      merged_at: string | null;
      human_approved: number;
    }>(
      `SELECT repo, number, url, title, requested_by, opened_at, merged_at, human_approved
       FROM agent_prs WHERE scope_id = ? AND substr(opened_at, 1, 10) BETWEEN ? AND ?`,
      scopeId,
      range.from,
      range.to
    );
    const merged = rows.filter((r) => r.merged_at);
    return {
      opened: rows.length,
      merged: merged.length,
      mergedWithoutHumanApproval: merged
        .filter((r) => r.human_approved === 0)
        .map((r) => ({
          repo: r.repo,
          number: r.number,
          url: r.url,
          title: r.title,
          requestedBy: r.requested_by,
          mergedAt: r.merged_at as string,
        })),
      medianHoursToMerge: median(
        merged.map((r) => (Date.parse(r.merged_at as string) - Date.parse(r.opened_at)) / 3.6e6)
      ),
    };
  }
}

function idleDaysFor(lastActivity: string | null, snapshotDay: string): number | null {
  if (!lastActivity) return null;
  return Math.max(0, daysBetween(lastActivity.slice(0, 10), snapshotDay));
}

/**
 * Cohorts: dormant (no activity), power (top 10% of active users by
 * activity), casual (active on fewer than 20% of days), regular (the rest).
 */
export function assignCohorts(users: UserSummary[], rangeDays: number): void {
  const active = users
    .filter((u) => u.activeDays > 0)
    .sort((a, b) => b.interactions + b.codeGen - (a.interactions + a.codeGen));
  const powerCount = active.length >= 10 ? Math.ceil(active.length * 0.1) : 0;
  const power = new Set(active.slice(0, powerCount).map((u) => u.userId));
  for (const u of users) {
    if (u.activeDays === 0) u.cohort = 'dormant';
    else if (power.has(u.userId)) u.cohort = 'power';
    else if (u.activeDays < Math.max(1, rangeDays * 0.2)) u.cohort = 'casual';
    else u.cohort = 'regular';
  }
}
