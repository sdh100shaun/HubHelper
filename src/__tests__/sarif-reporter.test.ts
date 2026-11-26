import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PolicyEngine, type PolicyEngineResult } from '../policy/engine';
import { SarifReporter } from '../reporters/sarif-reporter';
import type { SecurityIssue } from '../types/index';

function issue(overrides: Partial<SecurityIssue>): SecurityIssue {
  return {
    type: 'self-merge',
    severity: 'high',
    repository: 'org/repo',
    description: 'A finding',
    details: {},
    detected_at: '2026-11-26T10:00:00Z',
    ...overrides,
  };
}

describe('SarifReporter', () => {
  let baseResult: PolicyEngineResult;
  const reporter = new SarifReporter();

  beforeAll(async () => {
    const engine = new PolicyEngine();
    await engine.loadPolicy(join(process.cwd(), 'policies', 'default.yaml'));
    baseResult = await engine.evaluate([], [], [], []);
  });

  function withIssues(issues: SecurityIssue[]): PolicyEngineResult {
    return { ...baseResult, issues };
  }

  it('produces a SARIF 2.1.0 log with one rule per control', () => {
    const sarif = reporter.generateSarif(withIssues([]));
    const run = sarif.runs[0];

    expect(sarif.version).toBe('2.1.0');
    expect(run.tool.driver.name).toBe('HubHelper');
    expect(run.tool.driver.rules).toHaveLength(baseResult.policy.controls.length);
    expect(run.results).toEqual([]);
    expect(run.properties?.policyProfile).toBe(baseResult.policy.metadata.profileTitle);
  });

  it('adds framework mappings to rule help', () => {
    const sarif = reporter.generateSarif(withIssues([]));
    const mapped = sarif.runs[0].tool.driver.rules.find((rule) => rule.help);

    expect(mapped?.help?.markdown).toContain('Framework Mappings');
  });

  it.each([
    ['critical', 'error'],
    ['high', 'error'],
    ['medium', 'warning'],
    ['low', 'note'],
  ] as const)('maps %s severity to %s', (severity, level) => {
    const sarif = reporter.generateSarif(withIssues([issue({ severity })]));
    expect(sarif.runs[0].results[0].level).toBe(level);
  });

  it('uses the catalog control ID as the rule ID', () => {
    const sarif = reporter.generateSarif(
      withIssues([issue({ type: 'disabled-actions' }), issue({ type: 'action_failure' })])
    );

    expect(sarif.runs[0].results.map((r) => r.ruleId)).toEqual(['HH-GH-004', 'HH-GH-008']);
  });

  it('points PR findings at the pull request', () => {
    const sarif = reporter.generateSarif(
      withIssues([issue({ details: { pr_number: 3, url: 'https://github.com/org/repo/pull/3' } })])
    );

    expect(sarif.runs[0].results[0].locations?.[0].logicalLocations?.[0]).toEqual({
      name: 'PR #3',
      kind: 'pullRequest',
    });
  });

  it('points workflow findings at the workflow file', () => {
    const sarif = reporter.generateSarif(
      withIssues([
        issue({
          type: 'disabled-workflow',
          details: { workflow_name: 'CI', workflow_path: '.github/workflows/ci.yml' },
        }),
      ])
    );
    const location = sarif.runs[0].results[0].locations?.[0];

    expect(location?.physicalLocation?.artifactLocation.uri).toBe('.github/workflows/ci.yml');
    expect(location?.logicalLocations?.[0].kind).toBe('workflow');
  });

  it('points repository findings at the repository', () => {
    const sarif = reporter.generateSarif(
      withIssues([issue({ type: 'disabled-actions', details: { repo_name: 'repo' } })])
    );

    expect(sarif.runs[0].results[0].locations?.[0].logicalLocations?.[0]).toEqual({
      name: 'repo',
      kind: 'repository',
    });
  });

  it('omits locations when there is nothing to point at', () => {
    const sarif = reporter.generateSarif(withIssues([issue({ details: {} })]));
    expect(sarif.runs[0].results[0].locations).toBeUndefined();
  });

  it('saves to a file and renders as a string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hh-sarif-'));
    try {
      const file = join(dir, 'out.sarif');
      const result = withIssues([issue({})]);
      reporter.saveToFile(result, file);

      const saved = JSON.parse(readFileSync(file, 'utf-8'));
      expect(saved.runs[0].results).toHaveLength(1);
      expect(JSON.parse(reporter.toString(result))).toEqual(saved);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
