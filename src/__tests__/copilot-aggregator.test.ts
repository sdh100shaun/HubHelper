import { beforeAll, describe, expect, it } from '@jest/globals';
import type { CopilotUsageModel, UserSummary } from '../services/copilot/model.js';
import type { CopilotStore } from '../services/copilot/store/copilot-store.js';
import {
  assignCohorts,
  CopilotUsageAggregator,
  detectAnomalies,
  median,
  ratio,
} from '../services/copilot/usage-aggregator.js';
import {
  CopilotUserProfileBuilder,
  compareProfiles,
  percentileRank,
  streaks,
} from '../services/copilot/user-profile.js';
import { buildFixtureStore, FIXTURE_NOW, FIXTURE_RANGE } from './helpers/copilot-fixtures.js';

const ORG = { kind: 'org' as const, org: 'acme' };
const ENT = { kind: 'enterprise' as const, enterprise: 'mega' };

describe('aggregator helpers', () => {
  it('computes ratios, medians and anomalies', () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const flat = Array.from({ length: 10 }, (_, i) => ({ day: `d${i}`, value: 5 }));
    expect(detectAnomalies(flat, 'm')).toEqual([]);
    expect(detectAnomalies(flat.slice(0, 3), 'm')).toEqual([]);
    const spiky = [...flat, { day: 'spike', value: 100 }];
    expect(detectAnomalies(spiky, 'm')).toEqual([
      expect.objectContaining({ day: 'spike', metric: 'm', value: 100 }),
    ]);
  });

  it('assigns cohorts', () => {
    const users = Array.from({ length: 12 }, (_, i) => ({
      userId: i,
      login: `u${i}`,
      orgs: [],
      teams: [],
      activeDays: i === 0 ? 0 : i === 1 ? 1 : 20,
      interactions: i * 10,
      codeGen: 0,
      codeAccept: 0,
      acceptanceRate: null,
      chatTurns: 0,
      agentTurns: 0,
      aiCreditsUsed: 0,
      lastActiveDay: null,
      cohort: 'regular' as UserSummary['cohort'],
    }));
    assignCohorts(users, 28);
    expect(users[0].cohort).toBe('dormant');
    expect(users[1].cohort).toBe('casual');
    expect(
      users
        .filter((u) => u.cohort === 'power')
        .map((u) => u.login)
        .sort()
    ).toEqual(['u10', 'u11']);
  });
});

