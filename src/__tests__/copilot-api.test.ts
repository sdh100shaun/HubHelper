import { describe, expect, it, jest } from '@jest/globals';
import type { Octokit } from '@octokit/rest';
import {
  COPILOT_API_VERSION,
  CopilotApiError,
  createCopilotApi,
  mapWithConcurrency,
  statusOf,
  withRetry,
} from '../services/copilot/api.js';
import {
  addDays,
  dayRange,
  daysBetween,
  isValidDay,
  isValidMonth,
  monthRange,
  resolveRange,
} from '../services/copilot/dates.js';
import {
  billingUsagePath,
  costCentresPath,
  orgSettingsPath,
  probeAccess,
  reportPath,
  seatsPath,
} from '../services/copilot/scope.js';

describe('copilot dates', () => {
  it('validates days and months', () => {
    expect(isValidDay('2026-02-28')).toBe(true);
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('26-02-01')).toBe(false);
    expect(isValidMonth('2026-12')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth('2026-1')).toBe(false);
  });

  it('does day arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-01', '2026-11-11')).toBe(10);
    expect(dayRange('2026-11-29', '2026-12-01')).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ]);
    expect(dayRange('2026-12-01', '2026-11-01')).toEqual([]);
  });

  it('resolves ranges ending yesterday by default', () => {
    const now = new Date('2026-11-26T08:00:00Z');
    expect(resolveRange({}, now)).toEqual({ from: '2026-10-29', to: '2026-11-25' });
    expect(resolveRange({ days: 1 }, now)).toEqual({ from: '2026-11-25', to: '2026-11-25' });
    expect(resolveRange({ from: '2026-11-01', to: '2026-11-03' }, now)).toEqual({
      from: '2026-11-01',
      to: '2026-11-03',
    });
    expect(() => resolveRange({ from: '2026-11-05', to: '2026-11-01' }, now)).toThrow('--from');
    expect(() => resolveRange({ from: 'x', to: '2026-11-01' }, now)).toThrow('YYYY-MM-DD');
    expect(() => resolveRange({ from: '2020-01-01', to: '2026-11-01' }, now)).toThrow('two years');
  });

  it('builds month ranges', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(() => monthRange('2026-13')).toThrow('YYYY-MM');
  });
});

describe('copilot api helpers', () => {
  it('reads statuses from errors', () => {
    expect(statusOf({ status: 403 })).toBe(403);
    expect(statusOf(new Error('x'))).toBeUndefined();
    expect(statusOf({ status: 'x' })).toBeUndefined();
    expect(new CopilotApiError('m', 500).status).toBe(500);
  });

  it('retries transient errors only', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 502 };
        return 'ok';
      },
      { baseDelayMs: 1 }
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);

    calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 404 };
        },
        { baseDelayMs: 1 }
      )
    ).rejects.toEqual({ status: 404 });
    expect(calls).toBe(1);

    await expect(
      withRetry(
        async () => {
          throw { status: 429 };
        },
        { baseDelayMs: 1, retries: 1 }
      )
    ).rejects.toEqual({ status: 429 });
  });

  it('runs work with limited concurrency, keeping order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it('sends the pinned API version and downloads without the token', async () => {
    const request = jest.fn(async () => ({ status: 200, data: { ok: true } }));
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, text: async () => 'body' }));
    const api = createCopilotApi(
      { request } as unknown as Octokit,
      fetchImpl as unknown as typeof fetch,
      { baseDelayMs: 1 }
    );
    expect(await api.request('GET /x', { a: 1 })).toEqual({ status: 200, data: { ok: true } });
    expect(request).toHaveBeenCalledWith('GET /x', {
      a: 1,
      headers: { 'X-GitHub-Api-Version': COPILOT_API_VERSION },
    });
    expect(await api.download('https://example.test/r?sig=1')).toBe('body');
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/r?sig=1', { redirect: 'follow' });
  });

  it('rejects plain HTTP and failed downloads', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 403, text: async () => '' }));
    const api = createCopilotApi(
      { request: jest.fn() } as unknown as Octokit,
      fetchImpl as unknown as typeof fetch,
      { baseDelayMs: 1 }
    );
    await expect(api.download('http://example.test/r')).rejects.toThrow('plain HTTP');
    await expect(api.download('https://example.test/r')).rejects.toThrow('403');
  });
});

describe('copilot scope paths', () => {
  const org = { kind: 'org' as const, org: 'acme' };
  const ent = { kind: 'enterprise' as const, enterprise: 'mega' };

  it('builds report, seat and billing paths', () => {
    expect(reportPath(org, 'scope-1-day')).toBe(
      'GET /orgs/acme/copilot/metrics/reports/organization-1-day'
    );
    expect(reportPath(ent, 'scope-1-day')).toBe(
      'GET /enterprises/mega/copilot/metrics/reports/enterprise-1-day'
    );
    expect(reportPath(ent, 'users-1-day')).toBe(
      'GET /enterprises/mega/copilot/metrics/reports/users-1-day'
    );
    expect(seatsPath(org)).toBe('GET /orgs/acme/copilot/billing/seats');
    expect(orgSettingsPath('acme')).toBe('GET /orgs/acme/copilot/billing');
    expect(billingUsagePath(org, 'ai_credit')).toBe(
      'GET /organizations/acme/settings/billing/ai_credit/usage'
    );
    expect(billingUsagePath(ent, 'premium_request')).toBe(
      'GET /enterprises/mega/settings/billing/premium_request/usage'
    );
    expect(costCentresPath('mega')).toBe('GET /enterprises/mega/settings/billing/cost-centers');
  });

  it('probes access and treats 401/403/404 as unavailable', async () => {
    const api = {
      request: jest.fn(async (route: string) => {
        if (route.includes('/metrics/')) throw { status: 422 };
        if (route.includes('/seats')) throw { status: 403 };
        if (route.includes('ai_credit')) throw { status: 404 };
        return { status: 200, data: {} };
      }),
      download: jest.fn(),
    };
    expect(await probeAccess(api as never, ent, '2026-11-01')).toEqual({
      metrics: true,
      seats: false,
      spend: true,
      costCentres: true,
    });
    expect((await probeAccess(api as never, org, '2026-11-01')).costCentres).toBe(false);
  });
});
