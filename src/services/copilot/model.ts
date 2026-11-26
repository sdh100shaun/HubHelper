/**
 * Shapes produced by the aggregator and consumed by evaluators, reporters and
 * the insights service.
 *
 * @module services/copilot/model
 */

import type { CopilotOrgSettings, CopilotScope, FeatureCategory } from '../../types/copilot.js';
import type { DateRange } from './dates.js';

export interface DailyPoint {
  day: string;
  /** `ok`, `suppressed`, `unavailable`, `error` or `missing` (never synced). */
  status: string;
  activeUsers: number;
  engagedUsers: number;
  interactions: number;
  codeGen: number;
  codeAccept: number;
  locAccepted: number;
  chatTurns: number;
  agentTurns: number;
  aiCreditsUsed: number;
  flags: string[];
}

export interface BreakdownEntry {
  key: string;
  interactions: number;
  codeGen: number;
  codeAccept: number;
  acceptanceRate: number | null;
  users: number;
}

export type BreakdownDimension = 'ide' | 'feature' | 'language' | 'model' | 'client';

export interface UserSummary {
  userId: number;
  login: string;
  orgs: string[];
  teams: string[];
  activeDays: number;
  interactions: number;
  codeGen: number;
  codeAccept: number;
  acceptanceRate: number | null;
  chatTurns: number;
  agentTurns: number;
  aiCreditsUsed: number;
  lastActiveDay: string | null;
  cohort: 'power' | 'regular' | 'casual' | 'dormant';
}

export interface TeamSummary {
  teamId: number;
  slug: string;
  members: number;
  activeUsers: number;
  interactions: number;
  acceptanceRate: number | null;
  aiCreditsUsed: number;
}

export interface OrgSummary {
  org: string;
  seats: number;
  activeUsers: number;
  activeRate: number | null;
  interactions: number;
  acceptanceRate: number | null;
  aiCreditsUsed: number;
  creditsPerActiveUser: number | null;
}

export interface SeatSummary {
  userId: number;
  login: string;
  org: string;
  assigningTeam: string | null;
  planType: string | null;
  lastActivityAt: string | null;
  lastActivityEditor: string | null;
  idleDays: number | null;
  pendingCancellation: string | null;
}

export interface SpendSummary {
  unit: string;
  total: number;
  netAmount: number;
  byModel: Array<{ model: string; quantity: number; netAmount: number }>;
  byDay: Array<{ day: string; quantity: number; netAmount: number }>;
  byUser: Array<{ login: string; aiCreditsUsed: number }>;
  byOrg: Array<{ org: string; aiCreditsUsed: number }>;
  byCostCentre: Array<{ id: string; name: string; aiCreditsUsed: number }>;
  unallocatedCredits: number;
  monthToDate: { month: string; netAmount: number; quantity: number; forecastNetAmount: number };
}

export interface AgentPrSummary {
  opened: number;
  merged: number;
  mergedWithoutHumanApproval: Array<{
    repo: string;
    number: number;
    url: string;
    title: string;
    requestedBy: string | null;
    mergedAt: string;
  }>;
  medianHoursToMerge: number | null;
}

export interface Anomaly {
  day: string;
  metric: string;
  value: number;
  mean: number;
  zScore: number;
}

export interface CopilotUsageModel {
  scope: CopilotScope;
  range: DateRange;
  generatedAt: string;
  kpis: {
    seats: number;
    activeUsers: number;
    engagedUsers: number;
    activeRate: number | null;
    averageDailyActiveUsers: number;
    interactions: number;
    codeGen: number;
    codeAccept: number;
    acceptanceRate: number | null;
    locAccepted: number;
    aiCreditsUsed: number;
    creditsPerActiveUser: number | null;
  };
  daily: DailyPoint[];
  featureMix: Array<{ day: string } & Partial<Record<FeatureCategory, number>>>;
  breakdowns: Record<BreakdownDimension, BreakdownEntry[]>;
  cohorts: Record<UserSummary['cohort'], number>;
  users: UserSummary[];
  teams: TeamSummary[];
  orgs: OrgSummary[];
  seats: {
    total: number;
    idle: SeatSummary[];
    all: SeatSummary[];
    directAssignedPct: number | null;
    multiOrgUsers: Array<{ login: string; orgs: string[] }>;
    snapshotDay: string | null;
  };
  settings: CopilotOrgSettings[];
  spend: SpendSummary;
  agentPrs: AgentPrSummary;
  anomalies: Anomaly[];
  dataQuality: { suppressedDays: string[]; missingDays: string[]; flaggedDays: string[] };
}
