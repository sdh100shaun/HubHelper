import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  buildCopilotCommand,
  CliError,
  type CopilotCliDeps,
  defaultDeps,
  parseRange,
  parseScope,
  resolveDbPath,
} from '../cli/copilot-command.js';
import { CopilotInsightsService } from '../services/copilot/insights-service.js';
import { CopilotStore } from '../services/copilot/store/copilot-store.js';
import { createFakeApi, type FakeApiOptions, FIXTURE_NOW } from './helpers/copilot-fixtures.js';

jest.mock('@github/copilot-sdk', () => ({
  CopilotClient: jest.fn(),
  approveAll: jest.fn(),
  defineTool: jest.fn((name: string, opts: Record<string, unknown>) => ({ name, ...opts })),
}));

const REASON = ['--reason', 'Quarterly licence review', '--reason-code', 'licence-review'];
const ENT = ['--enterprise', 'mega'];

let workDir: string;
let originalCwd: string;
let dbCounter = 0;

beforeAll(() => {
  originalCwd = process.cwd();
  workDir = mkdtempSync(path.join(os.tmpdir(), 'hh-copilot-cli-'));
  cpSync(path.join(originalCwd, 'policies'), path.join(workDir, 'policies'), { recursive: true });
  process.chdir(workDir);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
});

afterEach(() => {
  process.exitCode = undefined;
});

interface Harness {
  deps: CopilotCliDeps;
  out: string[];
  err: string[];
  files: Map<string, string>;
  db: string;
  run: (...args: string[]) => Promise<{ out: string; err: string; code: number }>;
}

function harness(
  options: {
    api?: FakeApiOptions;
    interactive?: boolean;
    reply?: string;
    prompt?: string;
    confirm?: boolean;
    db?: string;
  } = {}
): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const files = new Map<string, string>();
  const db = options.db ?? path.join(workDir, `t${++dbCounter}.db`);
  const api = createFakeApi(options.api);
  let argv: string[] = [];
  const deps: CopilotCliDeps = {
    ...defaultDeps(),
    resolveAuth: () => ({ mode: 'pat', token: 'ghp_test' }),
    createApi: () => api,
    resolveViewer: async () => 'auditor',
    createInsights: () =>
      new CopilotInsightsService({
        clientFactory: () =>
          ({
            start: async () => {},
            stop: async () => [],
            createSession: async () => ({
              sendAndWait: async () =>
                options.reply ? { data: { content: options.reply } } : undefined,
              disconnect: async () => {},
            }),
          }) as never,
      }),
    now: () => FIXTURE_NOW,
    stdout: (t) => {
      out.push(t);
    },
    stderr: (t) => {
      err.push(t);
    },
    writeFile: (f, c) => {
      files.set(f, c);
    },
    isInteractive: () => options.interactive === true,
    prompt: async () => options.prompt ?? '',
    confirm: async () => options.confirm === true,
    argv: () => argv,
    env: {},
  };
  return {
    deps,
    out,
    err,
    files,
    db,
    run: async (...args: string[]) => {
      out.length = 0;
      err.length = 0;
      argv = ['copilot', ...args];
      process.exitCode = undefined;
      const cmd = buildCopilotCommand(deps);
      cmd.exitOverride();
      await cmd.parseAsync([
        'node',
        'copilot',
        ...args,
        ...(args.includes('--db') || args[0] === 'db' ? [] : ['--db', db]),
      ]);
      return { out: out.join(''), err: err.join(''), code: Number(process.exitCode ?? 0) };
    },
  };
}

async function synced(options: Parameters<typeof harness>[0] = {}) {
  const h = harness(options);
  await h.run('sync', ...ENT);
  return h;
}

