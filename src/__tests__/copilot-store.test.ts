import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { CopilotStore } from '../services/copilot/store/copilot-store.js';
import { loadSqlite, openDatabase, withTransaction } from '../services/copilot/store/database.js';
import { currentVersion, MIGRATIONS, migrate } from '../services/copilot/store/migrations.js';
import type { NormalisedUserDay } from '../types/copilot.js';

const ORG = { kind: 'org' as const, org: 'acme' };

function user(
  day: string,
  userId: number,
  login: string,
  extra: Partial<NormalisedUserDay> = {}
): NormalisedUserDay {
  return {
    day,
    userId,
    login,
    orgLogin: 'acme',
    interactions: 2,
    codeGen: 4,
    codeAccept: 2,
    locSuggested: 10,
    locAccepted: 5,
    chatTurns: 1,
    agentTurns: 0,
    aiCreditsUsed: 1,
    breakdowns: [
      {
        dimension: 'ide',
        key: 'vscode',
        subKey: '',
        metric: 'code_generation_activity_count',
        value: 4,
      },
    ],
    flags: [],
    ...extra,
  };
}

describe('Copilot database', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('loads node:sqlite once and suppresses only its warning', () => {
    expect(loadSqlite()).toBe(loadSqlite());
  });

  it('creates files with private permissions and applies migrations', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'hh-copilot-'));
    dirs.push(dir);
    const file = path.join(dir, 'nested', 'copilot.db');
    const store = CopilotStore.open(file);
    expect(currentVersion(store.db)).toBe(MIGRATIONS.length);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(store.status().sizeBytes).toBeGreaterThan(0);
    store.close();
    const readOnly = CopilotStore.open(file, { readOnly: true });
    expect(() => readOnly.db.exec('DELETE FROM users')).toThrow();
    readOnly.close();
  });

  it('refuses to open a missing file read-only', () => {
    expect(() => openDatabase('/nonexistent/dir/x.db', { readOnly: true })).toThrow('copilot sync');
  });

  it('rejects a schema newer than this version and is idempotent', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toEqual([1]);
    expect(migrate(db)).toEqual([]);
    db.exec('PRAGMA user_version = 99');
    expect(() => migrate(db)).toThrow('newer');
    db.close();
  });

  it('rolls back failed transactions', () => {
    const db = openDatabase(':memory:');
    db.exec('CREATE TABLE t (x INTEGER)');
    expect(() =>
      withTransaction(db, () => {
        db.exec('INSERT INTO t VALUES (1)');
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) AS n FROM t').get()).toEqual({ n: 0 });
    db.close();
  });
});

