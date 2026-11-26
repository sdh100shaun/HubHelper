/**
 * Unit tests for SarifReporter (SARIF 2.1.0 output for GitHub Code Scanning).
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { PolicyEngineResult } from '../policy/engine.js';
import { loadCatalogForProfile, loadProfile } from '../policy/loader.js';
import { resolvePolicy } from '../policy/resolver.js';
import type { ResolvedPolicy } from '../policy/types.js';
import { SarifReporter } from '../reporters/sarif-reporter.js';
import type { SecurityIssue } from '../types/index.js';

const PROFILE_PATH = 'policies/default.yaml';

const issue = (overrides: Partial<SecurityIssue>): SecurityIssue => ({
  type: 'self-merge',
  severity: 'medium',
  repository: 'acme/app',
  description: 'Something happened',
  details: {},
  detected_at: '2026-04-01T00:00:00Z',
  ...overrides,
});

const makeResult = (policy: ResolvedPolicy, issues: SecurityIssue[]): PolicyEngineResult => ({
  issues,
  reviewIssues: [],
  statistics: {
    controlsEvaluated: policy.controls.length,
    totalIssues: issues.length,
    issuesBySeverity: {},
    executionTimeMs: 1,
  },
  policy,
});

describe('SarifReporter', () => {
  const reporter = new SarifReporter();
  let policy: ResolvedPolicy;

  beforeAll(async () => {
    // Use the shipped default profile so rules reflect the real catalogue.
    const profile = await loadProfile(PROFILE_PATH);
    const catalog = await loadCatalogForProfile(profile, PROFILE_PATH);
    policy = resolvePolicy(catalog, profile);
  });

  it('produces a SARIF 2.1.0 log describing the tool and policy', () => {
    const sarif = reporter.generateSarif(makeResult(policy, []));

    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    expect(sarif.runs).toHaveLength(1);

    const [run] = sarif.runs;
    expect(run.tool.driver).toMatchObject({
      name: 'HubHelper',
      informationUri: 'https://github.com/sdh100shaun/HubHelper',
    });
    expect(run.results).toEqual([]);
    expect(run.properties).toEqual({
      policyProfile: policy.metadata.profileTitle,
      catalogVersion: policy.metadata.catalogVersion,
      controlsEvaluated: policy.controls.length,
    });
  });

  it('emits one rule per resolved control with severity, tags and framework mappings', () => {
    const [run] = reporter.generateSarif(makeResult(policy, [])).runs;
    const rules = run.tool.driver.rules;

    expect(rules.map((r) => r.id)).toEqual(policy.controls.map((c) => c.id));

    for (const rule of rules) {
      const control = policy.controls.find((c) => c.id === rule.id);
      expect(control).toBeDefined();
      expect(rule.shortDescription.text).toBe(control?.statement);
      expect(rule.name.length).toBeLessThanOrEqual(50);
      expect(rule.properties?.tags).toEqual([control?.family, control?.evaluator.kind]);
      if (control?.mappings) {
        expect(rule.help?.text).toContain('Framework Mappings:');
        expect(rule.help?.markdown).toContain(`## ${control.id}:`);
      }
    }
  });

  it('maps severities to SARIF levels and security-severity scores', () => {
    const scored = (severity: 'critical' | 'high' | 'medium' | 'low') => {
      const control = { ...policy.controls[0], id: `X-${severity}`, severity };
      const [run] = reporter.generateSarif(makeResult({ ...policy, controls: [control] }, [])).runs;
      const [rule] = run.tool.driver.rules;
      return [rule.defaultConfiguration.level, rule.properties?.['security-severity']];
    };

    expect(scored('critical')).toEqual(['error', '9.0']);
    expect(scored('high')).toEqual(['error', '7.0']);
    expect(scored('medium')).toEqual(['warning', '5.0']);
    expect(scored('low')).toEqual(['note', '3.0']);
  });

  it('omits help text for controls without framework mappings', () => {
    const control = { ...policy.controls[0], mappings: undefined };
    const [run] = reporter.generateSarif(makeResult({ ...policy, controls: [control] }, [])).runs;
    expect(run.tool.driver.rules[0].help).toBeUndefined();
  });

  it('converts issues to results mapped to their control rule', () => {
    const issues: SecurityIssue[] = [
      issue({ type: 'self-merge', severity: 'high', description: 'PR #1 self-merged' }),
      issue({ type: 'unreviewed-security-pr', severity: 'critical' }),
      issue({ type: 'security-pr', severity: 'low' }),
      issue({ type: 'disabled-actions' }),
      issue({ type: 'paused-workflow' }),
      issue({ type: 'disabled-workflow' }),
      issue({ type: 'repeated_action_failure' }),
      issue({ type: 'action_failure' }),
      issue({ type: 'security-pr-volume' }),
      issue({ type: 'contractor-repo-access' }),
      // Not a known type (e.g. from an older state file): falls back to HH-GH-000.
      issue({ type: 'something-new' as SecurityIssue['type'] }),
    ];

    const [run] = reporter.generateSarif(makeResult(policy, issues)).runs;

    expect(run.results.map((r) => r.ruleId)).toEqual([
      'HH-GH-001',
      'HH-GH-002',
      'HH-GH-003',
      'HH-GH-004',
      'HH-GH-005',
      'HH-GH-006',
      'HH-GH-007',
      'HH-GH-008',
      'HH-GH-009',
      'HH-GH-010',
      'HH-GH-000',
    ]);
    expect(run.results[0]).toMatchObject({
      level: 'error',
      message: { text: 'PR #1 self-merged' },
      properties: { repository: 'acme/app', detectedAt: '2026-04-01T00:00:00Z' },
    });
    expect(run.results[1].level).toBe('error');
    expect(run.results[2].level).toBe('note');
    expect(run.results[3].level).toBe('warning');
  });

  it('attaches locations for PR, workflow and repository issues', () => {
    const issues: SecurityIssue[] = [
      issue({ details: { pr_number: 42, url: 'https://github.com/acme/app/pull/42' } }),
      issue({
        type: 'disabled-workflow',
        details: { workflow_name: 'Deploy', workflow_path: '.github/workflows/deploy.yml' },
      }),
      issue({ type: 'disabled-actions', details: { repo_name: 'app' } }),
      issue({ type: 'security-pr-volume', details: {} }),
    ];

    const [pr, workflow, repo, none] = reporter.generateSarif(makeResult(policy, issues)).runs[0]
      .results;

    expect(pr.locations).toEqual([{ logicalLocations: [{ name: 'PR #42', kind: 'pullRequest' }] }]);
    expect(workflow.locations).toEqual([
      {
        physicalLocation: { artifactLocation: { uri: '.github/workflows/deploy.yml' } },
        logicalLocations: [{ name: 'Deploy', kind: 'workflow' }],
      },
    ]);
    expect(repo.locations).toEqual([{ logicalLocations: [{ name: 'app', kind: 'repository' }] }]);
    expect(none.locations).toBeUndefined();
  });

  describe('serialisation', () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'hubhelper-sarif-'));
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('toString returns pretty-printed SARIF JSON', () => {
      const result = makeResult(policy, [issue({})]);
      const text = reporter.toString(result);
      expect(JSON.parse(text)).toEqual(reporter.generateSarif(result));
      expect(text).toContain('\n  "version": "2.1.0"');
    });

    it('saveToFile writes the SARIF log to disk', () => {
      const file = join(dir, 'results.sarif');
      const result = makeResult(policy, [issue({})]);

      reporter.saveToFile(result, file);

      expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual(reporter.generateSarif(result));
    });
  });
});
