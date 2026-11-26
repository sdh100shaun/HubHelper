import { describe, expect, it, jest } from '@jest/globals';
import { AgentPullRequestFetcher } from '../services/copilot/agent-pr-fetcher.js';
import type { CopilotApi } from '../services/copilot/api.js';
import { CopilotBillingFetcher } from '../services/copilot/billing-fetcher.js';
import { CopilotMetricsFetcher } from '../services/copilot/metrics-fetcher.js';
import { CopilotSeatsFetcher } from '../services/copilot/seats-fetcher.js';
import { CopilotStore } from '../services/copilot/store/copilot-store.js';
import { CopilotSyncService } from '../services/copilot/sync-service.js';
import {
  buildFixtureStore,
  createFakeApi,
  FIXTURE_DAYS,
  FIXTURE_NOW,
  FIXTURE_RANGE,
} from './helpers/copilot-fixtures.js';

const ORG = { kind: 'org' as const, org: 'acme' };
const ENT = { kind: 'enterprise' as const, enterprise: 'mega' };

function apiWith(
  request: (route: string, params?: Record<string, unknown>) => Promise<unknown>,
  download?: (url: string) => Promise<string>
): CopilotApi {
  return {
    request: request as CopilotApi['request'],
    download: download ?? (async () => ''),
  };
}

describe('CopilotMetricsFetcher', () => {
  it('downloads every link and counts invalid rows', async () => {
    const api = apiWith(
      async () => ({ status: 200, data: { download_links: ['https://a', 'https://b'] } }),
      async (url) => (url === 'https://a' ? '{"x":1}\nbad' : '{"y":2}')
    );
    const result = await new CopilotMetricsFetcher(api).fetchDay(ORG, 'users-1-day', '2026-11-01');
    expect(result).toEqual({ status: 'ok', records: [{ x: 1 }, { y: 2 }], invalidRows: 1 });
  });

  it.each([
    [{ status: 204 }, 'suppressed'],
    [{ status: 200, data: {} }, 'suppressed'],
  ])('maps response %p to %s', async (response, status) => {
    const api = apiWith(async () => response);
    expect((await new CopilotMetricsFetcher(api).fetchDay(ORG, 'users-1-day', 'd')).status).toBe(
      status
    );
  });

  it.each([
    [404, 'unavailable'],
    [422, 'suppressed'],
    [500, 'error'],
  ])('maps HTTP %i to %s', async (code, status) => {
    const api = apiWith(async () => {
      throw Object.assign(new Error('see https://secret.example/x?sig=1'), { status: code });
    });
    const result = await new CopilotMetricsFetcher(api).fetchDay(ORG, 'users-1-day', 'd');
    expect(result.status).toBe(status);
    expect(result.error ?? '').not.toContain('secret.example');
  });

  it('throws on permission errors and reports download failures', async () => {
    const denied = apiWith(async () => {
      throw { status: 403 };
    });
    await expect(
      new CopilotMetricsFetcher(denied).fetchDay(ORG, 'users-1-day', 'd')
    ).rejects.toEqual({ status: 403 });
    const expired = apiWith(
      async () => ({ status: 200, data: { download_links: ['https://x'] } }),
      async () => {
        throw new Error('Report download failed (403) https://x?sig=abc');
      }
    );
    const result = await new CopilotMetricsFetcher(expired).fetchDay(ORG, 'users-1-day', 'd');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Report download failed (403) <url>');
  });
});

