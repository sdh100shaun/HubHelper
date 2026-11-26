/**
 * Synthetic Copilot API for tests: deterministic report rows, seats, settings,
 * spend, cost centres and coding agent PRs, served by a fake `CopilotApi`.
 */

import type { ApiResponse, CopilotApi } from '../../services/copilot/api.js';
import { dayRange } from '../../services/copilot/dates.js';

export interface FakeUser {
  id: number;
  login: string;
  org: string;
  team: { id: number; slug: string } | null;
  /** Active on days where (dayIndex % activeEvery) === 0; 0 means never. */
  activeEvery: number;
  ide: string;
  language: string;
  model: string;
  usesAgent: boolean;
}

export const FAKE_USERS: FakeUser[] = [
  {
    id: 1,
    login: 'alice',
    org: 'acme',
    team: { id: 10, slug: 'platform' },
    activeEvery: 1,
    ide: 'vscode',
    language: 'typescript',
    model: 'gpt-5',
    usesAgent: true,
  },
  {
    id: 2,
    login: 'bob',
    org: 'acme',
    team: { id: 10, slug: 'platform' },
    activeEvery: 2,
    ide: 'jetbrains',
    language: 'kotlin',
    model: 'claude-sonnet-4-6',
    usesAgent: false,
  },
  {
    id: 3,
    login: 'carol',
    org: 'acme',
    team: { id: 11, slug: 'web' },
    activeEvery: 1,
    ide: 'vscode',
    language: 'typescript',
    model: 'gpt-5',
    usesAgent: true,
  },
  {
    id: 4,
    login: 'dave',
    org: 'acme',
    team: { id: 11, slug: 'web' },
    activeEvery: 7,
    ide: 'vscode',
    language: 'python',
    model: 'gpt-5',
    usesAgent: false,
  },
  {
    id: 5,
    login: 'erin',
    org: 'acme',
    team: { id: 11, slug: 'web' },
    activeEvery: 1,
    ide: 'neovim',
    language: 'go',
    model: 'o4-mini',
    usesAgent: true,
  },
  {
    id: 6,
    login: 'frank',
    org: 'acme',
    team: null,
    activeEvery: 0,
    ide: 'vscode',
    language: 'python',
    model: 'gpt-5',
    usesAgent: false,
  },
  {
    id: 7,
    login: 'grace',
    org: 'labs',
    team: { id: 12, slug: 'data' },
    activeEvery: 1,
    ide: 'vscode',
    language: 'python',
    model: 'claude-sonnet-4-6',
    usesAgent: true,
  },
  {
    id: 8,
    login: 'heidi',
    org: 'labs',
    team: { id: 12, slug: 'data' },
    activeEvery: 3,
    ide: 'vscode',
    language: 'python',
    model: 'gpt-5',
    usesAgent: false,
  },
  {
    id: 9,
    login: 'ivan',
    org: 'labs',
    team: { id: 12, slug: 'data' },
    activeEvery: 1,
    ide: 'jetbrains',
    language: 'java',
    model: 'gpt-5',
    usesAgent: false,
  },
  {
    id: 10,
    login: 'judy',
    org: 'labs',
    team: null,
    activeEvery: 2,
    ide: 'opencode',
    language: 'rust',
    model: 'gpt-5',
    usesAgent: true,
  },
];

