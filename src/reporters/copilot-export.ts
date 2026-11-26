/**
 * Tabular views of Copilot Insights data, and CSV / Markdown / JSON output.
 *
 * Each view is a list of plain rows so the same data feeds the console, CSV,
 * Markdown and JSON outputs.
 *
 * @module reporters/copilot-export
 */

import { pseudonym } from '../services/copilot/access-control.js';
import type { BreakdownDimension, CopilotUsageModel } from '../services/copilot/model.js';
import type { CopilotUserProfile } from '../services/copilot/user-profile.js';

export type Row = Record<string, string | number | boolean | null>;

export type UsageView = BreakdownDimension | 'day' | 'team' | 'org' | 'cost-centre';

export interface AccessStamp {
  viewer: string;
  viewedAt: string;
  reasonCode: string;
}

export function pctCell(value: number | null): string {
  return value === null ? '' : `${(value * 100).toFixed(1)}%`;
}

function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Rows for `copilot usage --by <view>`. */
export function usageRows(model: CopilotUsageModel, view: UsageView): Row[] {
  switch (view) {
    case 'day':
      return model.daily.map((d) => ({
        day: d.day,
        status: d.status,
        active_users: d.activeUsers,
        engaged_users: d.engagedUsers,
        interactions: d.interactions,
        code_generations: d.codeGen,
        code_acceptances: d.codeAccept,
        lines_accepted: d.locAccepted,
        chat_turns: d.chatTurns,
        agent_turns: d.agentTurns,
        ai_credits: round(d.aiCreditsUsed),
        flags: d.flags.join('; '),
      }));
    case 'team':
      return model.teams.map((t) => ({
        team: t.slug,
        members: t.members,
        active_users: t.activeUsers,
        interactions: t.interactions,
        acceptance_rate: pctCell(t.acceptanceRate),
        ai_credits: round(t.aiCreditsUsed),
      }));
    case 'org':
      return model.orgs.map((o) => ({
        org: o.org,
        seats: o.seats,
        active_users: o.activeUsers,
        active_rate: pctCell(o.activeRate),
        interactions: o.interactions,
        acceptance_rate: pctCell(o.acceptanceRate),
        ai_credits: round(o.aiCreditsUsed),
        credits_per_active_user:
          o.creditsPerActiveUser === null ? '' : round(o.creditsPerActiveUser),
      }));
    case 'cost-centre':
      return [
        ...model.spend.byCostCentre.map((c) => ({
          cost_centre: c.name,
          id: c.id,
          ai_credits: round(c.aiCreditsUsed),
        })),
        ...(model.spend.byCostCentre.length > 0
          ? [
              {
                cost_centre: '(none)',
                id: '',
                ai_credits: round(model.spend.unallocatedCredits),
              },
            ]
          : []),
      ];
    default:
      return model.breakdowns[view].map((e) => ({
        [view]: e.key,
        users: e.users,
        interactions: e.interactions,
        code_generations: e.codeGen,
        code_acceptances: e.codeAccept,
        acceptance_rate: pctCell(e.acceptanceRate),
      }));
  }
}

/** Seat rows. Logins are pseudonymised when `anonymise` is set. */
export function seatRows(
  model: CopilotUsageModel,
  options: { idleOnly?: boolean; anonymise?: boolean; inactiveDays?: number } = {}
): Row[] {
  const threshold = options.inactiveDays ?? 30;
  const seats = options.idleOnly
    ? model.seats.all.filter((s) => s.idleDays === null || s.idleDays > threshold)
    : model.seats.all;
  return seats.map((s) => ({
    login: options.anonymise ? pseudonym(s.login) : s.login,
    org: s.org,
    assigned_by: s.assigningTeam ? `team:${s.assigningTeam}` : 'direct',
    plan: s.planType ?? '',
    last_activity: s.lastActivityAt ? s.lastActivityAt.slice(0, 10) : 'never',
    editor: s.lastActivityEditor ?? '',
    idle_days: s.idleDays,
    pending_cancellation: s.pendingCancellation ?? '',
  }));
}

