/**
 * Copilot Insights types and normalisers.
 *
 * GitHub's Copilot usage metrics reports gain new fields regularly, so raw
 * records are parsed leniently: known counters are read by name (with
 * fallbacks), and every `totals_by_*` array is flattened generically into
 * dimension/key/metric rows. Unknown fields are kept in the raw payload.
 *
 * @module types/copilot
 */

import { z } from 'zod';

// ============================================================================
// Scope
// ============================================================================

export type CopilotScope =
  | { kind: 'org'; org: string }
  | { kind: 'enterprise'; enterprise: string; orgs?: string[] };

/** Stable slug used to key a scope in the store, e.g. `org:acme`. */
export function scopeKey(scope: CopilotScope): string {
  return scope.kind === 'org' ? `org:${scope.org}` : `enterprise:${scope.enterprise}`;
}

export function scopeSlug(scope: CopilotScope): string {
  return scope.kind === 'org' ? scope.org : scope.enterprise;
}

// ============================================================================
// Report kinds and API shapes
// ============================================================================

/** `scope-1-day` is organization-1-day or enterprise-1-day depending on scope. */
export type ReportKind = 'scope-1-day' | 'users-1-day' | 'user-teams-1-day';

export const REPORT_KINDS: readonly ReportKind[] = [
  'scope-1-day',
  'users-1-day',
  'user-teams-1-day',
];

/** Outcome recorded for one report on one day. */
export type SyncDayStatus = 'ok' | 'suppressed' | 'unavailable' | 'error';

export const ReportLinksSchema = z
  .object({
    download_links: z.array(z.string()).optional().default([]),
    report_day: z.string().optional(),
    report_start_day: z.string().optional(),
    report_end_day: z.string().optional(),
  })
  .passthrough();

export type ReportLinks = z.infer<typeof ReportLinksSchema>;

export const RawRecordSchema = z.record(z.string(), z.unknown());
export type RawRecord = z.infer<typeof RawRecordSchema>;

// ============================================================================
// Normalised records
// ============================================================================

export interface BreakdownRow {
  /** e.g. `ide`, `feature`, `language_feature`, `model_feature`, `client` */
  dimension: string;
  key: string;
  subKey: string;
  metric: string;
  value: number;
}

export interface UserDayCore {
  interactions: number;
  codeGen: number;
  codeAccept: number;
  locSuggested: number;
  locAccepted: number;
  chatTurns: number;
  agentTurns: number;
  aiCreditsUsed: number;
}

export interface NormalisedUserDay extends UserDayCore {
  day: string;
  userId: number;
  login: string;
  orgLogin?: string;
  breakdowns: BreakdownRow[];
  flags: string[];
}

export interface NormalisedScopeDay {
  day: string;
  /** Every numeric top-level field, keyed by its GitHub field name. */
  metrics: Record<string, number>;
  breakdowns: BreakdownRow[];
  flags: string[];
}

export interface UserTeamDay {
  day: string;
  userId: number;
  teamId: number;
  teamSlug: string;
  teamName: string;
}

export interface CopilotSeat {
  userId: number;
  login: string;
  orgLogin?: string;
  assigningTeamSlug?: string;
  planType?: string;
  createdAt?: string;
  lastActivityAt?: string;
  lastActivityEditor?: string;
  pendingCancellationDate?: string;
}

/** Copilot settings for one organisation (from `GET /orgs/{org}/copilot/billing`). */
export interface CopilotOrgSettings {
  orgLogin: string;
  seatManagementSetting?: string;
  publicCodeSuggestions?: string;
  ideChat?: string;
  platformChat?: string;
  cli?: string;
  /** Every string-valued setting, for policy drift comparison. */
  all: Record<string, string>;
}

export type BillingModel = 'ai-credits' | 'premium-requests';

export interface CopilotSpendItem {
  day: string;
  userLogin?: string;
  orgLogin?: string;
  costCentreId?: string;
  model: string;
  product: string;
  unit: string;
  quantity: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
}

export interface CostCentre {
  id: string;
  name: string;
  users: string[];
  orgs: string[];
}

export interface AgentPullRequest {
  repo: string;
  number: number;
  orgLogin: string;
  title: string;
  url: string;
  requestedBy?: string;
  openedAt: string;
  mergedAt?: string;
  humanApproved: boolean;
  reviewers: string[];
}