describe('CopilotUsageAggregator (organisation)', () => {
  let store: CopilotStore;
  let model: CopilotUsageModel;

  beforeAll(async () => {
    ({ store } = await buildFixtureStore(ORG, {
      suppressedDays: ['2026-11-01'],
      flaggedDay: '2026-11-20',
      publicCode: { acme: 'allow' },
    }));
    model = new CopilotUsageAggregator(store, () => FIXTURE_NOW).build(ORG, FIXTURE_RANGE);
  });

  it('computes headline KPIs from per-user rows', () => {
    expect(model.kpis.seats).toBe(6);
    expect(model.kpis.activeUsers).toBe(5);
    expect(model.kpis.activeRate).toBeCloseTo(5 / 6);
    expect(model.kpis.acceptanceRate).toBe(0.5);
    expect(model.kpis.interactions).toBeGreaterThan(0);
    expect(model.kpis.creditsPerActiveUser).toBeGreaterThan(0);
    expect(model.generatedAt).toBe(FIXTURE_NOW.toISOString());
  });

  it('keeps gaps as gaps and records data quality', () => {
    const nov1 = model.daily.find((d) => d.day === '2026-11-01')!;
    expect(nov1.status).toBe('suppressed');
    expect(nov1.activeUsers).toBe(0);
    expect(model.dataQuality.suppressedDays).toEqual(['2026-11-01']);
    expect(model.dataQuality.flaggedDays).toEqual(['2026-11-20']);
  });

  it('builds breakdowns from the preferred dimension, counting only active users', () => {
    expect(model.breakdowns.ide[0].key).toBe('vscode');
    expect(model.breakdowns.ide.map((e) => e.key).sort()).toEqual([
      'jetbrains',
      'neovim',
      'vscode',
    ]);
    expect(model.breakdowns.language.map((e) => e.key)).toContain('typescript');
    expect(model.breakdowns.model.map((e) => e.key)).toContain('gpt-5');
    expect(model.breakdowns.feature.find((e) => e.key === 'code_completion')?.users).toBe(5);
    expect(model.breakdowns.client).toEqual([]);
    expect(model.featureMix.find((d) => d.day === '2026-11-20')?.completions).toBeGreaterThan(0);
  });

  it('summarises users, cohorts, teams and orgs', () => {
    expect(model.users.find((u) => u.login === 'frank')).toMatchObject({
      cohort: 'dormant',
      activeDays: 0,
    });
    expect(model.cohorts.dormant).toBe(1);
    expect(model.teams.map((t) => t.slug).sort()).toEqual(['platform', 'web']);
    expect(model.teams.find((t) => t.slug === 'web')?.members).toBe(3);
    expect(model.orgs).toHaveLength(1);
    expect(model.orgs[0]).toMatchObject({ org: 'acme', seats: 6, activeUsers: 5 });
  });

  it('summarises seats, settings, spend and coding agent PRs', () => {
    expect(model.seats.snapshotDay).toBe('2026-11-25');
    expect(model.seats.idle.map((s) => s.login)).toEqual(['frank']);
    expect(model.seats.directAssignedPct).toBeCloseTo(1 / 6);
    expect(model.settings[0].publicCodeSuggestions).toBe('allow');
    expect(model.spend.byModel.map((m) => m.model)).toEqual(['gpt-5', 'claude-sonnet-4-6']);
    expect(model.spend.monthToDate.month).toBe('2026-11');
    expect(model.spend.monthToDate.forecastNetAmount).toBeCloseTo(36);
    expect(model.spend.byCostCentre).toEqual([]);
    expect(model.spend.unallocatedCredits).toBe(0);
    expect(model.agentPrs).toMatchObject({ opened: 3, merged: 2, medianHoursToMerge: 4 });
    expect(model.agentPrs.mergedWithoutHumanApproval.map((p) => p.number)).toEqual([42]);
  });

  it('fails clearly for a scope with no data', () => {
    expect(() =>
      new CopilotUsageAggregator(store).build({ kind: 'org', org: 'other' }, FIXTURE_RANGE)
    ).toThrow('copilot sync');
  });

  it('returns empty seat data when no snapshot exists', async () => {
    const { store: s2 } = await buildFixtureStore(ORG);
    s2.db.exec('DELETE FROM seat_day');
    const m = new CopilotUsageAggregator(s2).build(ORG, FIXTURE_RANGE);
    expect(m.seats).toMatchObject({ total: 0, snapshotDay: null, directAssignedPct: null });
  });
});

describe('CopilotUsageAggregator (enterprise)', () => {
  it('builds org rollups, multi-org users and cost centres', async () => {
    const { store } = await buildFixtureStore(ENT, { duplicateSeat: ['ivan'] });
    const model = new CopilotUsageAggregator(store).build(ENT, FIXTURE_RANGE);
    expect(model.orgs.map((o) => o.org).sort()).toEqual(['acme', 'labs']);
    expect(model.seats.multiOrgUsers).toEqual([{ login: 'ivan', orgs: ['acme', 'labs'] }]);
    expect(model.spend.byCostCentre.map((c) => c.name)).toEqual(['Labs', 'Platform']);
    expect(model.spend.unallocatedCredits).toBeGreaterThan(0);
    expect(model.breakdowns.client.map((e) => e.key)).toEqual(['opencode']);
    expect(model.spend.byOrg.length).toBe(2);
  });
});