describe('CopilotStore', () => {
  it('tracks scopes and missing days', () => {
    const store = CopilotStore.open(':memory:');
    expect(store.getScopeId(ORG)).toBeUndefined();
    const id = store.ensureScope(ORG);
    expect(store.ensureScope(ORG)).toBe(id);
    store.markDay(id, 'users-1-day', '2026-11-01', 'ok', { rowCount: 3 });
    store.markDay(id, 'users-1-day', '2026-11-02', 'suppressed');
    store.markDay(id, 'users-1-day', '2026-11-03', 'error', { error: 'x' });
    expect(
      store.missingDays(id, 'users-1-day', ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])
    ).toEqual(['2026-11-03', '2026-11-04']);
    expect(store.missingDays(id, 'users-1-day', [])).toEqual([]);
    expect(store.dayStatuses(id, 'users-1-day', '2026-11-01', '2026-11-03').get('2026-11-02')).toBe(
      'suppressed'
    );
    const run = store.startSyncRun(id);
    store.finishSyncRun(run, 'partial', 'warn');
    expect(store.db.prepare('SELECT status FROM sync_runs').get()).toEqual({ status: 'partial' });
  });

  it('replaces a day on re-ingest instead of duplicating rows', () => {
    const store = CopilotStore.open(':memory:');
    const id = store.ensureScope(ORG);
    store.ingestUserDays(id, '2026-11-01', [{ user_id: 1 }], [user('2026-11-01', 1, 'alice')]);
    store.ingestUserDays(
      id,
      '2026-11-01',
      [{ user_id: 1 }],
      [user('2026-11-01', 1, 'alice', { interactions: 9 })]
    );
    expect(
      store.db.prepare('SELECT COUNT(*) AS n, SUM(interactions) AS i FROM user_day_metrics').get()
    ).toEqual({
      n: 1,
      i: 9,
    });
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM user_day_breakdown').get()).toEqual({
      n: 1,
    });
  });

  it('keeps the newest login for a renamed user', () => {
    const store = CopilotStore.open(':memory:');
    const id = store.ensureScope(ORG);
    store.ingestUserDays(id, '2026-11-02', [], [user('2026-11-02', 1, 'alice-new')]);
    store.ingestUserDays(id, '2026-11-01', [], [user('2026-11-01', 1, 'alice-old')]);
    expect(store.db.prepare('SELECT login, first_seen, last_seen FROM users').get()).toEqual({
      login: 'alice-new',
      first_seen: '2026-11-01',
      last_seen: '2026-11-02',
    });
    expect(store.findUserId('ALICE-NEW')).toBe(1);
    expect(store.findUserId('nobody')).toBeUndefined();
  });

  it('ingests scope days, teams, seats, settings, spend, cost centres and agent PRs', () => {
    const store = CopilotStore.open(':memory:');
    const id = store.ensureScope(ORG);
    store.ingestScopeDay(
      id,
      '2026-11-01',
      [{}],
      [
        {
          day: '2026-11-01',
          metrics: { daily_active_users: 3 },
          breakdowns: [{ dimension: 'ide', key: 'vscode', subKey: '', metric: 'm', value: 2 }],
          flags: ['telemetry_gap'],
        },
      ]
    );
    store.ingestUserTeams(
      id,
      '2026-11-01',
      [],
      [{ day: '2026-11-01', userId: 1, teamId: 5, teamSlug: 'web', teamName: 'Web' }]
    );
    store.ingestSeats(id, '2026-11-01', [{ userId: 1, login: 'alice', orgLogin: 'acme' }]);
    store.ingestOrgSettings(id, '2026-11-01', [{ orgLogin: 'acme', all: { cli: 'enabled' } }]);
    store.ingestSpend(
      id,
      ['2026-11-01'],
      [
        {
          day: '2026-11-01',
          model: 'gpt-5',
          product: 'copilot',
          unit: 'ai-credits',
          quantity: 2,
          grossAmount: 1,
          discountAmount: 0,
          netAmount: 1,
        },
      ]
    );
    store.ingestSpend(id, ['2026-11-01'], []);
    store.ingestCostCentres(id, [{ id: 'c1', name: 'Platform', users: ['alice'], orgs: ['acme'] }]);
    store.ingestAgentPrs(id, [
      {
        repo: 'acme/api',
        number: 1,
        orgLogin: 'acme',
        title: 't',
        url: 'u',
        openedAt: '2026-11-01T00:00:00Z',
        humanApproved: false,
        reviewers: [],
      },
    ]);
    store.saveFindings(id, [{ type: 'x', severity: 'low', subject: 's', description: 'd' }]);
    const count = (table: string) =>
      (store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count('scope_day_metrics')).toBe(1);
    expect(count('scope_day_flags')).toBe(1);
    expect(count('teams')).toBe(1);
    expect(count('seat_day')).toBe(1);
    expect(count('org_settings_day')).toBe(1);
    expect(count('spend_day')).toBe(0);
    expect(count('cost_centre_members')).toBe(2);
    expect(count('agent_prs')).toBe(1);
    expect(count('findings')).toBe(1);
    expect(store.status().scopes[0]).toMatchObject({ kind: 'org', slug: 'acme' });
    store.vacuum();
  });

  it('caches AI summaries per subject', () => {
    const store = CopilotStore.open(':memory:');
    const id = store.ensureScope(ORG);
    store.cacheSummary(id, 'scope', 'one');
    store.cacheSummary(id, 'user', 'about alice', 1);
    expect(store.latestSummary(id, 'scope')?.content).toBe('one');
    expect(store.latestSummary(id, 'user', 1)?.content).toBe('about alice');
    expect(store.latestSummary(id, 'user', 2)).toBeUndefined();
  });

  it('applies retention to per-user rows only', () => {
    const store = CopilotStore.open(':memory:');
    const id = store.ensureScope(ORG);
    store.ingestUserDays(id, '2025-01-01', [{ user_id: 1 }], [user('2025-01-01', 1, 'alice')]);
    store.ingestUserDays(id, '2026-11-01', [], [user('2026-11-01', 1, 'alice')]);
    store.ingestScopeDay(
      id,
      '2025-01-01',
      [],
      [{ day: '2025-01-01', metrics: { a: 1 }, breakdowns: [], flags: [] }]
    );
    const removed = store.applyRetention(400, '2026-11-25');
    expect(removed).toBe(3);
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM scope_day_metrics').get()).toEqual({ n: 1 });
  });

  it('purges one user everywhere, including raw payloads', () => {
    const store = CopilotStore.open(':memory:');
    const id = store.ensureScope(ORG);
    store.ingestUserDays(
      id,
      '2026-11-01',
      [{ user_id: 1 }, { user_id: 2 }],
      [user('2026-11-01', 1, 'alice'), user('2026-11-01', 2, 'bob')]
    );
    store.ingestSpend(
      id,
      ['2026-11-01'],
      [
        {
          day: '2026-11-01',
          userLogin: 'alice',
          model: 'm',
          product: 'p',
          unit: 'u',
          quantity: 1,
          grossAmount: 0,
          discountAmount: 0,
          netAmount: 0,
        },
      ]
    );
    store.cacheSummary(id, 'user', 'x', 1);
    store.db
      .prepare(
        "INSERT INTO access_batch (viewed_at, viewer, command, reason_code, reason, prev_hash, row_hash) VALUES ('t','v','c','other','r','p','h')"
      )
      .run();
    store.db
      .prepare(
        "INSERT INTO access_log (batch_id, subject_user_id, subject_login) VALUES (1, 1, 'alice')"
      )
      .run();

    expect(store.purgeUser('nobody', 'h')).toBe(0);
    const removed = store.purgeUser('alice', 'sha256:abc');
    expect(removed).toBeGreaterThan(0);
    expect(store.findUserId('alice')).toBeUndefined();
    expect(store.findUserId('bob')).toBe(2);
    const raw = store.db.prepare('SELECT payload_json FROM raw_reports').get() as {
      payload_json: string;
    };
    expect(JSON.parse(raw.payload_json)).toEqual([{ user_id: 2 }]);
    expect(store.db.prepare('SELECT subject_login, subject_user_id FROM access_log').get()).toEqual(
      {
        subject_login: 'sha256:abc',
        subject_user_id: null,
      }
    );
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM ai_summaries').get()).toEqual({ n: 0 });
  });
});