// ============================================================================
// Normalisation helpers
// ============================================================================

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function firstNumber(record: RawRecord, names: readonly string[]): number {
  for (const name of names) {
    if (typeof record[name] === 'number') return num(record[name]);
  }
  return 0;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const FLAG_KEY = /flag|gap|quality|outdated|incomplete/i;

/**
 * Collect data-quality flags. Any field whose name suggests a flag is read:
 * `true` booleans become the field name, strings and string arrays are kept.
 */
export function extractFlags(record: RawRecord): string[] {
  const flags: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!FLAG_KEY.test(key)) continue;
    if (value === true) flags.push(key);
    else if (typeof value === 'string' && value.length > 0) flags.push(`${key}:${value}`);
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') flags.push(`${key}:${item}`);
        else if (item && typeof item === 'object') {
          const label = Object.values(item as RawRecord).find((v) => typeof v === 'string');
          if (typeof label === 'string') flags.push(`${key}:${label}`);
        }
      }
    }
  }
  return flags;
}

/**
 * Flatten every `totals_by_<dimension>` array. In each element, the string
 * fields form the key (first) and sub-key (second); each numeric field becomes
 * one metric row. This keeps working when GitHub adds dimensions or metrics.
 */
export function extractBreakdowns(record: RawRecord): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  for (const [field, value] of Object.entries(record)) {
    if (!field.startsWith('totals_by_') || !Array.isArray(value)) continue;
    const dimension = field.slice('totals_by_'.length);
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const entries = Object.entries(item as RawRecord);
      const labels = entries.filter(([, v]) => typeof v === 'string').map(([, v]) => v as string);
      const key = labels[0] ?? 'unknown';
      const subKey = labels[1] ?? '';
      for (const [metric, metricValue] of entries) {
        if (typeof metricValue === 'number' && Number.isFinite(metricValue)) {
          rows.push({ dimension, key, subKey, metric, value: metricValue });
        }
      }
    }
  }
  return rows;
}

const INTERACTION_FIELDS = ['user_initiated_interaction_count', 'interaction_count'] as const;
const CODE_GEN_FIELDS = ['code_generation_activity_count', 'code_generation_count'] as const;
const CODE_ACCEPT_FIELDS = ['code_acceptance_activity_count', 'code_acceptance_count'] as const;
const LOC_SUGGESTED_FIELDS = ['loc_suggested_to_add_sum', 'loc_suggested_sum'] as const;
const LOC_ACCEPTED_FIELDS = ['loc_added_sum', 'loc_accepted_sum'] as const;
const AI_CREDIT_FIELDS = ['ai_credits_used', 'ai_credit_used', 'premium_requests_used'] as const;

/** Feature categories used throughout the reports and dashboard. */
export type FeatureCategory =
  | 'completions'
  | 'chat'
  | 'agent'
  | 'edits'
  | 'cli'
  | 'code-review'
  | 'coding-agent'
  | 'other';

/** Map a GitHub feature name (e.g. `chat_panel_agent_mode`) to a category. */
export function classifyFeature(feature: string): FeatureCategory {
  const f = feature.toLowerCase();
  if (f.includes('coding_agent') || f.includes('cloud_agent') || f.includes('swe_agent')) {
    return 'coding-agent';
  }
  if (f.includes('code_review') || f.includes('review')) return 'code-review';
  if (f.includes('agent')) return 'agent';
  if (f.includes('cli')) return 'cli';
  if (f.includes('edit')) return 'edits';
  if (f.includes('chat') || f.includes('ask')) return 'chat';
  if (f.includes('completion')) return 'completions';
  return 'other';
}

function sumFeatureInteractions(rows: BreakdownRow[], category: FeatureCategory): number {
  return rows
    .filter(
      (r) =>
        r.dimension === 'feature' &&
        INTERACTION_FIELDS.includes(r.metric as (typeof INTERACTION_FIELDS)[number]) &&
        classifyFeature(r.key) === category
    )
    .reduce((acc, r) => acc + r.value, 0);
}

function isoDay(value: unknown): string | undefined {
  const s = str(value);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
}

/** Normalise one per-user report row. Returns null when it has no user id. */
export function normaliseUserDay(record: RawRecord, fallbackDay: string): NormalisedUserDay | null {
  const userId = num(record.user_id);
  const login = str(record.user_login) ?? str(record.login);
  if (!userId || !login) return null;
  const breakdowns = extractBreakdowns(record);
  const chatFromFeatures = sumFeatureInteractions(breakdowns, 'chat');
  const agentFromFeatures = sumFeatureInteractions(breakdowns, 'agent');
  return {
    day: isoDay(record.day) ?? fallbackDay,
    userId,
    login,
    orgLogin: str(record.organization_login) ?? str(record.org_login),
    interactions: firstNumber(record, INTERACTION_FIELDS),
    codeGen: firstNumber(record, CODE_GEN_FIELDS),
    codeAccept: firstNumber(record, CODE_ACCEPT_FIELDS),
    locSuggested: firstNumber(record, LOC_SUGGESTED_FIELDS),
    locAccepted: firstNumber(record, LOC_ACCEPTED_FIELDS),
    chatTurns: chatFromFeatures || (record.used_chat === true ? 1 : 0),
    agentTurns: agentFromFeatures || (record.used_agent === true ? 1 : 0),
    aiCreditsUsed: firstNumber(record, AI_CREDIT_FIELDS),
    breakdowns,
    flags: extractFlags(record),
  };
}