describe('option parsing', () => {
  it('parses scopes from flags and the environment', () => {
    expect(parseScope({ org: 'acme' }, {})).toEqual({ kind: 'org', org: 'acme' });
    expect(parseScope({}, { GITHUB_ORG: 'acme' })).toEqual({ kind: 'org', org: 'acme' });
    expect(parseScope({}, { GITHUB_ENTERPRISE: 'mega', GITHUB_ORG: 'acme' })).toEqual({
      kind: 'enterprise',
      enterprise: 'mega',
      orgs: undefined,
    });
    expect(parseScope({ enterprise: 'mega', orgs: 'a, b' }, {})).toEqual({
      kind: 'enterprise',
      enterprise: 'mega',
      orgs: ['a', 'b'],
    });
    expect(() => parseScope({ org: 'a', enterprise: 'b' }, {})).toThrow('either');
    expect(() => parseScope({}, {})).toThrow('--org');
    expect(() => parseScope({ org: 'a', orgs: 'b' }, {})).toThrow('--orgs');
    expect(() => parseScope({ org: '-bad-' }, {})).toThrow(CliError);
  });

  it('parses ranges', () => {
    expect(parseRange({}, FIXTURE_NOW)).toEqual({ from: '2026-10-28', to: '2026-11-24' });
    expect(parseRange({ days: '7' }, FIXTURE_NOW).from).toBe('2026-11-18');
    expect(() => parseRange({ days: 'x' }, FIXTURE_NOW)).toThrow('whole number');
    expect(() => parseRange({ days: '0' }, FIXTURE_NOW)).toThrow('between');
    expect(() => parseRange({ from: '2026-13-01' }, FIXTURE_NOW)).toThrow('--from');
    expect(() => parseRange({ from: '2026-11-10', to: '2026-11-01' }, FIXTURE_NOW)).toThrow(
      'on or before'
    );
  });

  it('resolves database paths', () => {
    expect(resolveDbPath(undefined, {})).toContain(path.join('.hubhelper', 'copilot.db'));
    expect(resolveDbPath(undefined, { HUBHELPER_COPILOT_DB: 'x.sqlite' })).toBe(
      path.resolve('x.sqlite')
    );
    expect(() => resolveDbPath('x.txt', {})).toThrow('.db');
    expect(() => resolveDbPath('x\0.db', {})).toThrow('Invalid');
  });
});

describe('copilot sync and usage', () => {
  it('syncs and prints a summary', async () => {
    const h = harness();
    const r = await h.run('sync', ...ENT, '--retention-days', '400');
    expect(r.code).toBe(0);
    expect(r.out).toContain('Sync complete');
    expect(r.err).toContain('Fetching seats');
    expect((await h.run('sync', ...ENT, '--retention-days', '5')).err).toContain('at least 30');
  });

  it('reports a clear error without credentials', async () => {
    const h = harness();
    h.deps.resolveAuth = () => {
      throw new Error('GITHUB_TOKEN missing');
    };
    const r = await h.run('usage', ...ENT);
    expect(r.code).toBe(1);
    expect(r.err).toContain('--offline');
  });

  it('shows usage in each format', async () => {
    const h = await synced();
    expect((await h.run('usage', ...ENT, '--offline')).out).toContain(
      'Copilot usage · enterprise mega'
    );
    const json = JSON.parse(
      (await h.run('usage', ...ENT, '--offline', '--format', 'json', '--by', 'org')).out
    );
    expect(json.rows.map((r: { org: string }) => r.org).sort()).toEqual(['acme', 'labs']);
    expect(
      (await h.run('usage', ...ENT, '--offline', '--format', 'csv', '--by', 'ide')).out.split(
        '\n'
      )[0]
    ).toBe('ide,users,interactions,code_generations,code_acceptances,acceptance_rate');
    expect(
      (await h.run('usage', ...ENT, '--offline', '--format', 'md', '--by', 'team', '--team', 'web'))
        .out
    ).toContain('| web |');
    const html = await h.run('usage', ...ENT, '--offline', '--format', 'html');
    expect(html.out).toContain('<!doctype html>');
    expect(html.out).not.toContain('>alice<');
    await h.run('usage', ...ENT, '--offline', '--format', 'console', '--output', 'out/usage.txt');
    expect([...h.files.keys()][0]).toBe(path.join(workDir, 'out', 'usage.txt'));
    expect((await h.run('usage', ...ENT, '--offline', '--format', 'xml')).err).toContain(
      '--format'
    );
    expect((await h.run('usage', ...ENT, '--offline', '--output', '../escape.txt')).err).toContain(
      'Invalid --output'
    );
  });

  it('needs a reason for usage --user', async () => {
    const h = await synced();
    expect((await h.run('usage', ...ENT, '--offline', '--user', 'alice')).err).toContain(
      '--reason'
    );
    expect((await h.run('usage', ...ENT, '--offline', '--user', 'alice', ...REASON)).out).toContain(
      'alice ·'
    );
  });

  it('fails cleanly offline with no data', async () => {
    const r = await harness().run('usage', '--org', 'acme', '--offline');
    expect(r.err).toContain('copilot sync');
  });
});

