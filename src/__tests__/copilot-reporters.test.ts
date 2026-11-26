import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  CopilotConsoleReporter,
  formatTable,
  sparkline,
} from '../reporters/copilot-console-reporter.js';
import {
  anonymiseModel,
  csvCell,
  pctCell,
  profileRows,
  seatRows,
  spendRows,
  toCsv,
  toJson,
  toMarkdown,
  toMarkdownTable,
  usageRows,
  userRows,
} from '../reporters/copilot-export.js';
import {
  barList,
  calendarHeatmap,
  featureMixChart,
  generateCopilotHtml,
  lineChart,
  profileAnchor,
} from '../reporters/copilot-html-reporter.js';
import { fallbackNarrative, fallbackUserNarrative } from '../services/copilot/insights-service.js';
import type { CopilotUsageModel } from '../services/copilot/model.js';
import type { CopilotStore } from '../services/copilot/store/copilot-store.js';
import { CopilotUsageAggregator } from '../services/copilot/usage-aggregator.js';
import {
  type CopilotUserProfile,
  CopilotUserProfileBuilder,
  compareProfiles,
} from '../services/copilot/user-profile.js';
import type { SecurityIssue } from '../types/index.js';
import { buildFixtureStore, FIXTURE_RANGE } from './helpers/copilot-fixtures.js';

const ENT = { kind: 'enterprise' as const, enterprise: 'mega' };
const STAMP = { viewer: 'auditor', viewedAt: '2026-11-25T12:00:00.000Z', reasonCode: 'enablement' };

let store: CopilotStore;
let model: CopilotUsageModel;
let alice: CopilotUserProfile;

beforeAll(async () => {
  ({ store } = await buildFixtureStore(ENT, {
    duplicateSeat: ['ivan'],
    suppressedDays: ['2026-11-01'],
    flaggedDay: '2026-11-20',
  }));
  model = new CopilotUsageAggregator(store).build(ENT, FIXTURE_RANGE);
  alice = new CopilotUserProfileBuilder(store).build(ENT, 'alice', FIXTURE_RANGE, model);
});

describe('copilot export', () => {
  it('builds usage rows for every view', () => {
    expect(usageRows(model, 'day')).toHaveLength(28);
    expect(usageRows(model, 'team')[0]).toHaveProperty('team');
    expect(
      usageRows(model, 'org')
        .map((r) => r.org)
        .sort()
    ).toEqual(['acme', 'labs']);
    expect(usageRows(model, 'cost-centre').map((r) => r.cost_centre)).toEqual([
      'Labs',
      'Platform',
      '(none)',
    ]);
    expect(
      usageRows({ ...model, spend: { ...model.spend, byCostCentre: [] } }, 'cost-centre')
    ).toEqual([]);
    expect(usageRows(model, 'ide')[0]).toMatchObject({ ide: 'vscode' });
  });

  it('builds seat, spend and user rows', () => {
    expect(seatRows(model, { idleOnly: true }).map((r) => r.login)).toEqual(['frank']);
    expect(seatRows(model, { anonymise: true }).some((r) => r.login === 'alice')).toBe(false);
    for (const view of ['model', 'day', 'user', 'org', 'cost-centre'] as const) {
      expect(spendRows(model, view).length).toBeGreaterThan(0);
    }
    expect(spendRows(model, 'user', true)[0].login).toMatch(/^user-/);
    expect(
      userRows(model, { team: 'web', sort: 'acceptance' })
        .map((r) => r.login)
        .sort()
    ).toEqual(['carol', 'dave', 'erin']);
    expect(userRows(model, { idle: true }).map((r) => r.login)).toEqual(['frank']);
    expect(userRows(model, { sort: 'spend', limit: 1 })).toHaveLength(1);
    expect(userRows(model, { sort: 'last-active' })[0].last_active).toBe('2026-11-24');
    expect(userRows(model, { sort: 'activity' }).length).toBe(10);
    expect(profileRows(alice).find((r) => r.field === 'cost_centres')?.value).toBe('Platform');
  });

  it('protects CSV cells from formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(null)).toBe('');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(toCsv([])).toBe('');
    expect(toCsv([], STAMP)).toContain('auditor');
    expect(toCsv([{ a: 1, b: 'x' }], STAMP).split('\n')).toEqual([
      '# Individual data viewed by auditor at 2026-11-25T12:00:00.000Z (reason: enablement)',
      'a,b',
      '1,x',
      '',
    ]);
  });

  it('writes Markdown and JSON with the access stamp', () => {
    expect(toMarkdownTable([])).toBe('_No data._\n');
    expect(toMarkdownTable([{ a: 'x|y', b: null }])).toContain('x\\|y');
    const md = toMarkdown('T', [{ heading: 'H', rows: [{ a: 1 }] }], STAMP);
    expect(md).toContain('# T');
    expect(md).toContain('viewed by auditor');
    expect(JSON.parse(toJson({ a: 1 }, STAMP))).toEqual({ a: 1, access: STAMP });
    expect(JSON.parse(toJson([1], STAMP))).toEqual({ data: [1], access: STAMP });
    expect(JSON.parse(toJson([1]))).toEqual([1]);
    expect(pctCell(null)).toBe('');
    expect(pctCell(0.1234)).toBe('12.3%');
  });

  it('anonymises every login in the model', () => {
    const json = JSON.stringify(anonymiseModel(model));
    for (const login of ['alice', 'bob', 'ivan', 'frank', 'carol'])
      expect(json).not.toContain(`"${login}"`);
  });
});

