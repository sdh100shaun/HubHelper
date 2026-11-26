/**
 * Builds an individual's Copilot usage profile from the store.
 *
 * Callers must have recorded a reason with `AccessLog` before showing a
 * profile; this module only reads data.
 *
 * @module services/copilot/user-profile
 */

import type { SQLInputValue } from 'node:sqlite';
import type { CopilotScope, FeatureCategory } from '../../types/copilot.js';
import { classifyFeature } from '../../types/copilot.js';
import { type DateRange, dayRange, daysBetween } from './dates.js';
import type {
  BreakdownDimension,
  BreakdownEntry,
  CopilotUsageModel,
  SeatSummary,
  UserSummary,
} from './model.js';
import type { CopilotStore } from './store/copilot-store.js';
import { ACTIVITY_METRICS, CopilotUsageAggregator, median, ratio } from './usage-aggregator.js';

/** Peer groups smaller than this are left out, matching GitHub's own threshold. */
export const MIN_PEER_GROUP = 5;

export interface UserDailyPoint {
  day: string;
  /** Report status for the day: `ok`, `suppressed`, `unavailable`, `error` or `missing`. */
  status: string;
  active: boolean;
  interactions: number;
  codeGen: number;
  codeAccept: number;
  locSuggested: number;
  locAccepted: number;
  chatTurns: number;
  agentTurns: number;
  aiCreditsUsed: number;
  flags: string[];
}

export interface PeerComparison {
  group: string;
  size: number;
  activityPercentile: number;
  acceptancePercentile: number | null;
  spendPercentile: number;
}

export interface SeatEvent {
  day: string;
  org: string;
  event: 'assigned' | 'removed';
}

export interface CopilotUserProfile {
  login: string;
  userId: number;
  scope: CopilotScope;
  range: DateRange;
  seat: {
    current: SeatSummary[];
    /** Only known when the user holds exactly one seat: the API does not report it. */
    billedOrg: string | null;
    costCentres: string[];
    history: SeatEvent[];
  };
  activity: {
    daily: UserDailyPoint[];
    activeDays: number;
    activeDaysPerWeek: number;
    currentStreak: number;
    longestStreak: number;
    firstActiveDay: string | null;
    lastActiveDay: string | null;
    daysSinceLastActive: number | null;
  };
  totals: UserSummary | null;
  teams: string[];
  featureTotals: Partial<Record<FeatureCategory, number>>;
  featureFirstUsed: Partial<Record<FeatureCategory, string>>;
  /** Features at least half of their peers use that this person has not tried. */
  untriedFeatures: FeatureCategory[];
  breakdowns: Record<BreakdownDimension, BreakdownEntry[]>;
  spend: {
    aiCreditsUsed: number;
    shareOfScope: number | null;
    shareOfTeams: Array<{ team: string; share: number | null }>;
  };
  agentPrs: {
    requested: number;
    merged: number;
    mergedWithoutHumanApproval: number;
    reviewed: number;
    medianHoursToMerge: number | null;
  };
  peers: PeerComparison[];
  dataQuality: { flaggedDays: string[]; suppressedDays: string[] };
}

/** Percentile rank (0–100) of `value` within `values`. */
export function percentileRank(values: number[], value: number): number {
  if (values.length === 0) return 0;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return Math.round(((below + equal / 2) / values.length) * 100);
}

/**
 * Consecutive active days. Days without a report (suppressed or missing)
 * neither extend nor break a streak, because there is no data for them.
 */