describe('copilot seats, spend and users', () => {
  it('requires a reason for named seats, or --anonymise', async () => {
    const h = await synced();
    expect((await h.run('seats', ...ENT, '--offline')).code).toBe(1);
    const anon = await h.run('seats', ...ENT, '--offline', '--anonymise', '--format', 'json');
    expect(anon.out).not.toContain('alice');
    const named = await h.run('seats', ...ENT, '--offline', '--idle', '--format', 'csv', ...REASON);
    expect(named.out).toContain('frank');
    expect(named.out).toContain('# Individual data viewed by auditor');
    expect((await h.run('seats', ...ENT, '--offline', '--inactive-days', 'x')).err).toContain(
      'whole number'
    );
  });

  it('reports spend and needs a reason only for --by user', async () => {
    const h = await synced();
    const r = await h.run('spend', ...ENT, '--offline', '--month', '2026-11', '--budget', '10');
    expect(r.out).toContain('(over)');
    expect((await h.run('spend', ...ENT, '--offline', '--by', 'user')).code).toBe(1);
    const users = await h.run(
      'spend',
      ...ENT,
      '--offline',
      '--by',
      'user',
      '--format',
      'json',
      ...REASON
    );
    expect(JSON.parse(users.out).access.viewer).toBe('auditor');
    const anon = await h.run(
      'spend',
      ...ENT,
      '--offline',
      '--by',
      'user',
      '--anonymise',
      '--format',
      'csv'
    );
    expect(anon.out).not.toContain('alice');
    expect((await h.run('spend', ...ENT, '--offline', '--month', '2026-13')).err).toContain(
      'YYYY-MM'
    );
    expect((await h.run('spend', ...ENT, '--offline', '--budget', '-1')).err).toContain('positive');
    expect((await h.run('spend', ...ENT, '--offline', '--month', '2026-12')).code).toBe(0);
  });

  it('lists users with a reason and logs the access', async () => {
    const h = await synced();
    expect((await h.run('users', ...ENT, '--offline')).code).toBe(1);
    const r = await h.run(
      'users',
      ...ENT,
      '--offline',
      '--sort',
      'spend',
      '--limit',
      '3',
      '--format',
      'md',
      ...REASON
    );
    expect(r.out).toContain('| login |');
    expect((await h.run('users', ...ENT, '--offline', '--limit', '0', ...REASON)).err).toContain(
      '--limit'
    );
    const log = await h.run('db', 'access-log', '--db', h.db, '--format', 'json');
    expect(JSON.parse(log.out)[0]).toMatchObject({
      viewer: 'auditor',
      reasonCode: 'licence-review',
    });
  });

  it('prompts for a reason in a terminal', async () => {
    const h = await synced({ interactive: true, prompt: 'Helping the web team adopt agent mode' });
    const r = await h.run('users', ...ENT, '--offline', '--format', 'csv');
    expect(r.code).toBe(0);
    expect(r.out).toContain('login,');
  });
});

describe('copilot user', () => {
  it('shows a profile in every format and logs both people when comparing', async () => {
    const h = await synced({ reply: '{"summary":"Uses chat daily","next_steps":["Try edits"]}' });
    const consoleOut = await h.run(
      'user',
      'alice',
      ...ENT,
      '--offline',
      '--days',
      '28',
      '--summarise',
      ...REASON
    );
    expect(consoleOut.out).toContain('Uses chat daily');
    expect(consoleOut.out).toContain('Recent views');
    const json = JSON.parse(
      (
        await h.run(
          'user',
          'alice',
          ...ENT,
          '--offline',
          '--format',
          'json',
          '--compare',
          'dave',
          ...REASON
        )
      ).out
    );
    expect(json.comparison[0].metric).toBe('active days');
    expect(json.access.reasonCode).toBe('licence-review');
    expect(
      (await h.run('user', 'alice', ...ENT, '--offline', '--format', 'csv', ...REASON)).out
    ).toContain('field,value');
    const md = await h.run(
      'user',
      'alice',
      ...ENT,
      '--offline',
      '--format',
      'md',
      '--compare-period',
      '2026-10-28:2026-11-10',
      ...REASON
    );
    expect(md.out).toContain('Comparison: 2026-08-27..2026-11-24 vs 2026-10-28..2026-11-10');
    const html = await h.run('user', 'alice', ...ENT, '--offline', '--format', 'html', ...REASON);
    expect(html.out).toContain('data-open="user-alice"');
    expect(
      (await h.run('user', 'alice', ...ENT, '--offline', '--compare', 'dave', ...REASON)).out
    ).toContain('Comparison: alice vs dave');
    const log = await h.run(
      'db',
      'access-log',
      '--db',
      h.db,
      '--subject',
      'dave',
      '--format',
      'csv'
    );
    expect(log.out).toContain('dave');
  });

  it('validates inputs and requires a reason', async () => {
    const h = await synced();
    expect((await h.run('user', 'alice', ...ENT, '--offline')).err).toContain('--reason');
    expect((await h.run('user', 'alice', ...ENT, '--offline', '--reason', 'n/a')).err).toContain(
      'at least'
    );
    expect((await h.run('user', 'bad name', ...ENT, '--offline', ...REASON)).err).toContain(
      'Logins'
    );
    expect(
      (await h.run('user', 'alice', ...ENT, '--offline', '--compare-period', 'x', ...REASON)).err
    ).toContain('--compare-period');
    expect((await h.run('user', 'nobody', ...ENT, '--offline', ...REASON)).err).toContain(
      'No Copilot data stored for user'
    );
  });
});