describe('CopilotSeatsFetcher', () => {
  it('pages through seats and fills in the org for org scopes', async () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ assignee: { id: i + 1, login: `u${i + 1}` } }));
    const request = jest.fn(async (_route: string, params?: Record<string, unknown>) => ({
      status: 200,
      data: { seats: params?.page === 1 ? page(100) : [...page(1), { assignee: {} }] },
    }));
    const seats = await new CopilotSeatsFetcher(apiWith(request)).fetchSeats(ORG);
    expect(seats).toHaveLength(101);
    expect(seats[0].orgLogin).toBe('acme');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('filters enterprise seats to the requested orgs', async () => {
    const api = createFakeApi();
    const fetcher = new CopilotSeatsFetcher(api);
    const seats = await fetcher.fetchSeats({ ...ENT, orgs: ['labs'] });
    expect(new Set(seats.map((s) => s.orgLogin))).toEqual(new Set(['labs']));
    expect(fetcher.memberOrgs({ ...ENT, orgs: ['labs'] }, seats)).toEqual(['labs']);
    expect(fetcher.memberOrgs(ENT, await fetcher.fetchSeats(ENT))).toEqual(['acme', 'labs']);
    expect(fetcher.memberOrgs(ORG, [])).toEqual(['acme']);
  });

  it('marks orgs it cannot read as not assessed and rethrows other errors', async () => {
    const api = createFakeApi({ settingsDenied: ['labs'] });
    const result = await new CopilotSeatsFetcher(api).fetchOrgSettings(['acme', 'labs']);
    expect(result.settings.map((s) => s.orgLogin)).toEqual(['acme']);
    expect(result.notAssessed).toEqual(['labs']);
    const broken = apiWith(async () => {
      throw { status: 500 };
    });
    await expect(new CopilotSeatsFetcher(broken).fetchOrgSettings(['acme'])).rejects.toEqual({
      status: 500,
    });
  });
});

describe('CopilotBillingFetcher', () => {
  it('detects AI credits and keeps only Copilot products', async () => {
    const fetcher = new CopilotBillingFetcher(createFakeApi());
    const items = await fetcher.fetchDay(ORG, '2026-11-01');
    expect(items.map((i) => i.model)).toEqual(['gpt-5', 'claude-sonnet-4-6']);
    expect(items[0]).toMatchObject({ orgLogin: 'acme', unit: 'ai-credits', quantity: 20 });
    expect(await fetcher.detectBillingModel(ORG, '2026-11-01')).toBe('ai-credits');
  });

  it('falls back to premium requests', async () => {
    const fetcher = new CopilotBillingFetcher(createFakeApi({ aiCredits: false }));
    expect(await fetcher.detectBillingModel(ORG, '2026-11-01')).toBe('premium-requests');
    expect((await fetcher.fetchDay(ORG, '2026-11-01'))[0].unit).toBe('requests');
  });

  it('honours an override and rethrows permission errors', async () => {
    expect(
      await new CopilotBillingFetcher(createFakeApi(), 'premium-requests').detectBillingModel(
        ORG,
        'd'
      )
    ).toBe('premium-requests');
    await expect(
      new CopilotBillingFetcher(createFakeApi({ billingStatus: 403 })).detectBillingModel(
        ORG,
        '2026-11-01'
      )
    ).rejects.toBeTruthy();
  });

  it('reads cost centres with user and org members', async () => {
    const centres = await new CopilotBillingFetcher(createFakeApi()).fetchCostCentres('mega');
    expect(centres).toEqual([
      { id: 'cc-1', name: 'Platform', users: ['alice', 'bob'], orgs: [] },
      { id: 'cc-2', name: 'Labs', users: [], orgs: ['labs'] },
    ]);
    const empty = new CopilotBillingFetcher(
      apiWith(async () => ({ status: 200, data: { costCenters: [{ name: 'x' }] } }))
    );
    expect(await empty.fetchCostCentres('mega')).toEqual([]);
  });
});

describe('AgentPullRequestFetcher', () => {
  it('records the requester and whether a human approved', async () => {
    const prs = await new AgentPullRequestFetcher(createFakeApi()).fetch(
      'acme',
      '2026-11-01',
      '2026-11-30'
    );
    expect(prs).toHaveLength(3);
    expect(prs[0]).toMatchObject({
      repo: 'acme/api',
      number: 41,
      requestedBy: 'alice',
      humanApproved: true,
      reviewers: ['bob'],
    });
    expect(prs[1]).toMatchObject({
      number: 42,
      requestedBy: 'carol',
      humanApproved: false,
      reviewers: [],
    });
    expect(prs[2]).toMatchObject({ number: 43, mergedAt: undefined, humanApproved: false });
  });
});