describe('copilot console reporter', () => {
  function capture() {
    const lines: string[] = [];
    return {
      lines,
      reporter: new CopilotConsoleReporter((l) => lines.push(l)),
      text: () => lines.join('\n'),
    };
  }

  it('draws sparklines and tables', () => {
    expect(sparkline([0, 5, null, 10])).toBe('▁▅ █');
    expect(sparkline([0, 0])).toBe('▁▁');
    expect(formatTable([])).toContain('no data');
    const table = formatTable([{ name: 'a'.repeat(50), n: 3 }], 10);
    expect(table).toContain('aaaaaaaaa…');
  });

  it('prints usage, data quality and anomalies', () => {
    const { reporter, text } = capture();
    reporter.printUsage(
      {
        ...model,
        anomalies: [{ day: '2026-11-20', metric: 'interactions', value: 9, mean: 3, zScore: 3 }],
      },
      'org'
    );
    expect(text()).toContain('enterprise mega');
    expect(text()).toContain('1 day(s) suppressed');
    expect(text()).toContain('telemetry or client-version gaps');
    expect(text()).toContain('Unusual days');
    expect(text()).toContain('labs');
  });

  it('prints spend, findings, narratives and status', () => {
    const { reporter, text } = capture();
    reporter.printSpend(model, spendRows(model, 'model'), 'model', 1);
    expect(text()).toContain('(over)');
    reporter.printFindings([]);
    expect(text()).toContain('No findings');
    const issue: SecurityIssue = {
      type: 'copilot-idle-seat',
      severity: 'low',
      repository: 'acme',
      description: 'idle',
      details: { control_id: 'HH-GH-011' },
      detected_at: 'x',
    };
    reporter.printFindings(Array.from({ length: 52 }, () => issue));
    expect(text()).toContain('…and 2 more');
    reporter.printNarrative({ ...fallbackNarrative(model), risks: ['r'], recommendations: ['x'] });
    reporter.printNarrative({
      ...fallbackNarrative(model),
      source: 'ai',
      risks: [],
      recommendations: [],
    });
    expect(text()).toContain('AI summary');
    reporter.printStatus(store.status());
    expect(text()).toContain('schema v1');
    reporter.printStatus({ ...store.status(), sizeBytes: 2 * 1024 * 1024 });
    expect(text()).toContain('2.0 MB');
    reporter.info('hello');
    reporter.warn('careful');
    expect(text()).toContain('careful');
  });

  it('prints an individual profile, comparison and recent views', () => {
    const { reporter, text } = capture();
    reporter.printUserProfile(
      {
        ...alice,
        untriedFeatures: ['edits'],
        seat: { ...alice.seat, history: [{ day: '2026-11-26', org: 'acme', event: 'removed' }] },
      },
      [{ viewedAt: '2026-11-25T12:00:00.000Z', viewer: 'auditor', reasonCode: 'enablement' }],
      fallbackUserNarrative(alice)
    );
    const out = text();
    for (const s of [
      'alice',
      'Platform',
      'Not yet tried',
      'Coding agent PRs',
      'Compared with peers',
      'Seat history',
      'auditor',
      'not productivity',
    ]) {
      expect(out).toContain(s);
    }
    reporter.printComparison('alice', 'bob', compareProfiles(alice, alice));
    expect(text()).toContain('Comparison: alice vs bob');
  });

  it('prints sync summaries and the access log', () => {
    const { reporter, text } = capture();
    reporter.printSyncSummary({
      days: {
        'scope-1-day': { ok: 1, suppressed: 0, unavailable: 0, error: 0 },
        'users-1-day': { ok: 1, suppressed: 0, unavailable: 0, error: 0 },
        'user-teams-1-day': { ok: 1, suppressed: 0, unavailable: 0, error: 0 },
      },
      seats: 3,
      orgsAssessed: ['acme'],
      orgsNotAssessed: ['labs'],
      spendDays: 1,
      agentPrs: 0,
      warnings: ['Spend not synced'],
      retentionRemoved: 4,
    });
    expect(text()).toContain('Not assessed (no access): labs');
    expect(text()).toContain('Retention removed 4');
    reporter.printAccessLog([
      {
        id: 1,
        viewedAt: '2026-11-25T12:00:00.000Z',
        viewer: 'a',
        scope: null,
        command: 'c',
        reasonCode: 'other',
        reason: 'r',
        subjects: ['p', 'q', 'r', 's', 't'],
      },
    ]);
    expect(text()).toContain('p q r +2');
  });
});