describe('copilot report, insights and ask', () => {
  it('writes an HTML report with individual pages and findings', async () => {
    const h = await synced({ api: { publicCode: { labs: 'allow' } } });
    const r = await h.run(
      'report',
      ...ENT,
      '--offline',
      '--users',
      'alice',
      '--output',
      'report.html',
      '--summarise',
      ...REASON
    );
    expect(r.code).toBe(0);
    const html = h.files.get(path.join(workDir, 'report.html'))!;
    expect(html).toContain('id="user-alice"');
    expect(html).toContain('HH-GH-012');
    expect(html).toContain('Viewed by auditor');
    const store = CopilotStore.open(h.db);
    expect(
      (store.db.prepare('SELECT COUNT(*) AS n FROM findings').get() as { n: number }).n
    ).toBeGreaterThan(0);
    store.close();
  });

  it('writes anonymised reports without a reason', async () => {
    const h = await synced({ api: { duplicateSeat: ['ivan'] } });
    const r = await h.run('report', ...ENT, '--offline', '--anonymise', '--format', 'json');
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/"(alice|ivan|frank)"/);
    expect(r.out).not.toContain('ivan holds');
    expect(
      (await h.run('report', ...ENT, '--offline', '--anonymise', '--users', 'alice')).err
    ).toContain('cannot be combined');
    expect((await h.run('report', ...ENT, '--offline')).err).toContain('--reason');
  });

  it('writes Markdown and console reports', async () => {
    const h = await synced();
    expect(
      (await h.run('report', ...ENT, '--offline', '--format', 'md', '--all-profiles', ...REASON))
        .out
    ).toContain('## alice');
    expect((await h.run('report', ...ENT, '--offline', ...REASON)).out).toContain(
      'Governance findings'
    );
    expect(
      (await h.run('report', ...ENT, '--offline', '--profile', '../x.yaml', ...REASON)).err
    ).toContain('--profile');
  });

  it('summarises insights', async () => {
    const h = await synced();
    expect((await h.run('insights', ...ENT, '--offline')).out).toContain(
      'Summary (Copilot unavailable)'
    );
    const json = JSON.parse((await h.run('insights', ...ENT, '--offline', '--json')).out);
    expect(json.narrative.source).toBe('fallback');
    expect(JSON.stringify(json.findings)).not.toContain('alice');
  });

  it('answers questions, gating named people on a reason', async () => {
    const h = await synced({ reply: 'Web adopted agent mode fastest.' });
    expect((await h.run('ask', 'Which team uses agent mode most?', ...ENT, '--offline')).out).toBe(
      'Web adopted agent mode fastest.\n'
    );
    expect((await h.run('ask', ' ', ...ENT, '--offline')).err).toContain('question is required');
    expect((await h.run('ask', 'x'.repeat(2001), ...ENT, '--offline')).err).toContain('too long');
    expect((await h.run('ask', 'How is alice doing?', ...ENT, '--offline', ...REASON)).code).toBe(
      0
    );
  });
});