/** Normalise one aggregated (org or enterprise) report row. */
export function normaliseScopeDay(record: RawRecord, fallbackDay: string): NormalisedScopeDay {
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'number' && Number.isFinite(value) && !key.endsWith('_id')) {
      metrics[key] = value;
    }
  }
  // Pull-request counters arrive as a nested object; keep them as pull_requests.<field>.
  const prs = record.pull_requests;
  if (prs && typeof prs === 'object' && !Array.isArray(prs)) {
    for (const [key, value] of Object.entries(prs as RawRecord)) {
      if (typeof value === 'number') metrics[`pull_requests.${key}`] = value;
    }
  }
  return {
    day: isoDay(record.day) ?? fallbackDay,
    metrics,
    breakdowns: extractBreakdowns(record),
    flags: extractFlags(record),
  };
}

/** Normalise one user-teams report row. */
export function normaliseUserTeam(record: RawRecord, fallbackDay: string): UserTeamDay | null {
  const userId = num(record.user_id);
  const teamId = num(record.team_id);
  const teamSlug = str(record.team_slug) ?? str(record.slug);
  if (!userId || !teamId || !teamSlug) return null;
  return {
    day: isoDay(record.day) ?? fallbackDay,
    userId,
    teamId,
    teamSlug,
    teamName: str(record.team_name) ?? teamSlug,
  };
}

/** Normalise a seat from `GET .../copilot/billing/seats`. */
export function normaliseSeat(record: RawRecord): CopilotSeat | null {
  const assignee = record.assignee as RawRecord | undefined;
  if (!assignee || typeof assignee !== 'object') return null;
  const userId = num(assignee.id);
  const login = str(assignee.login);
  if (!userId || !login) return null;
  const org = record.organization as RawRecord | undefined;
  const team = record.assigning_team as RawRecord | undefined;
  return {
    userId,
    login,
    orgLogin: org && typeof org === 'object' ? str(org.login) : undefined,
    assigningTeamSlug: team && typeof team === 'object' ? str(team.slug) : undefined,
    planType: str(record.plan_type),
    createdAt: str(record.created_at),
    lastActivityAt: str(record.last_activity_at),
    lastActivityEditor: str(record.last_activity_editor),
    pendingCancellationDate: str(record.pending_cancellation_date),
  };
}

/** Normalise `GET /orgs/{org}/copilot/billing`. */
export function normaliseOrgSettings(orgLogin: string, record: RawRecord): CopilotOrgSettings {
  const all: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') all[key] = value;
  }
  return {
    orgLogin,
    seatManagementSetting: str(record.seat_management_setting),
    publicCodeSuggestions: str(record.public_code_suggestions),
    ideChat: str(record.ide_chat),
    platformChat: str(record.platform_chat),
    cli: str(record.cli),
    all,
  };
}

/** Normalise one billing usage item (premium requests or AI credits). */
export function normaliseSpendItem(
  record: RawRecord,
  context: { day: string; userLogin?: string; orgLogin?: string; costCentreId?: string }
): CopilotSpendItem {
  return {
    day: context.day,
    userLogin: context.userLogin ?? str(record.user),
    orgLogin: context.orgLogin ?? str(record.organization),
    costCentreId: context.costCentreId ?? str(record.costCenterId),
    model: str(record.model) ?? 'unknown',
    product: str(record.product) ?? 'copilot',
    unit: str(record.unitType) ?? str(record.unit_type) ?? 'requests',
    quantity: num(record.netQuantity ?? record.grossQuantity ?? record.quantity),
    grossAmount: num(record.grossAmount),
    discountAmount: num(record.discountAmount),
    netAmount: num(record.netAmount),
  };
}

/** Parse NDJSON (or a JSON array) into raw records, counting rows that fail. */
export function parseRecords(body: string): { records: RawRecord[]; invalid: number } {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { records: [], invalid: 0 };
  const records: RawRecord[] = [];
  let invalid = 0;
  const pushParsed = (value: unknown) => {
    const result = RawRecordSchema.safeParse(value);
    if (result.success && !Array.isArray(value)) records.push(result.data);
    else invalid++;
  };
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) pushParsed(item);
        return { records, invalid };
      }
    } catch {
      // fall through to line-by-line parsing
    }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      pushParsed(JSON.parse(line));
    } catch {
      invalid++;
    }
  }
  return { records, invalid };
}
