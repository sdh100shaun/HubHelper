import { describe, expect, it, jest } from '@jest/globals';
import {
  AccessLog,
  assertReadOnlySql,
  isReasonCode,
  loginDigest,
  MAX_REASON_LENGTH,
  pseudonym,
  ReasonRequiredError,
  resolveReason,
  sanitiseCommand,
  sqlReadsUserData,
  stripSql,
  validateReason,
} from '../services/copilot/access-control.js';
import { CopilotStore } from '../services/copilot/store/copilot-store.js';

const REASON = { code: 'enablement' as const, text: 'Follow up on agent mode training' };

describe('validateReason', () => {
  it('accepts a real reason and strips control characters', () => {
    expect(validateReason('  Licence\nreview\tfor Q4 \u0007 ')).toEqual({
      valid: true,
      sanitized: 'Licence review for Q4',
    });
  });

  it.each([
    [undefined, 'required'],
    ['too short', 'at least'],
    ['x'.repeat(MAX_REASON_LENGTH + 1), 'at most'],
    ['testing testing', 'real reason'],
    ['aaaaaaaaaaaa', 'real reason'],
    ['1234567890123', 'real reason'],
    ['Just because.', 'real reason'],
  ])('rejects %p', (input, message) => {
    const result = validateReason(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(message);
  });

  it('recognises reason codes', () => {
    expect(isReasonCode('cost-review')).toBe(true);
    expect(isReasonCode('curiosity')).toBe(false);
  });
});

describe('resolveReason', () => {
  it('uses the flag when given', async () => {
    await expect(
      resolveReason({ reason: REASON.text, reasonCode: 'enablement', interactive: false })
    ).resolves.toEqual(REASON);
  });

  it('fails without a reason when not interactive', async () => {
    await expect(resolveReason({ interactive: false })).rejects.toBeInstanceOf(ReasonRequiredError);
  });

  it('prompts in a terminal and validates the answer', async () => {
    const prompt = jest.fn(async () => 'Investigating unusual spend');
    await expect(resolveReason({ interactive: true, prompt })).resolves.toEqual({
      code: 'other',
      text: 'Investigating unusual spend',
    });
    await expect(resolveReason({ interactive: true, prompt: async () => 'no' })).rejects.toThrow(
      'at least'
    );
  });

  it('rejects unknown reason codes', async () => {
    await expect(
      resolveReason({ reason: REASON.text, reasonCode: 'nosy', interactive: false })
    ).rejects.toThrow('--reason-code');
  });
});

describe('sanitiseCommand', () => {
  it('redacts tokens and drops the reason text', () => {
    expect(
      sanitiseCommand([
        'copilot',
        'user',
        'alice',
        '--token',
        'ghp_secret',
        '--reason',
        'why',
        '--reason=why',
        '-t=ghp_x',
        'github_pat_ABC123',
      ])
    ).toBe('copilot user alice --token=<redacted> -t=<redacted> <redacted>');
  });
});

describe('login hashing', () => {
  it('is stable and case-insensitive', () => {
    expect(loginDigest('Alice')).toBe(loginDigest('alice'));
    expect(loginDigest('alice')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(pseudonym('alice')).toMatch(/^user-[0-9a-f]{8}$/);
    expect(pseudonym('alice')).not.toBe(pseudonym('bob'));
  });
});

describe('AccessLog', () => {
  function setup() {
    const store = CopilotStore.open(':memory:');
    const scopeId = store.ensureScope({ kind: 'org', org: 'acme' });
    return { store, scopeId, log: new AccessLog(store) };
  }

  it('records, lists and filters views', () => {
    const { log, scopeId } = setup();
    log.record({
      viewer: 'auditor',
      scopeId,
      command: 'copilot user alice',
      reason: REASON,
      subjects: [
        { login: 'alice', userId: 1 },
        { login: 'ALICE', userId: 1 },
      ],
      now: new Date('2026-11-01T00:00:00Z'),
    });
    log.record({
      viewer: 'manager',
      scopeId: null,
      command: 'copilot users',
      reason: { code: 'cost-review', text: 'Monthly cost review' },
      subjects: [{ login: 'bob' }, { login: 'carol' }],
      now: new Date('2026-11-03T00:00:00Z'),
    });
    expect(log.list()).toHaveLength(2);
    expect(log.list({ viewer: 'AUDITOR' })[0]).toMatchObject({
      viewer: 'auditor',
      scope: 'org:acme',
      reasonCode: 'enablement',
      subjects: ['ALICE'],
    });
    expect(log.list({ subject: 'carol' })[0].viewer).toBe('manager');
    expect(log.list({ since: '2026-11-02' })).toHaveLength(1);
    expect(log.list({ limit: 1 })[0].id).toBe(2);
    expect(log.recentViewsOf('bob')).toEqual([
      { viewedAt: '2026-11-03T00:00:00.000Z', viewer: 'manager', reasonCode: 'cost-review' },
    ]);
  });

  it('verifies the hash chain and detects edits', () => {
    const { store, log } = setup();
    expect(log.verify()).toEqual({ ok: true, checked: 0 });
    for (const viewer of ['a', 'b', 'c']) {
      log.record({
        viewer,
        scopeId: null,
        command: 'c',
        reason: REASON,
        subjects: [{ login: 'alice' }],
      });
    }
    expect(log.verify()).toEqual({ ok: true, checked: 3 });
    store.db.prepare("UPDATE access_batch SET reason = 'edited' WHERE id = 2").run();
    expect(log.verify()).toMatchObject({ ok: false, brokenAtId: 2 });
  });

  it('detects a deleted entry', () => {
    const { store, log } = setup();
    for (const viewer of ['a', 'b']) {
      log.record({
        viewer,
        scopeId: null,
        command: 'c',
        reason: REASON,
        subjects: [{ login: 'x' }],
      });
    }
    store.db.prepare('DELETE FROM access_batch WHERE id = 1').run();
    expect(log.verify().ok).toBe(false);
  });

  it('stays valid after a user is purged', () => {
    const { store, log } = setup();
    log.record({
      viewer: 'a',
      scopeId: null,
      command: 'c',
      reason: REASON,
      subjects: [{ login: 'Alice', userId: 1 }],
    });
    store.db
      .prepare("INSERT INTO users (id, login, first_seen, last_seen) VALUES (1, 'Alice', 'd', 'd')")
      .run();
    store.purgeUser('Alice', loginDigest('Alice'));
    expect(log.verify().ok).toBe(true);
    expect(log.list()[0].subjects).toEqual([loginDigest('alice')]);
  });

  it('rolls back on failure', () => {
    const { store, log } = setup();
    expect(() =>
      log.record({ viewer: 'a', scopeId: 9999, command: 'c', reason: REASON, subjects: [] })
    ).toThrow();
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM access_batch').get()).toEqual({ n: 0 });
  });
});

describe('SQL guard', () => {
  it('strips comments, strings and quoting', () => {
    const stripped = stripSql(`SELECT 'users' -- users\n FROM "user_day_metrics" /* x */`);
    expect(stripped).not.toContain('users');
    expect(stripped).toContain('FROM user_day_metrics');
    expect(stripped).not.toContain('/*');
    expect(stripSql('SELECT * FROM [users], `seat_day`')).toBe('SELECT * FROM users, seat_day');
  });

  it('detects per-user tables and views', () => {
    expect(sqlReadsUserData('SELECT * FROM v_daily_adoption')).toBe(false);
    expect(sqlReadsUserData("SELECT 'users' FROM v_feature_mix")).toBe(false);
    expect(sqlReadsUserData('select * from USER_DAY_METRICS')).toBe(true);
    expect(sqlReadsUserData('WITH x AS (SELECT * FROM "seat_day") SELECT * FROM x')).toBe(true);
    expect(sqlReadsUserData('SELECT * FROM v_idle_seats')).toBe(true);
  });

  it('allows only a single SELECT', () => {
    expect(() => assertReadOnlySql('SELECT 1;')).not.toThrow();
    expect(() => assertReadOnlySql('with a as (select 1) select * from a')).not.toThrow();
    expect(() => assertReadOnlySql("SELECT ';' AS x")).not.toThrow();
    expect(() => assertReadOnlySql('UPDATE users SET login = 1')).toThrow('Only SELECT');
    expect(() => assertReadOnlySql('SELECT 1; DELETE FROM users')).toThrow('one statement');
    expect(() => assertReadOnlySql('SELECT * FROM pragma_table_info(1)')).not.toThrow();
    expect(() => assertReadOnlySql('SELECT load_extension(1)')).toThrow('extensions');
    expect(() => assertReadOnlySql('WITH x AS (SELECT 1) SELECT 1; ATTACH x')).toThrow();
  });
});
