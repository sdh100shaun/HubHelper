import { describe, expect, it } from '@jest/globals';
import {
  classifyFeature,
  extractBreakdowns,
  extractFlags,
  normaliseOrgSettings,
  normaliseScopeDay,
  normaliseSeat,
  normaliseSpendItem,
  normaliseUserDay,
  normaliseUserTeam,
  parseRecords,
  scopeKey,
  scopeSlug,
} from '../types/copilot.js';

describe('copilot types', () => {
  it('builds scope keys and slugs', () => {
    expect(scopeKey({ kind: 'org', org: 'acme' })).toBe('org:acme');
    expect(scopeKey({ kind: 'enterprise', enterprise: 'mega' })).toBe('enterprise:mega');
    expect(scopeSlug({ kind: 'enterprise', enterprise: 'mega' })).toBe('mega');
  });

  describe('parseRecords', () => {
    it('parses NDJSON and counts invalid lines', () => {
      const result = parseRecords('{"a":1}\n\nnot json\n[1,2]\n{"b":2}\n');
      expect(result.records).toEqual([{ a: 1 }, { b: 2 }]);
      expect(result.invalid).toBe(2);
    });

    it('parses a JSON array', () => {
      expect(parseRecords('[{"a":1},5]')).toEqual({ records: [{ a: 1 }], invalid: 1 });
    });

    it('falls back to lines when the array is malformed', () => {
      expect(parseRecords('[{"a":1}').invalid).toBe(1);
    });

    it('returns nothing for an empty body', () => {
      expect(parseRecords('  ')).toEqual({ records: [], invalid: 0 });
    });
  });

  describe('extractBreakdowns', () => {
    it('flattens any totals_by_* array into dimension/key/metric rows', () => {
      const rows = extractBreakdowns({
        totals_by_language_feature: [
          { language: 'go', feature: 'chat', code_generation_activity_count: 3, note: 5 },
        ],
        totals_by_new_thing: [{ x: 1 }],
        totals_by_bad: 'nope',
        totals_by_skip: [null, 4],
      });
      expect(rows).toEqual([
        {
          dimension: 'language_feature',
          key: 'go',
          subKey: 'chat',
          metric: 'code_generation_activity_count',
          value: 3,
        },
        { dimension: 'language_feature', key: 'go', subKey: 'chat', metric: 'note', value: 5 },
        { dimension: 'new_thing', key: 'unknown', subKey: '', metric: 'x', value: 1 },
      ]);
    });
  });

  describe('extractFlags', () => {
    it('collects booleans, strings and arrays from flag-like fields', () => {
      expect(
        extractFlags({
          telemetry_gap: true,
          outdated_clients: ['vscode-1.80', { client: 'jetbrains' }, 3],
          data_quality: 'partial',
          other: true,
          flag_off: false,
        })
      ).toEqual([
        'telemetry_gap',
        'outdated_clients:vscode-1.80',
        'outdated_clients:jetbrains',
        'data_quality:partial',
      ]);
    });
  });

  it.each([
    ['code_completion', 'completions'],
    ['chat_panel_ask_mode', 'chat'],
    ['chat_panel_agent_mode', 'agent'],
    ['chat_panel_edit_mode', 'edits'],
    ['copilot_cli', 'cli'],
    ['code_review', 'code-review'],
    ['copilot_coding_agent', 'coding-agent'],
    ['something_new', 'other'],
  ])('classifies feature %s as %s', (feature, category) => {
    expect(classifyFeature(feature)).toBe(category);
  });

  describe('normaliseUserDay', () => {
    it('reads core counters and derives chat and agent turns from features', () => {
      const row = normaliseUserDay(
        {
          day: '2026-11-01T00:00:00Z',
          user_id: 7,
          user_login: 'alice',
          organization_login: 'acme',
          user_initiated_interaction_count: 5,
          code_generation_activity_count: 4,
          code_acceptance_activity_count: 2,
          loc_suggested_to_add_sum: 40,
          loc_added_sum: 20,
          ai_credits_used: 1.5,
          totals_by_feature: [
            { feature: 'chat_panel_ask_mode', user_initiated_interaction_count: 3 },
            { feature: 'chat_panel_agent_mode', user_initiated_interaction_count: 2 },
          ],
        },
        '2026-10-01'
      );
      expect(row).toMatchObject({
        day: '2026-11-01',
        userId: 7,
        login: 'alice',
        orgLogin: 'acme',
        interactions: 5,
        codeGen: 4,
        codeAccept: 2,
        locSuggested: 40,
        locAccepted: 20,
        chatTurns: 3,
        agentTurns: 2,
        aiCreditsUsed: 1.5,
      });
    });

    it('falls back to used_chat / used_agent flags and the given day', () => {
      const row = normaliseUserDay(
        { user_id: 1, login: 'bob', used_chat: true, used_agent: true, interaction_count: 2 },
        '2026-10-01'
      );
      expect(row).toMatchObject({
        day: '2026-10-01',
        chatTurns: 1,
        agentTurns: 1,
        interactions: 2,
      });
    });

    it('rejects rows without a user', () => {
      expect(normaliseUserDay({ user_login: 'x' }, '2026-10-01')).toBeNull();
    });
  });

  it('normalises scope days including nested PR counters', () => {
    const row = normaliseScopeDay(
      {
        day: '2026-11-02',
        enterprise_id: 99,
        daily_active_users: 4,
        pull_requests: { total_created: 3, label: 'x' },
        telemetry_gap: true,
      },
      '2026-01-01'
    );
    expect(row.metrics).toEqual({ daily_active_users: 4, 'pull_requests.total_created': 3 });
    expect(row.flags).toEqual(['telemetry_gap']);
    expect(row.day).toBe('2026-11-02');
  });

  it('normalises user-team rows', () => {
    expect(normaliseUserTeam({ user_id: 1, team_id: 2, team_slug: 'web' }, '2026-11-01')).toEqual({
      day: '2026-11-01',
      userId: 1,
      teamId: 2,
      teamSlug: 'web',
      teamName: 'web',
    });
    expect(normaliseUserTeam({ user_id: 1 }, '2026-11-01')).toBeNull();
  });

  it('normalises seats', () => {
    expect(
      normaliseSeat({
        assignee: { id: 3, login: 'carol' },
        organization: { login: 'acme' },
        assigning_team: { slug: 'web' },
        plan_type: 'business',
        last_activity_at: '2026-11-01T00:00:00Z',
      })
    ).toMatchObject({ userId: 3, login: 'carol', orgLogin: 'acme', assigningTeamSlug: 'web' });
    expect(normaliseSeat({})).toBeNull();
    expect(normaliseSeat({ assignee: { id: 0 } })).toBeNull();
  });

  it('normalises org settings keeping every string setting', () => {
    const s = normaliseOrgSettings('acme', {
      public_code_suggestions: 'block',
      seat_breakdown: { total: 1 },
      cli: 'enabled',
    });
    expect(s.publicCodeSuggestions).toBe('block');
    expect(s.all).toEqual({ public_code_suggestions: 'block', cli: 'enabled' });
  });

  it('normalises spend items with defaults', () => {
    expect(normaliseSpendItem({ grossQuantity: 3 }, { day: '2026-11-01' })).toEqual({
      day: '2026-11-01',
      userLogin: undefined,
      orgLogin: undefined,
      costCentreId: undefined,
      model: 'unknown',
      product: 'copilot',
      unit: 'requests',
      quantity: 3,
      grossAmount: 0,
      discountAmount: 0,
      netAmount: 0,
    });
  });
});