export interface FakeApiOptions {
  /** Days for which the report endpoint returns no links (suppressed). */
  suppressedDays?: string[];
  /** Days that return 404. */
  missingDays?: string[];
  /** Status thrown for every report request (e.g. 403). */
  reportStatus?: number;
  /** Status thrown for billing requests. */
  billingStatus?: number;
  /** Whether AI-credit billing exists (else premium requests). */
  aiCredits?: boolean;
  /** Users who also hold a seat in a second org. */
  duplicateSeat?: string[];
  /** Day that gets a telemetry gap flag. */
  flaggedDay?: string;
  /** Orgs whose settings return 403. */
  settingsDenied?: string[];
  publicCode?: Record<string, string>;
  today?: string;
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function dayIndex(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

export function isActive(user: FakeUser, day: string): boolean {
  return user.activeEvery > 0 && dayIndex(day) % user.activeEvery === 0;
}

function userRow(user: FakeUser, day: string, flagged: boolean): Record<string, unknown> {
  const active = isActive(user, day);
  const n = active ? 10 + (user.id % 5) : 0;
  return {
    day,
    user_id: user.id,
    user_login: user.login,
    organization_login: user.org,
    user_initiated_interaction_count: n,
    code_generation_activity_count: n * 2,
    code_acceptance_activity_count: n,
    loc_suggested_to_add_sum: n * 10,
    loc_added_sum: n * 4,
    used_chat: active,
    used_agent: active && user.usesAgent,
    ai_credits_used: active ? (user.usesAgent ? 3 : 1) : 0,
    totals_by_ide: [
      {
        ide: user.ide,
        user_initiated_interaction_count: n,
        code_generation_activity_count: n * 2,
        code_acceptance_activity_count: n,
      },
    ],
    totals_by_feature: [
      {
        feature: 'code_completion',
        user_initiated_interaction_count: 0,
        code_generation_activity_count: n * 2,
        code_acceptance_activity_count: n,
      },
      {
        feature: 'chat_panel_ask_mode',
        user_initiated_interaction_count: active ? n - (user.usesAgent ? 2 : 0) : 0,
        code_generation_activity_count: 0,
        code_acceptance_activity_count: 0,
      },
      ...(user.usesAgent
        ? [
            {
              feature: 'chat_panel_agent_mode',
              user_initiated_interaction_count: active ? 2 : 0,
              code_generation_activity_count: 0,
              code_acceptance_activity_count: 0,
            },
          ]
        : []),
    ],
    totals_by_language_feature: [
      {
        language: user.language,
        feature: 'code_completion',
        code_generation_activity_count: n * 2,
        code_acceptance_activity_count: n,
      },
    ],
    totals_by_model_feature: [
      { model: user.model, feature: 'chat_panel_ask_mode', user_initiated_interaction_count: n },
    ],
    totals_by_client:
      user.ide === 'opencode' ? [{ client: 'opencode', user_initiated_interaction_count: n }] : [],
    ...(flagged ? { telemetry_gap: true } : {}),
  };
}

export function createFakeApi(options: FakeApiOptions = {}): CopilotApi & { calls: string[] } {
  const calls: string[] = [];
  const blobs = new Map<string, string>();
  const users = FAKE_USERS;

  const respond = <T>(data: T, status = 200): ApiResponse<T> => ({ status, data });

  return {
    calls,
    async request<T>(route: string, params: Record<string, unknown> = {}): Promise<ApiResponse<T>> {
      calls.push(route);
      const day = typeof params.day === 'string' ? params.day : undefined;
      const scopeOrgs = route.includes('/enterprises/')
        ? null
        : route.match(/\/orgs\/([^/]+)/)?.[1];
      const inScope = (u: FakeUser) => !scopeOrgs || u.org === scopeOrgs;

      if (route.includes('/copilot/metrics/reports/')) {
        if (options.reportStatus) throw new HttpError(options.reportStatus);
        if (day && options.missingDays?.includes(day)) throw new HttpError(404);
        if (day && options.suppressedDays?.includes(day))
          return respond({ download_links: [] } as T);
        const kind = route.split('/').pop() ?? '';
        const flagged = day === options.flaggedDay;
        let rows: Record<string, unknown>[] = [];
        const scoped = users.filter(inScope);
        if (kind === 'users-1-day') rows = scoped.map((u) => userRow(u, day!, flagged));
        else if (kind === 'user-teams-1-day') {
          rows = scoped
            .filter((u) => u.team)
            .map((u) => ({
              day,
              user_id: u.id,
              team_id: u.team!.id,
              team_slug: u.team!.slug,
              team_name: u.team!.slug,
            }));
        } else {
          const active = scoped.filter((u) => isActive(u, day!)).length;
          rows = [
            {
              day,
              daily_active_users: active,
              monthly_active_users: scoped.length,
              ...(flagged ? { telemetry_gap: true } : {}),
            },
          ];
        }
        const url = `https://reports.example.test/${kind}/${day}?sig=secret`;
        blobs.set(url, rows.map((r) => JSON.stringify(r)).join('\n'));
        return respond({ download_links: [url], report_day: day } as T);
      }

      if (route.endsWith('/copilot/billing/seats')) {
        const page = Number(params.page ?? 1);
        if (page > 1) return respond({ seats: [] } as T);
        const seats = users.filter(inScope).flatMap((u) => {
          const base = {
            assignee: { id: u.id, login: u.login, type: 'User' },
            organization: { login: u.org },
            assigning_team: u.team ? { slug: u.team.slug, id: u.team.id } : null,
            plan_type: 'business',
            created_at: '2026-01-01T00:00:00Z',
            last_activity_at:
              u.activeEvery === 0 ? null : `${options.today ?? '2026-11-25'}T10:00:00Z`,
            last_activity_editor: `${u.ide}/1.0`,
          };
          return options.duplicateSeat?.includes(u.login) && !scopeOrgs
            ? [base, { ...base, organization: { login: u.org === 'acme' ? 'labs' : 'acme' } }]
            : [base];
        });
        return respond({ total_seats: seats.length, seats } as T);
      }

      const settingsMatch = route.match(/^GET \/orgs\/([^/]+)\/copilot\/billing$/);
      if (settingsMatch) {
        const org = settingsMatch[1];
        if (options.settingsDenied?.includes(org)) throw new HttpError(403);
        return respond({
          seat_management_setting: 'assign_selected',
          public_code_suggestions: options.publicCode?.[org] ?? 'block',
          ide_chat: 'enabled',
          cli: 'enabled',
          seat_breakdown: { total: 5 },
        } as T);
      }

      if (route.includes('/settings/billing/ai_credit/usage')) {
        if (options.billingStatus) throw new HttpError(options.billingStatus);
        if (options.aiCredits === false) throw new HttpError(404);
        return respond({
          usageItems: [
            {
              product: 'Copilot',
              model: 'gpt-5',
              unitType: 'ai-credits',
              netQuantity: 20,
              grossAmount: 0.8,
              discountAmount: 0,
              netAmount: 0.8,
            },
            {
              product: 'Copilot',
              model: 'claude-sonnet-4-6',
              unitType: 'ai-credits',
              netQuantity: 10,
              grossAmount: 0.4,
              discountAmount: 0,
              netAmount: 0.4,
            },
            {
              product: 'Actions',
              model: 'n/a',
              unitType: 'minutes',
              netQuantity: 100,
              netAmount: 1,
            },
          ],
        } as T);
      }
      if (route.includes('/settings/billing/premium_request/usage')) {
        if (options.billingStatus) throw new HttpError(options.billingStatus);
        return respond({
          usageItems: [
            {
              product: 'Copilot',
              model: 'gpt-5',
              unitType: 'requests',
              grossQuantity: 30,
              netAmount: 1.2,
            },
          ],
        } as T);
      }
      if (route.includes('/settings/billing/cost-centers')) {
        return respond({
          costCenters: [
            {
              id: 'cc-1',
              name: 'Platform',
              resources: [
                { type: 'User', name: 'alice' },
                { type: 'User', name: 'bob' },
              ],
            },
            { id: 'cc-2', name: 'Labs', resources: [{ type: 'Org', name: 'labs' }] },
          ],
        } as T);
      }

      if (route === 'GET /search/issues') {
        const org = String(params.q).match(/org:(\S+)/)?.[1];
        if (org !== 'acme') return respond({ items: [] } as T);
        return respond({
          items: [
            {
              number: 41,
              title: 'Add retry to fetcher',
              html_url: 'https://github.com/acme/api/pull/41',
              repository_url: 'https://api.github.com/repos/acme/api',
              created_at: '2026-11-10T09:00:00Z',
              assignees: [
                { login: 'Copilot', type: 'Bot' },
                { login: 'alice', type: 'User' },
              ],
              pull_request: { merged_at: '2026-11-10T15:00:00Z' },
            },
            {
              number: 42,
              title: 'Bump dependency',
              html_url: 'https://github.com/acme/api/pull/42',
              repository_url: 'https://api.github.com/repos/acme/api',
              created_at: '2026-11-12T09:00:00Z',
              assignees: [{ login: 'carol', type: 'User' }],
              pull_request: { merged_at: '2026-11-12T11:00:00Z' },
            },
            {
              number: 43,
              title: 'Draft refactor',
              html_url: 'https://github.com/acme/web/pull/43',
              repository_url: 'https://api.github.com/repos/acme/web',
              created_at: '2026-11-14T09:00:00Z',
              assignees: [{ login: 'alice', type: 'User' }],
              pull_request: { merged_at: null },
            },
          ],
        } as T);
      }
      if (route === 'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews') {
        const reviews =
          params.pull_number === 41
            ? [{ user: { login: 'bob', type: 'User' }, state: 'APPROVED' }]
            : [
                {
                  user: { login: 'copilot-pull-request-reviewer[bot]', type: 'Bot' },
                  state: 'APPROVED',
                },
              ];
        return respond(reviews as T);
      }
      throw new HttpError(404);
    },
    async download(url: string): Promise<string> {
      const body = blobs.get(url);
      if (body === undefined) throw new HttpError(403);
      return body;
    },
  };
}

export const FIXTURE_RANGE = { from: '2026-10-28', to: '2026-11-24' };
export const FIXTURE_DAYS = dayRange(FIXTURE_RANGE.from, FIXTURE_RANGE.to);
export const FIXTURE_NOW = new Date('2026-11-25T12:00:00Z');

/** Build an in-memory store populated by a full sync against the fake API. */
export async function buildFixtureStore(
  scope: import('../../types/copilot.js').CopilotScope,
  options: FakeApiOptions = {}
): Promise<{
  store: import('../../services/copilot/store/copilot-store.js').CopilotStore;
  api: ReturnType<typeof createFakeApi>;
  summary: import('../../services/copilot/sync-service.js').SyncSummary;
}> {
  const { CopilotStore } = await import('../../services/copilot/store/copilot-store.js');
  const { CopilotSyncService } = await import('../../services/copilot/sync-service.js');
  const store = CopilotStore.open(':memory:');
  const api = createFakeApi(options);
  const summary = await new CopilotSyncService(api, store, () => FIXTURE_NOW).sync(scope, {
    range: FIXTURE_RANGE,
  });
  return { store, api, summary };
}