describe('copilot sql and db', () => {
  it('runs read-only queries, requiring a reason for per-user tables', async () => {
    const h = await synced();
    const r = await h.run(
      'sql',
      'SELECT COUNT(*) AS days FROM v_daily_adoption',
      '--db',
      h.db,
      '--format',
      'json'
    );
    expect(JSON.parse(r.out)).toEqual([{ days: 28 }]);
    expect((await h.run('sql', 'SELECT login FROM users', '--db', h.db)).err).toContain('--reason');
    const named = await h.run(
      'sql',
      'SELECT login FROM users ORDER BY login LIMIT 1',
      '--db',
      h.db,
      '--format',
      'csv',
      ...REASON
    );
    expect(named.out).toContain('alice');
    expect(named.out).toContain('# Individual data viewed by');
    expect((await h.run('sql', 'SELECT 1 AS x', '--db', h.db)).out).toContain('x');
    expect((await h.run('sql', 'DELETE FROM users', '--db', h.db)).err).toContain('Only SELECT');
    expect((await h.run('sql', 'SELECT * FROM nope', '--db', h.db)).err).toContain('Query failed');
    const log = await h.run('db', 'access-log', '--db', h.db);
    expect(log.out).toContain('(sql query)');
  });

  it('shows status, vacuums, verifies and filters the access log', async () => {
    const h = await synced();
    await h.run('users', ...ENT, '--offline', ...REASON);
    expect((await h.run('db', 'status', '--db', h.db)).out).toContain('enterprise mega');
    expect((await h.run('db', 'vacuum', '--db', h.db)).out).toContain('compacted');
    expect((await h.run('db', 'access-log', '--db', h.db, '--verify')).out).toContain('intact');
    expect((await h.run('db', 'access-log', '--db', h.db, '--since', 'x')).err).toContain(
      '--since'
    );
    expect((await h.run('db', 'access-log', '--db', h.db, '--limit', 'x')).err).toContain(
      '--limit'
    );
    expect(
      (
        await h.run(
          'db',
          'access-log',
          '--db',
          h.db,
          '--viewer',
          'auditor',
          '--since',
          '2026-01-01'
        )
      ).out
    ).toContain('Access log');
    const store = CopilotStore.open(h.db);
    store.db.prepare("UPDATE access_batch SET reason = 'changed'").run();
    store.close();
    expect((await h.run('db', 'access-log', '--db', h.db, '--verify')).err).toContain('altered');
  });

  it('purges a user with confirmation', async () => {
    const h = await synced();
    expect((await h.run('db', 'purge-user', 'alice', '--db', h.db)).err).toContain('--yes');
    expect((await h.run('db', 'purge-user', 'nobody', '--db', h.db, '--yes')).out).toContain(
      'No stored data'
    );
    const r = await h.run('db', 'purge-user', 'alice', '--db', h.db, '--yes');
    expect(r.out).toContain('Deleted');
    const interactive = harness({ interactive: true, confirm: false, db: h.db });
    expect((await interactive.run('db', 'purge-user', 'bob', '--db', h.db)).out).toContain(
      'Nothing deleted'
    );
    const yes = harness({ interactive: true, confirm: true, db: h.db });
    expect((await yes.run('db', 'purge-user', 'bob', '--db', h.db)).out).toContain('Deleted');
  });

  it('exports every table with a reason', async () => {
    const h = await synced();
    const realWrite = defaultDeps().writeFile;
    h.deps.writeFile = realWrite;
    expect((await h.run('db', 'export', 'dump', '--db', h.db)).err).toContain('--reason');
    const r = await h.run('db', 'export', 'dump', '--db', h.db, ...REASON);
    expect(r.out).toContain('Exported');
    expect(existsSync(path.join(workDir, 'dump', 'users.csv'))).toBe(true);
    expect(readdirSync(path.join(workDir, 'dump')).length).toBeGreaterThan(20);
    expect(readFileSync(path.join(workDir, 'dump', 'scopes.csv'), 'utf8')).toContain('mega');
    expect((await h.run('db', 'export', '../outside', '--db', h.db, ...REASON)).err).toContain(
      'Invalid export directory'
    );
  });
});

describe('default dependencies', () => {
  it('validates explicit tokens and falls back to a local viewer', async () => {
    const deps = defaultDeps();
    expect(() => deps.resolveAuth('not-a-token')).toThrow();
    expect(await deps.resolveViewer(null)).toMatch(/^local:/);
    expect(
      await deps.resolveViewer({ mode: 'app', appId: 5, installationId: 1, privateKey: 'k' })
    ).toBe('app:5');
    expect(typeof deps.now().getTime()).toBe('number');
    expect(deps.argv()).toEqual(process.argv.slice(2));
  });
});