describe('CopilotUserProfileBuilder', () => {
  let store: CopilotStore;
  let model: CopilotUsageModel;

  beforeAll(async () => {
    ({ store } = await buildFixtureStore(ENT, {
      suppressedDays: ['2026-11-01'],
      flaggedDay: '2026-11-20',
    }));
    model = new CopilotUsageAggregator(store).build(ENT, FIXTURE_RANGE);
  });

  it('builds a full profile', () => {
    const p = new CopilotUserProfileBuilder(store).build(ENT, 'Alice', FIXTURE_RANGE, model);
    expect(p.login).toBe('alice');
    expect(p.seat.current.map((s) => s.org)).toEqual(['acme']);
    expect(p.seat.billedOrg).toBe('acme');
    expect(p.seat.costCentres).toEqual(['Platform']);
    expect(p.seat.history).toEqual([]);
    expect(p.teams).toEqual(['platform']);
    expect(p.activity.activeDays).toBe(27);
    expect(p.activity.longestStreak).toBe(27);
    expect(p.activity.daily.find((d) => d.day === '2026-11-01')?.status).toBe('suppressed');
    expect(p.featureTotals.completions).toBeGreaterThan(0);
    expect(p.featureTotals.agent).toBeGreaterThan(0);
    expect(p.featureFirstUsed.chat).toBe('2026-10-28');
    expect(p.breakdowns.ide.map((e) => e.key)).toEqual(['vscode']);
    expect(p.agentPrs).toMatchObject({ requested: 2, merged: 1, mergedWithoutHumanApproval: 0 });
    expect(p.peers.map((x) => x.group)).toEqual(['org:acme', 'enterprise']);
    expect(p.spend.shareOfScope).toBeGreaterThan(0);
    expect(p.dataQuality.flaggedDays).toEqual(['2026-11-20']);
  });

  it('flags features most peers use that the person has not tried', () => {
    const p = new CopilotUserProfileBuilder(store).build(ENT, 'bob', FIXTURE_RANGE);
    expect(p.untriedFeatures).toEqual(['agent']);
    expect(p.agentPrs.reviewed).toBe(1);
  });

  it('leaves out small peer groups', () => {
    const p = new CopilotUserProfileBuilder(store).build(ENT, 'grace', FIXTURE_RANGE, model);
    expect(p.peers.some((x) => x.group.startsWith('team:'))).toBe(false);
  });

  it('records seat changes after the first snapshot', () => {
    store.ingestSeats(store.getScopeId(ENT)!, '2026-11-26', [
      { userId: 2, login: 'bob', orgLogin: 'acme' },
    ]);
    const p = new CopilotUserProfileBuilder(store).build(ENT, 'alice', FIXTURE_RANGE, model);
    expect(p.seat.history).toEqual([{ day: '2026-11-26', org: 'acme', event: 'removed' }]);
  });

  it('errors for unknown users and scopes', () => {
    const builder = new CopilotUserProfileBuilder(store);
    expect(() => builder.build(ENT, 'nobody', FIXTURE_RANGE, model)).toThrow(
      'No Copilot data stored for user'
    );
    expect(() => builder.build(ORG, 'alice', FIXTURE_RANGE)).toThrow('copilot sync');
  });

  it('compares two profiles', () => {
    const builder = new CopilotUserProfileBuilder(store);
    const rows = compareProfiles(
      builder.build(ENT, 'alice', FIXTURE_RANGE, model),
      builder.build(ENT, 'frank', FIXTURE_RANGE, model)
    );
    expect(rows.find((r) => r.metric === 'active days')).toEqual({
      metric: 'active days',
      a: 27,
      b: 0,
      change: -27,
    });
    expect(rows.find((r) => r.metric === 'acceptance rate')?.change).toBeNull();
  });
});

describe('profile helpers', () => {
  it('ranks percentiles', () => {
    expect(percentileRank([], 1)).toBe(0);
    expect(percentileRank([1, 2, 3, 4], 4)).toBe(88);
    expect(percentileRank([1, 1, 1], 1)).toBe(50);
  });

  it('counts streaks, skipping days without data', () => {
    expect(
      streaks([
        { day: 'a', active: true, status: 'ok' },
        { day: 'b', active: false, status: 'suppressed' },
        { day: 'c', active: true, status: 'ok' },
        { day: 'd', active: false, status: 'ok' },
        { day: 'e', active: true },
      ])
    ).toEqual({ current: 1, longest: 2 });
  });
});