export function streaks(daily: Array<{ day: string; active: boolean; status?: string }>): {
  current: number;
  longest: number;
} {
  let longest = 0;
  let run = 0;
  for (const point of daily) {
    if (point.status !== undefined && point.status !== 'ok') continue;
    run = point.active ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { current: run, longest };
}

function activity(u: UserSummary): number {
  return u.interactions + u.codeGen;
}

export class CopilotUserProfileBuilder {
  private readonly aggregator: CopilotUsageAggregator;

  constructor(
    private readonly store: CopilotStore,
    aggregator?: CopilotUsageAggregator
  ) {
    this.aggregator = aggregator ?? new CopilotUsageAggregator(store);
  }

  private all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.store.db.prepare(sql).all(...params) as T[];
  }

  /**
   * Build a profile. Pass `model` when it has already been built for the same
   * scope and range, to avoid rebuilding it.
   */
  build(
    scope: CopilotScope,
    login: string,
    range: DateRange,
    model?: CopilotUsageModel
  ): CopilotUserProfile {
    const scopeId = this.store.getScopeId(scope);
    if (scopeId === undefined) {
      throw new Error('No Copilot data stored for this scope. Run `hubhelper copilot sync` first.');
    }
    const userId = this.store.findUserId(login);
    if (userId === undefined) {
      throw new Error(`No Copilot data stored for user ${login}.`);
    }
    const usage = model ?? this.aggregator.build(scope, range);
    const totals = usage.users.find((u) => u.userId === userId) ?? null;
    const canonicalLogin = totals?.login ?? login;
    const daily = this.daily(scopeId, userId, range);
    const active = daily.filter((d) => d.active);
    const { current, longest } = streaks(daily);
    const rangeDays = daysBetween(range.from, range.to) + 1;
    const lastActiveDay = active.length > 0 ? active[active.length - 1].day : null;
    const features = this.features(scopeId, userId, range);
    const teams = totals?.teams ?? [];

    return {
      login: canonicalLogin,
      userId,
      scope,
      range,
      seat: {
        current: usage.seats.all.filter((s) => s.userId === userId),
        billedOrg: (() => {
          const seats = usage.seats.all.filter((s) => s.userId === userId);
          return seats.length === 1 ? seats[0].org || null : null;
        })(),
        costCentres: this.costCentres(scopeId, canonicalLogin, usage),
        history: this.seatHistory(scopeId, userId),
      },
      activity: {
        daily,
        activeDays: active.length,
        activeDaysPerWeek: rangeDays > 0 ? (active.length / rangeDays) * 7 : 0,
        currentStreak: current,
        longestStreak: longest,
        firstActiveDay: active[0]?.day ?? null,
        lastActiveDay,
        daysSinceLastActive: lastActiveDay ? daysBetween(lastActiveDay, range.to) : null,
      },
      totals,
      teams,
      featureTotals: features.totals,
      featureFirstUsed: features.firstUsed,
      untriedFeatures: this.untriedFeatures(scopeId, range, features.totals, usage),
      breakdowns: {
        ide: this.aggregator.breakdown(scopeId, range, 'ide', userId),
        feature: this.aggregator.breakdown(scopeId, range, 'feature', userId),
        language: this.aggregator.breakdown(scopeId, range, 'language', userId),
        model: this.aggregator.breakdown(scopeId, range, 'model', userId),
        client: this.aggregator.breakdown(scopeId, range, 'client', userId),
      },
      spend: {
        aiCreditsUsed: totals?.aiCreditsUsed ?? 0,
        shareOfScope: ratio(totals?.aiCreditsUsed ?? 0, usage.kpis.aiCreditsUsed),
        shareOfTeams: teams.map((team) => {
          const t = usage.teams.find((x) => x.slug === team);
          return { team, share: ratio(totals?.aiCreditsUsed ?? 0, t?.aiCreditsUsed ?? 0) };
        }),
      },
      agentPrs: this.agentPrs(scopeId, canonicalLogin, range),
      peers: this.peers(totals, usage),
      dataQuality: {
        flaggedDays: daily.filter((d) => d.flags.length > 0).map((d) => d.day),
        suppressedDays: usage.dataQuality.suppressedDays,
      },
    };
  }

  private daily(scopeId: number, userId: number, range: DateRange): UserDailyPoint[] {
    const rows = new Map(
      this.all<{
        day: string;
        interactions: number;
        code_gen: number;
        code_accept: number;
        loc_suggested: number;
        loc_accepted: number;
        chat_turns: number;
        agent_turns: number;
        ai_credits_used: number;
        flags_json: string;
      }>(
        `SELECT day, interactions, code_gen, code_accept, loc_suggested, loc_accepted, chat_turns,
                agent_turns, ai_credits_used, flags_json
         FROM user_day_metrics WHERE scope_id = ? AND user_id = ? AND day BETWEEN ? AND ?`,
        scopeId,
        userId,
        range.from,
        range.to
      ).map((r) => [r.day, r])
    );
    const statuses = this.store.dayStatuses(scopeId, 'users-1-day', range.from, range.to);
    return dayRange(range.from, range.to).map((day) => {
      const r = rows.get(day);
      return {
        day,
        status: statuses.get(day) ?? 'missing',
        active: !!r && (r.interactions > 0 || r.code_gen > 0),
        interactions: r?.interactions ?? 0,
        codeGen: r?.code_gen ?? 0,
        codeAccept: r?.code_accept ?? 0,
        locSuggested: r?.loc_suggested ?? 0,
        locAccepted: r?.loc_accepted ?? 0,
        chatTurns: r?.chat_turns ?? 0,
        agentTurns: r?.agent_turns ?? 0,
        aiCreditsUsed: r?.ai_credits_used ?? 0,
        flags: r ? (JSON.parse(r.flags_json) as string[]) : [],
      };
    });
  }

  /** Feature totals in range, and the first day each feature was ever used. */
  private features(
    scopeId: number,
    userId: number,
    range: DateRange
  ): {
    totals: Partial<Record<FeatureCategory, number>>;
    firstUsed: Partial<Record<FeatureCategory, string>>;
  } {
    const rows = this.all<{ key: string; total: number; in_range: number; first_day: string }>(
      `SELECT key, SUM(value) AS total,
              SUM(CASE WHEN day BETWEEN ? AND ? THEN value ELSE 0 END) AS in_range,
              MIN(CASE WHEN value > 0 THEN day END) AS first_day
       FROM user_day_breakdown
       WHERE scope_id = ? AND user_id = ? AND dimension = 'feature'
         AND metric IN (${ACTIVITY_METRICS.map(() => '?').join(', ')})
       GROUP BY key`,
      range.from,
      range.to,
      scopeId,
      userId,
      ...ACTIVITY_METRICS
    );
    const totals: Partial<Record<FeatureCategory, number>> = {};
    const firstUsed: Partial<Record<FeatureCategory, string>> = {};
    for (const r of rows) {
      const category = classifyFeature(r.key);
      totals[category] = (totals[category] ?? 0) + r.in_range;
      if (r.first_day && (!firstUsed[category] || r.first_day < firstUsed[category]!)) {
        firstUsed[category] = r.first_day;
      }
    }
    return { totals, firstUsed };
  }

  private untriedFeatures(
    scopeId: number,
    range: DateRange,
    totals: Partial<Record<FeatureCategory, number>>,
    usage: CopilotUsageModel
  ): FeatureCategory[] {
    const activeUsers = usage.kpis.activeUsers;
    if (activeUsers < MIN_PEER_GROUP) return [];
    const rows = this.all<{ key: string; users: number }>(
      `SELECT key, COUNT(DISTINCT user_id) AS users FROM user_day_breakdown
       WHERE scope_id = ? AND dimension = 'feature' AND day BETWEEN ? AND ? AND value > 0
         AND metric IN (${ACTIVITY_METRICS.map(() => '?').join(', ')})
       GROUP BY key`,
      scopeId,
      range.from,
      range.to,
      ...ACTIVITY_METRICS
    );
    const usersByCategory = new Map<FeatureCategory, number>();
    for (const r of rows) {
      const category = classifyFeature(r.key);
      usersByCategory.set(category, Math.max(usersByCategory.get(category) ?? 0, r.users));
    }
    return [...usersByCategory.entries()]
      .filter(
        ([category, users]) =>
          category !== 'other' && users / activeUsers >= 0.5 && !(totals[category] ?? 0)
      )
      .map(([category]) => category)
      .sort();
  }

  private seatHistory(scopeId: number, userId: number): SeatEvent[] {
    const snapshots = this.all<{ day: string }>(
      'SELECT DISTINCT day FROM seat_day WHERE scope_id = ? ORDER BY day',
      scopeId
    ).map((r) => r.day);
    const held = new Map<string, Set<string>>();
    for (const r of this.all<{ day: string; org_login: string }>(
      'SELECT day, org_login FROM seat_day WHERE scope_id = ? AND user_id = ?',
      scopeId,
      userId
    )) {
      held.set(r.day, (held.get(r.day) ?? new Set()).add(r.org_login));
    }
    const events: SeatEvent[] = [];
    // The first snapshot is the baseline: only changes after it are events.
    let previous = held.get(snapshots[0] ?? '') ?? new Set<string>();
    for (const day of snapshots.slice(1)) {
      const current = held.get(day) ?? new Set<string>();
      for (const org of current)
        if (!previous.has(org)) events.push({ day, org, event: 'assigned' });
      for (const org of previous)
        if (!current.has(org)) events.push({ day, org, event: 'removed' });
      previous = current;
    }
    return events;
  }

  private costCentres(scopeId: number, login: string, usage: CopilotUsageModel): string[] {
    const orgs = usage.seats.all.filter((s) => s.login === login).map((s) => s.org);
    const rows = this.all<{ name: string }>(
      `SELECT DISTINCT c.name FROM cost_centre_members m
       JOIN cost_centres c ON c.scope_id = m.scope_id AND c.id = m.cost_centre_id
       WHERE m.scope_id = ? AND (
         (m.member_type = 'user' AND m.member_ref = ? COLLATE NOCASE)
         OR (m.member_type = 'org' AND m.member_ref IN (${orgs.map(() => '?').join(', ') || "''"})))`,
      scopeId,
      login,
      ...orgs
    );
    return rows.map((r) => r.name).sort();
  }

  private agentPrs(
    scopeId: number,
    login: string,
    range: DateRange
  ): CopilotUserProfile['agentPrs'] {
    const rows = this.all<{
      requested_by: string | null;
      reviewers_json: string;
      opened_at: string;
      merged_at: string | null;
      human_approved: number;
    }>(
      `SELECT requested_by, reviewers_json, opened_at, merged_at, human_approved FROM agent_prs
       WHERE scope_id = ? AND substr(opened_at, 1, 10) BETWEEN ? AND ?`,
      scopeId,
      range.from,
      range.to
    );
    const lower = login.toLowerCase();
    const requested = rows.filter((r) => r.requested_by?.toLowerCase() === lower);
    const merged = requested.filter((r) => r.merged_at);
    const reviewed = rows.filter((r) =>
      (JSON.parse(r.reviewers_json) as string[]).some((x) => x.toLowerCase() === lower)
    );
    return {
      requested: requested.length,
      merged: merged.length,
      mergedWithoutHumanApproval: merged.filter((r) => r.human_approved === 0).length,
      reviewed: reviewed.length,
      medianHoursToMerge: median(
        merged.map((r) => (Date.parse(r.merged_at as string) - Date.parse(r.opened_at)) / 3.6e6)
      ),
    };
  }

  private peers(totals: UserSummary | null, usage: CopilotUsageModel): PeerComparison[] {
    if (!totals) return [];
    const groups: Array<{ group: string; members: UserSummary[] }> = [
      ...totals.teams.map((team) => ({
        group: `team:${team}`,
        members: usage.users.filter((u) => u.teams.includes(team)),
      })),
      ...(usage.scope.kind === 'enterprise'
        ? totals.orgs.map((org) => ({
            group: `org:${org}`,
            members: usage.users.filter((u) => u.orgs.includes(org)),
          }))
        : []),
      {
        group: usage.scope.kind === 'org' ? `org:${usage.scope.org}` : 'enterprise',
        members: usage.users,
      },
    ];
    return groups
      .filter((g) => g.members.length >= MIN_PEER_GROUP)
      .map((g) => {
        const acceptance = g.members
          .map((u) => u.acceptanceRate)
          .filter((r): r is number => r !== null);
        return {
          group: g.group,
          size: g.members.length,
          activityPercentile: percentileRank(g.members.map(activity), activity(totals)),
          acceptancePercentile:
            totals.acceptanceRate === null || acceptance.length < MIN_PEER_GROUP
              ? null
              : percentileRank(acceptance, totals.acceptanceRate),
          spendPercentile: percentileRank(
            g.members.map((u) => u.aiCreditsUsed),
            totals.aiCreditsUsed
          ),
        };
      });
  }
}

export interface ProfileComparison {
  metric: string;
  a: number | null;
  b: number | null;
  change: number | null;
}

/** Side-by-side comparison of two profiles (two people, or one person in two periods). */
export function compareProfiles(a: CopilotUserProfile, b: CopilotUserProfile): ProfileComparison[] {
  const pick = (p: CopilotUserProfile) => ({
    'active days': p.activity.activeDays,
    'active days per week': Number(p.activity.activeDaysPerWeek.toFixed(1)),
    interactions: p.totals?.interactions ?? 0,
    'code generations': p.totals?.codeGen ?? 0,
    'acceptance rate': p.totals?.acceptanceRate ?? null,
    'chat turns': p.totals?.chatTurns ?? 0,
    'agent turns': p.totals?.agentTurns ?? 0,
    'AI credits used': p.spend.aiCreditsUsed,
  });
  const left = pick(a);
  const right = pick(b);
  return (Object.keys(left) as Array<keyof typeof left>).map((metric) => {
    const x = left[metric];
    const y = right[metric];
    return {
      metric,
      a: x,
      b: y,
      change: x === null || y === null ? null : y - x,
    };
  });
}