describe('copilot HTML reporter', () => {
  it('renders a self-contained, escaped dashboard', () => {
    const html = generateCopilotHtml({
      model: { ...model, teams: [{ ...model.teams[0], slug: '<script>alert(1)</script>' }] },
      findings: [
        {
          type: 'copilot-idle-seat',
          severity: 'low',
          repository: 'acme',
          description: '<b>idle</b>',
          details: { control_id: 'HH-GH-011' },
          detected_at: 'x',
        },
      ],
      narrative: { ...fallbackNarrative(model), risks: ['r'], recommendations: ['x'] },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;idle&lt;/b&gt;');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).toContain('Organisations');
    expect(html).toContain('People with seats in several organisations');
    expect(html).toContain('Gaps are shown as gaps');
    expect(html).not.toContain('class="profile"');
  });

  it('includes individual pages and the access stamp only when given', () => {
    const html = generateCopilotHtml({
      model,
      profiles: [{ profile: alice, narrative: fallbackUserNarrative(alice) }],
      access: STAMP,
      openProfile: 'alice',
    });
    expect(html).toContain(`id="${profileAnchor('alice')}"`);
    expect(html).toContain('href="#user-alice"');
    expect(html).toContain('data-open="user-alice"');
    expect(html).toContain('Viewed by auditor');
    expect(html).toContain('Compared with peers');
  });

  it('marks anonymised reports and org scopes', () => {
    const html = generateCopilotHtml({
      model: { ...anonymiseModel(model), scope: { kind: 'org', org: 'acme' } },
      anonymised: true,
    });
    expect(html).toContain('logins pseudonymised');
    expect(html).not.toContain('<h2>Organisations</h2>');
  });

  it('draws charts with gaps, legends and table views', () => {
    const line = lineChart('Test', [
      { day: '2026-11-01', value: 3, ok: true },
      { day: '2026-11-02', value: 0, ok: false, note: 'suppressed' },
      { day: '2026-11-03', value: 5, ok: true },
    ]);
    expect(line).toContain('class="gap"');
    expect(line).toContain('2026-11-02: suppressed');
    expect((line.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(featureMixChart(model)).toContain('class="legend"');
    expect(featureMixChart({ ...model, featureMix: [] })).toContain('No feature breakdown');
    expect(barList('X', [])).toContain('No data');
    expect(barList('X', model.breakdowns.ide)).toContain('Show table');
    expect(calendarHeatmap([])).toBe('');
    const cal = calendarHeatmap(alice.activity.daily);
    expect(cal).toContain('nodata');
    expect(cal).toContain('data may be incomplete');
  });
});