describe('CopilotSyncService', () => {
  it('syncs an organisation end to end', async () => {
    const { store, summary } = await buildFixtureStore(ORG, {
      suppressedDays: ['2026-11-01'],
      missingDays: ['2026-11-02'],
    });
    expect(summary.days['users-1-day']).toEqual({
      ok: 26,
      suppressed: 1,
      unavailable: 1,
      error: 0,
    });
    expect(summary.seats).toBe(6);
    expect(summary.orgsAssessed).toEqual(['acme']);
    expect(summary.spendDays).toBe(FIXTURE_DAYS.length);
    expect(summary.agentPrs).toBe(3);
    expect(summary.warnings).toEqual([]);
    const scopeId = store.getScopeId(ORG)!;
    expect(store.missingDays(scopeId, 'users-1-day', FIXTURE_DAYS)).toEqual(['2026-11-02']);
  });

  it('only fetches missing days on a second sync', async () => {
    const store = CopilotStore.open(':memory:');
    const api = createFakeApi();
    const service = new CopilotSyncService(api, store, () => FIXTURE_NOW);
    await service.sync(ORG, { range: FIXTURE_RANGE, includeSpend: false, includeAgentPrs: false });
    api.calls.length = 0;
    const progress: string[] = [];
    await service.sync(ORG, {
      range: FIXTURE_RANGE,
      includeSpend: false,
      includeAgentPrs: false,
      onProgress: (m) => progress.push(m),
    });
    expect(api.calls.filter((c) => c.includes('/metrics/'))).toEqual([]);
    expect(progress).toEqual(['Fetching seats', 'Fetching Copilot settings for 1 org(s)']);
  });

  it('syncs an enterprise with cost centres and degrades on missing permissions', async () => {
    const { summary, store } = await buildFixtureStore(ENT, {
      reportStatus: 403,
      billingStatus: 403,
    });
    expect(summary.warnings).toEqual(
      expect.arrayContaining([
        'scope-1-day not synced: the token lacks permission',
        'users-1-day not synced: the token lacks permission',
        'Spend not synced: the token lacks permission',
      ])
    );
    expect(summary.seats).toBe(10);
    expect(store.db.prepare('SELECT status FROM sync_runs').get()).toEqual({ status: 'partial' });
  });

  it('records cost centres for enterprises and applies retention', async () => {
    const store = CopilotStore.open(':memory:');
    const summary = await new CopilotSyncService(createFakeApi(), store, () => FIXTURE_NOW).sync(
      ENT,
      {
        range: FIXTURE_RANGE,
        retentionDays: 10,
      }
    );
    expect(summary.retentionRemoved).toBeGreaterThan(0);
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM cost_centres').get()).toEqual({ n: 2 });
  });

  it('marks the run as failed when an unexpected error escapes', async () => {
    const store = CopilotStore.open(':memory:');
    const api = createFakeApi();
    jest.spyOn(store, 'applyRetention').mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(
      new CopilotSyncService(api, store, () => FIXTURE_NOW).sync(ORG, {
        range: { from: '2026-11-20', to: '2026-11-20' },
        retentionDays: 30,
      })
    ).rejects.toThrow('disk full');
    expect(store.db.prepare('SELECT status, error FROM sync_runs').get()).toEqual({
      status: 'error',
      error: 'disk full',
    });
  });

  it('reports seat, spend and PR failures as warnings', async () => {
    const store = CopilotStore.open(':memory:');
    const base = createFakeApi();
    const api: CopilotApi = {
      download: base.download,
      request: async (route, params) => {
        if (route.endsWith('/seats')) throw { status: 404 };
        return base.request(route, params);
      },
    };
    const summary = await new CopilotSyncService(api, store, () => FIXTURE_NOW).sync(ORG, {
      range: { from: '2026-11-20', to: '2026-11-21' },
    });
    expect(summary.warnings).toEqual(['Seats not synced: not available for this account']);
    expect(summary.agentPrs).toBe(0);

    const brokenPrs: CopilotApi = {
      download: base.download,
      request: async (route, params) => {
        if (route === 'GET /search/issues') throw new Error('search down');
        if (route.includes('billing/ai_credit')) throw new Error('billing down');
        return base.request(route, params);
      },
    };
    const s2 = await new CopilotSyncService(
      brokenPrs,
      CopilotStore.open(':memory:'),
      () => FIXTURE_NOW
    ).sync(ORG, {
      range: { from: '2026-11-20', to: '2026-11-20' },
    });
    expect(s2.warnings).toEqual([
      'Spend not synced: billing down',
      'Coding agent PRs not synced: search down',
    ]);
  });
});