export type SpendView = 'model' | 'day' | 'user' | 'org' | 'cost-centre';

export function spendRows(model: CopilotUsageModel, view: SpendView, anonymise = false): Row[] {
  const s = model.spend;
  switch (view) {
    case 'day':
      return s.byDay.map((d) => ({
        day: d.day,
        quantity: round(d.quantity),
        net_amount: round(d.netAmount),
      }));
    case 'user':
      return s.byUser.map((u) => ({
        login: anonymise ? pseudonym(u.login) : u.login,
        ai_credits: round(u.aiCreditsUsed),
      }));
    case 'org':
      return s.byOrg.map((o) => ({ org: o.org, ai_credits: round(o.aiCreditsUsed) }));
    case 'cost-centre':
      return usageRows(model, 'cost-centre');
    default:
      return s.byModel.map((m) => ({
        model: m.model,
        quantity: round(m.quantity),
        net_amount: round(m.netAmount),
      }));
  }
}

export type UserSort = 'activity' | 'acceptance' | 'spend' | 'last-active';

export function userRows(
  model: CopilotUsageModel,
  options: { sort?: UserSort; team?: string; idle?: boolean; limit?: number } = {}
): Row[] {
  let users = [...model.users];
  if (options.team) users = users.filter((u) => u.teams.includes(options.team!));
  if (options.idle) users = users.filter((u) => u.activeDays === 0);
  const sorters: Record<UserSort, (a: (typeof users)[0], b: (typeof users)[0]) => number> = {
    activity: (a, b) => b.interactions + b.codeGen - (a.interactions + a.codeGen),
    acceptance: (a, b) => (b.acceptanceRate ?? -1) - (a.acceptanceRate ?? -1),
    spend: (a, b) => b.aiCreditsUsed - a.aiCreditsUsed,
    'last-active': (a, b) => (b.lastActiveDay ?? '').localeCompare(a.lastActiveDay ?? ''),
  };
  users.sort(sorters[options.sort ?? 'activity']);
  return users.slice(0, options.limit ?? 50).map((u) => ({
    login: u.login,
    orgs: u.orgs.join(' '),
    teams: u.teams.join(' '),
    cohort: u.cohort,
    active_days: u.activeDays,
    interactions: u.interactions,
    acceptance_rate: pctCell(u.acceptanceRate),
    chat_turns: u.chatTurns,
    agent_turns: u.agentTurns,
    ai_credits: round(u.aiCreditsUsed),
    last_active: u.lastActiveDay ?? 'never',
  }));
}

/** Flat key/value rows describing a profile, for CSV and Markdown. */
export function profileRows(profile: CopilotUserProfile): Row[] {
  const t = profile.totals;
  const a = profile.activity;
  return [
    { field: 'login', value: profile.login },
    { field: 'range', value: `${profile.range.from} to ${profile.range.to}` },
    { field: 'orgs', value: profile.seat.current.map((s) => s.org).join(' ') },
    { field: 'billed_org', value: profile.seat.billedOrg ?? 'not reported' },
    { field: 'teams', value: profile.teams.join(' ') },
    { field: 'cost_centres', value: profile.seat.costCentres.join(' ') },
    { field: 'active_days', value: a.activeDays },
    { field: 'active_days_per_week', value: round(a.activeDaysPerWeek, 1) },
    { field: 'current_streak', value: a.currentStreak },
    { field: 'longest_streak', value: a.longestStreak },
    { field: 'first_active', value: a.firstActiveDay },
    { field: 'last_active', value: a.lastActiveDay },
    { field: 'interactions', value: t?.interactions ?? 0 },
    { field: 'code_generations', value: t?.codeGen ?? 0 },
    { field: 'acceptance_rate', value: pctCell(t?.acceptanceRate ?? null) },
    { field: 'chat_turns', value: t?.chatTurns ?? 0 },
    { field: 'agent_turns', value: t?.agentTurns ?? 0 },
    { field: 'ai_credits', value: round(profile.spend.aiCreditsUsed) },
    { field: 'share_of_scope_credits', value: pctCell(profile.spend.shareOfScope) },
    { field: 'agent_prs_requested', value: profile.agentPrs.requested },
    {
      field: 'agent_prs_merged_without_approval',
      value: profile.agentPrs.mergedWithoutHumanApproval,
    },
    { field: 'untried_features', value: profile.untriedFeatures.join(' ') },
    ...profile.peers.map((p) => ({
      field: `peer_activity_percentile:${p.group}`,
      value: p.activityPercentile,
    })),
  ];
}

// ── Serialisers ─────────────────────────────────────────────────────────────

/**
 * Quote a CSV cell. Cells starting with `=`, `+`, `-`, `@`, tab or CR are
 * prefixed with `'` so spreadsheets do not run them as formulas.
 */
export function csvCell(value: Row[string]): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !(typeof value === 'number')) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[], stamp?: AccessStamp): string {
  if (rows.length === 0) return stamp ? `${csvStamp(stamp)}\n` : '';
  const columns = Object.keys(rows[0]);
  const lines = [
    columns.map(csvCell).join(','),
    ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')),
  ];
  if (stamp) lines.unshift(csvStamp(stamp));
  return `${lines.join('\n')}\n`;
}

function csvStamp(stamp: AccessStamp): string {
  return `# Individual data viewed by ${stamp.viewer} at ${stamp.viewedAt} (reason: ${stamp.reasonCode})`;
}

function mdCell(value: Row[string]): string {
  return value === null || value === undefined
    ? ''
    : String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function toMarkdownTable(rows: Row[]): string {
  if (rows.length === 0) return '_No data._\n';
  const columns = Object.keys(rows[0]);
  return `${[
    `| ${columns.map(mdCell).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${columns.map((c) => mdCell(r[c])).join(' | ')} |`),
  ].join('\n')}\n`;
}

export function toMarkdown(
  title: string,
  sections: Array<{ heading: string; rows: Row[] }>,
  stamp?: AccessStamp
): string {
  const parts = [`# ${title}\n`];
  for (const s of sections) parts.push(`## ${s.heading}\n\n${toMarkdownTable(s.rows)}`);
  if (stamp) {
    parts.push(
      `---\n\n_Individual data viewed by ${mdCell(stamp.viewer)} at ${stamp.viewedAt} (reason: ${stamp.reasonCode})._\n`
    );
  }
  return parts.join('\n');
}

export function toJson(value: unknown, stamp?: AccessStamp): string {
  const payload =
    stamp && value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>), access: stamp }
      : stamp
        ? { data: value, access: stamp }
        : value;
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Copy of the model with every login replaced by a pseudonym. */
export function anonymiseModel(model: CopilotUsageModel): CopilotUsageModel {
  return {
    ...model,
    users: model.users.map((u) => ({ ...u, login: pseudonym(u.login) })),
    seats: {
      ...model.seats,
      all: model.seats.all.map((s) => ({ ...s, login: pseudonym(s.login) })),
      idle: model.seats.idle.map((s) => ({ ...s, login: pseudonym(s.login) })),
      multiOrgUsers: model.seats.multiOrgUsers.map((u) => ({ ...u, login: pseudonym(u.login) })),
    },
    spend: {
      ...model.spend,
      byUser: model.spend.byUser.map((u) => ({ ...u, login: pseudonym(u.login) })),
    },
    agentPrs: {
      ...model.agentPrs,
      mergedWithoutHumanApproval: model.agentPrs.mergedWithoutHumanApproval.map((p) => ({
        ...p,
        requestedBy: p.requestedBy ? pseudonym(p.requestedBy) : null,
      })),
    },
  };
}
