/**
 * Unit tests for the policy control evaluators (HH-GH-001 … HH-GH-009) and the
 * shared BaseEvaluator parameter helpers.
 */

import { describe, expect, it } from '@jest/globals';
import {
  ActionFailureEvaluator,
  RepeatedActionFailureEvaluator,
} from '../evaluators/action-failure-evaluator.js';
import { BaseEvaluator } from '../evaluators/base-evaluator.js';
import { DisabledWorkflowEvaluator } from '../evaluators/disabled-workflow-evaluator.js';
import { PausedWorkflowEvaluator } from '../evaluators/paused-workflow-evaluator.js';
import { SecurityPRClassifier } from '../evaluators/security-pr-classifier.js';
import { SecurityPRVolumeEvaluator } from '../evaluators/security-pr-volume-evaluator.js';
import { SelfMergeEvaluator } from '../evaluators/self-merge-evaluator.js';
import { UnreviewedSecurityPREvaluator } from '../evaluators/unreviewed-security-pr-evaluator.js';
import { ParameterValidationError } from '../policy/errors.js';
import type { EvaluationContext, EvaluationResult } from '../policy/types.js';
import type {
  PullRequest,
  Repository,
  SecurityIssue,
  Workflow,
  WorkflowRun,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePR = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  number: 1,
  title: 'Update README',
  url: 'https://github.com/acme/app/pull/1',
  author: 'alice',
  merged_by: 'bob',
  merged_at: '2026-04-01T00:00:00Z',
  created_at: '2026-03-31T00:00:00Z',
  repository: 'acme/app',
  labels: [],
  is_security_related: false,
  files_changed: ['README.md'],
  ...overrides,
});

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 1,
  name: 'CI',
  path: '.github/workflows/ci.yml',
  state: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  url: 'https://github.com/acme/app/actions/workflows/ci.yml',
  badge_url: 'https://github.com/acme/app/actions/workflows/ci.yml/badge.svg',
  is_scheduled: false,
  ...overrides,
});

const makeRepo = (workflows?: Workflow[], name = 'app'): Repository => ({
  name,
  full_name: `acme/${name}`,
  private: false,
  actions_enabled: true,
  security_enabled: true,
  workflows,
});

const makeRun = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 100,
  name: 'CI',
  head_branch: 'main',
  head_sha: 'abc123',
  status: 'completed',
  conclusion: 'failure',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:05:00Z',
  repository: 'acme/app',
  workflow_id: 1,
  workflow_name: 'CI',
  run_number: 1,
  event: 'push',
  run_attempt: 1,
  ...overrides,
});

const makeContext = (overrides: Partial<EvaluationContext> = {}): EvaluationContext => ({
  repositories: [],
  pullRequests: [],
  workflowRuns: [],
  scope: { 'lookback-days': 30 },
  ...overrides,
});

/** Classifier output (HH-GH-003) as consumed by dependent controls. */
const classifierResultsFor = (
  prs: Array<{ number: number; repository?: string }>
): Map<string, unknown> =>
  new Map([
    [
      'HH-GH-003',
      prs.map((pr) => ({
        type: 'security-pr',
        repository: pr.repository ?? 'acme/app',
        details: { pr_number: pr.number },
      })),
    ],
  ]);

const issuesOf = (result: EvaluationResult): SecurityIssue[] => result.issues as SecurityIssue[];

// ---------------------------------------------------------------------------
// BaseEvaluator parameter helpers
// ---------------------------------------------------------------------------

/** Exposes the protected helpers for direct testing. */
class ProbeEvaluator extends BaseEvaluator {
  readonly controlId = 'HH-TEST-001';
  readonly kind = 'meta' as const;

  async evaluate(): Promise<EvaluationResult> {
    return { controlId: this.controlId, issues: [] };
  }

  str(params: Record<string, unknown>, key: string, required?: boolean) {
    return this.getStringParam(params, key, required);
  }

  num(params: Record<string, unknown>, key: string, required?: boolean) {
    return this.getNumberParam(params, key, required);
  }

  arr(params: Record<string, unknown>, key: string, required?: boolean) {
    return this.getStringArrayParam(params, key, required);
  }

  sev(params: Record<string, unknown>, key: string, required?: boolean) {
    return this.getSeverityParam(params, key, required);
  }
}

describe('BaseEvaluator parameter helpers', () => {
  const probe = new ProbeEvaluator();

  const expectParamError = (fn: () => unknown, parameterId: string, message: RegExp) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(ParameterValidationError);
      const paramError = error as ParameterValidationError;
      expect(paramError.controlId).toBe('HH-TEST-001');
      expect(paramError.parameterId).toBe(parameterId);
      expect(paramError.code).toBe('PARAMETER_VALIDATION_ERROR');
      expect(paramError.message).toMatch(message);
      return;
    }
    throw new Error('expected a ParameterValidationError');
  };

  it('accepts no parameters by default', () => {
    expect(() => probe.validateParameters({})).not.toThrow();
  });

  describe('getStringParam', () => {
    it('returns a present string', () => {
      expect(probe.str({ name: 'value' }, 'name')).toBe('value');
    });

    it('throws when a required string is missing', () => {
      expectParamError(() => probe.str({}, 'name'), 'name', /Required parameter 'name'/);
    });

    it('returns undefined when an optional string is missing', () => {
      expect(probe.str({}, 'name', false)).toBeUndefined();
    });

    it('rejects a non-string value', () => {
      expectParamError(
        () => probe.str({ name: 3 }, 'name'),
        'name',
        /must be a string, got number/
      );
    });
  });

  describe('getNumberParam', () => {
    it('returns a present number, including zero', () => {
      expect(probe.num({ n: 7 }, 'n')).toBe(7);
      expect(probe.num({ n: 0 }, 'n')).toBe(0);
    });

    it('throws when a required number is missing', () => {
      expectParamError(() => probe.num({}, 'n'), 'n', /Required parameter 'n'/);
    });

    it('returns undefined when an optional number is missing', () => {
      expect(probe.num({}, 'n', false)).toBeUndefined();
    });

    it('rejects a numeric string', () => {
      expectParamError(() => probe.num({ n: '7' }, 'n'), 'n', /must be a number, got string/);
    });
  });

  describe('getStringArrayParam', () => {
    it('returns a string array', () => {
      expect(probe.arr({ list: ['a', 'b'] }, 'list')).toEqual(['a', 'b']);
    });

    it('throws when a required array is missing', () => {
      expectParamError(() => probe.arr({}, 'list'), 'list', /Required parameter 'list'/);
    });

    it('returns undefined when an optional array is missing', () => {
      expect(probe.arr({}, 'list', false)).toBeUndefined();
    });

    it('rejects a non-array value', () => {
      expectParamError(() => probe.arr({ list: 'a' }, 'list'), 'list', /must be an array/);
    });

    it('rejects an array containing non-strings', () => {
      expectParamError(
        () => probe.arr({ list: ['a', 1] }, 'list'),
        'list',
        /must be an array of strings/
      );
    });
  });

  describe('getSeverityParam', () => {
    it.each(['low', 'medium', 'high', 'critical'])('accepts %s', (severity) => {
      expect(probe.sev({ s: severity }, 's')).toBe(severity);
    });

    it('rejects an unknown severity', () => {
      expectParamError(() => probe.sev({ s: 'urgent' }, 's'), 's', /valid severity.*'urgent'/);
    });

    it('returns undefined when an optional severity is missing', () => {
      expect(probe.sev({}, 's', false)).toBeUndefined();
    });

    it('throws when a required severity is missing', () => {
      expectParamError(() => probe.sev({}, 's'), 's', /Required parameter 's'/);
    });
  });
});

// ---------------------------------------------------------------------------
// HH-GH-001 Self-merge
// ---------------------------------------------------------------------------

describe('SelfMergeEvaluator (HH-GH-001)', () => {
  const evaluator = new SelfMergeEvaluator();

  it('identifies itself', () => {
    expect(evaluator.controlId).toBe('HH-GH-001');
    expect(evaluator.kind).toBe('github.pull-request');
  });

  it('flags PRs merged by their author and ignores reviewed or unmerged PRs', async () => {
    const context = makeContext({
      pullRequests: [
        makePR({ number: 1, author: 'alice', merged_by: 'alice' }),
        makePR({ number: 2, author: 'alice', merged_by: 'bob' }),
        makePR({ number: 3, author: 'alice', merged_by: null, merged_at: null }),
      ],
    });

    const result = await evaluator.evaluate(context, {}, 'medium');
    const issues = issuesOf(result);

    expect(result.controlId).toBe('HH-GH-001');
    expect(result.metadata?.itemsEvaluated).toBe(3);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'self-merge',
      severity: 'medium',
      repository: 'acme/app',
      description: 'PR #1 was self-merged by alice',
      details: { pr_number: 1, was_self_merged: true, is_security_related: false },
    });
  });

  it('raises severity for self-merged security PRs identified by the classifier', async () => {
    const context = makeContext({
      pullRequests: [
        makePR({ number: 1, author: 'alice', merged_by: 'alice' }),
        makePR({ number: 2, author: 'carol', merged_by: 'carol' }),
      ],
      classifierResults: classifierResultsFor([{ number: 2 }]),
    });

    const issues = issuesOf(await evaluator.evaluate(context, {}, 'low'));

    const security = issues.find((i) => i.details.pr_number === 2);
    const normal = issues.find((i) => i.details.pr_number === 1);
    expect(security?.severity).toBe('high');
    expect(security?.description).toBe('Security-related PR #2 was self-merged by carol');
    expect(security?.details.is_security_related).toBe(true);
    expect(normal?.severity).toBe('low');
  });

  it('honours severity_if_security and severity_default parameters', async () => {
    const context = makeContext({
      pullRequests: [
        makePR({ number: 1, author: 'alice', merged_by: 'alice' }),
        makePR({ number: 2, author: 'alice', merged_by: 'alice' }),
      ],
      classifierResults: classifierResultsFor([{ number: 2 }]),
    });

    const issues = issuesOf(
      await evaluator.evaluate(
        context,
        { severity_if_security: 'critical', severity_default: 'medium' },
        'low'
      )
    );

    expect(issues.map((i) => [i.details.pr_number, i.severity])).toEqual([
      [1, 'medium'],
      [2, 'critical'],
    ]);
  });

  it('ignores malformed classifier entries', async () => {
    const context = makeContext({
      pullRequests: [makePR({ number: 1, author: 'alice', merged_by: 'alice' })],
      classifierResults: new Map<string, unknown>([
        ['HH-GH-003', [null, 'oops', { details: null }, { details: {} }]],
      ]),
    });

    const issues = issuesOf(await evaluator.evaluate(context, {}, 'medium'));
    expect(issues[0].details.is_security_related).toBe(false);
  });

  it('validates severity parameters', () => {
    expect(() => evaluator.validateParameters({})).not.toThrow();
    expect(() =>
      evaluator.validateParameters({ severity_if_security: 'high', severity_default: 'low' })
    ).not.toThrow();
    expect(() => evaluator.validateParameters({ severity_if_security: 'severe' })).toThrow(
      ParameterValidationError
    );
    expect(() => evaluator.validateParameters({ severity_default: 5 })).toThrow(
      ParameterValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// HH-GH-003 Security PR classifier
// ---------------------------------------------------------------------------

describe('SecurityPRClassifier (HH-GH-003)', () => {
  const evaluator = new SecurityPRClassifier();
  const params = {
    keywords: ['security', 'CVE', 'vulnerability'],
    labels: ['security'],
    file_patterns: ['auth/', '.github/workflows/'],
    base_severity: 'medium',
  };

  it('identifies itself as a classifier', () => {
    expect(evaluator.controlId).toBe('HH-GH-003');
    expect(evaluator.kind).toBe('classifier');
  });

  it('classifies PRs by title keyword, label or changed file, case-insensitively', async () => {
    const context = makeContext({
      pullRequests: [
        makePR({ number: 1, title: 'Fix cve-2026-1234 in parser' }),
        makePR({ number: 2, labels: ['Security-Review'] }),
        makePR({ number: 3, files_changed: ['src/auth/login.ts', 'README.md'] }),
        makePR({ number: 4, title: 'Bump lodash' }),
      ],
    });

    const result = await evaluator.evaluate(context, params, 'low');
    const issues = issuesOf(result);

    expect(result.metadata?.itemsEvaluated).toBe(4);
    expect(issues.map((i) => i.details.pr_number)).toEqual([1, 2, 3]);
    expect(issues[0].details).toMatchObject({ matched_keywords: ['CVE'] });
    expect(issues[1].details).toMatchObject({ matched_labels: ['Security-Review'] });
    expect(issues[2].details).toMatchObject({ matched_files: ['src/auth/login.ts'] });
    expect(issues.every((i) => i.type === 'security-pr' && i.severity === 'medium')).toBe(true);
    expect(issues[0].description).toBe('Security-related PR: Fix cve-2026-1234 in parser');
  });

  it('uses the highest severity from keyword_severity_map', async () => {
    const context = makeContext({
      pullRequests: [
        makePR({ number: 1, title: 'Security: patch RCE vulnerability' }),
        makePR({ number: 2, title: 'Security docs update' }),
      ],
    });

    const issues = issuesOf(
      await evaluator.evaluate(
        context,
        {
          ...params,
          keyword_severity_map: [
            { keywords: ['vulnerability'], severity: 'high' },
            { keywords: ['rce'], severity: 'critical' },
            { keywords: ['docs'], severity: 'low' },
          ],
        },
        'low'
      )
    );

    // A lower-ranked mapping never downgrades below the base severity.
    expect(issues.map((i) => [i.details.pr_number, i.severity])).toEqual([
      [1, 'critical'],
      [2, 'medium'],
    ]);
  });

  it('limits reported files to file_limit and records self-merge state', async () => {
    const files = Array.from({ length: 15 }, (_, i) => `auth/file-${i}.ts`);
    const context = makeContext({
      pullRequests: [makePR({ author: 'alice', merged_by: 'alice', files_changed: files })],
    });

    const [issue] = issuesOf(
      await evaluator.evaluate(context, { ...params, file_limit: 3 }, 'low')
    );
    expect(issue.details.files_changed).toEqual(files.slice(0, 3));
    expect(issue.details.was_self_merged).toBe(true);

    const [defaultLimited] = issuesOf(await evaluator.evaluate(context, params, 'low'));
    expect(defaultLimited.details.files_changed).toHaveLength(10);
  });

  it('requires its list parameters and base_severity', () => {
    expect(() => evaluator.validateParameters(params)).not.toThrow();
    expect(() => evaluator.validateParameters({ ...params, keywords: undefined })).toThrow(
      /Required parameter 'keywords'/
    );
    expect(() => evaluator.validateParameters({ ...params, base_severity: 'huge' })).toThrow(
      ParameterValidationError
    );
  });

  it('validates the keyword_severity_map structure', () => {
    expect(() =>
      evaluator.validateParameters({
        ...params,
        keyword_severity_map: [{ keywords: ['rce'], severity: 'critical' }],
      })
    ).not.toThrow();
    expect(() =>
      evaluator.validateParameters({ ...params, keyword_severity_map: 'rce=critical' })
    ).toThrow('keyword_severity_map must be an array');
    expect(() =>
      evaluator.validateParameters({ ...params, keyword_severity_map: [{ keywords: ['rce'] }] })
    ).toThrow('Each keyword_severity_map entry must have keywords and severity fields');
  });
});

// ---------------------------------------------------------------------------
// HH-GH-002 Unreviewed security PR
// ---------------------------------------------------------------------------

describe('UnreviewedSecurityPREvaluator (HH-GH-002)', () => {
  const evaluator = new UnreviewedSecurityPREvaluator();

  it('flags only security PRs that were self-merged', async () => {
    const context = makeContext({
      pullRequests: [
        makePR({ number: 1, author: 'alice', merged_by: 'alice', title: 'Rotate keys' }),
        makePR({ number: 2, author: 'alice', merged_by: 'bob' }),
        makePR({ number: 3, author: 'alice', merged_by: 'alice' }),
        makePR({ number: 4, author: 'alice', merged_by: null }),
      ],
      classifierResults: classifierResultsFor([{ number: 1 }, { number: 2 }, { number: 4 }]),
    });

    const result = await evaluator.evaluate(context, {}, 'critical');
    const issues = issuesOf(result);

    expect(result.controlId).toBe('HH-GH-002');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'unreviewed-security-pr',
      severity: 'critical',
      description:
        'CRITICAL: Security PR #1 "Rotate keys" was merged by author alice without external review',
    });
  });

  it('reports nothing without classifier results', async () => {
    const context = makeContext({
      pullRequests: [makePR({ author: 'alice', merged_by: 'alice' })],
    });
    expect(issuesOf(await evaluator.evaluate(context, {}, 'high'))).toHaveLength(0);
  });

  it('limits reported files to file_limit', async () => {
    const context = makeContext({
      pullRequests: [
        makePR({ author: 'alice', merged_by: 'alice', files_changed: ['a', 'b', 'c', 'd'] }),
      ],
      classifierResults: classifierResultsFor([{ number: 1 }]),
    });

    const [issue] = issuesOf(await evaluator.evaluate(context, { file_limit: 2 }, 'high'));
    expect(issue.details.files_changed).toEqual(['a', 'b']);
  });

  it('validates file_limit', () => {
    expect(() => evaluator.validateParameters({})).not.toThrow();
    expect(() => evaluator.validateParameters({ file_limit: 5 })).not.toThrow();
    expect(() => evaluator.validateParameters({ file_limit: 'five' })).toThrow(
      ParameterValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// HH-GH-009 Security PR volume
// ---------------------------------------------------------------------------

describe('SecurityPRVolumeEvaluator (HH-GH-009)', () => {
  const evaluator = new SecurityPRVolumeEvaluator();

  const manyPRs = (counts: Record<string, number>) =>
    classifierResultsFor(
      Object.entries(counts).flatMap(([repository, n]) =>
        Array.from({ length: n }, (_, i) => ({ number: i + 1, repository }))
      )
    );

  it('stays quiet at or below the threshold', async () => {
    const context = makeContext({ classifierResults: manyPRs({ 'acme/app': 5 }) });
    const result = await evaluator.evaluate(context, {}, 'low');
    expect(issuesOf(result)).toHaveLength(0);
    expect(result.metadata?.itemsEvaluated).toBe(5);
  });

  it('recommends action above the threshold and names the top three repositories', async () => {
    const context = makeContext({
      classifierResults: manyPRs({ 'acme/a': 1, 'acme/b': 4, 'acme/c': 2, 'acme/d': 3 }),
    });

    const [issue] = issuesOf(await evaluator.evaluate(context, {}, 'low'));

    expect(issue).toMatchObject({
      type: 'security-pr-volume',
      severity: 'low',
      repository: 'organization-wide',
      details: {
        security_pr_count: 10,
        threshold: 5,
        top_repositories: 'acme/b (4 PRs), acme/d (3 PRs), acme/c (2 PRs)',
      },
    });
    expect(issue.description).toBe(
      'High volume of security PRs detected (10 PRs). Consider implementing automated dependency updates with Dependabot'
    );
  });

  it('uses custom threshold and recommendation', async () => {
    const context = makeContext({ classifierResults: manyPRs({ 'acme/app': 2 }) });
    const [issue] = issuesOf(
      await evaluator.evaluate(context, { threshold: 1, recommendation: 'Enable Renovate.' }, 'low')
    );
    expect(issue.description).toContain('Enable Renovate.');
    expect(issue.details.threshold).toBe(1);
  });

  it('treats missing classifier results as zero security PRs', async () => {
    const result = await evaluator.evaluate(makeContext(), {}, 'low');
    expect(issuesOf(result)).toHaveLength(0);
    expect(result.metadata?.itemsEvaluated).toBe(0);
  });

  it('validates optional parameters', () => {
    expect(() => evaluator.validateParameters({ threshold: 3, recommendation: 'x' })).not.toThrow();
    expect(() => evaluator.validateParameters({ threshold: 'three' })).toThrow(
      ParameterValidationError
    );
    expect(() => evaluator.validateParameters({ recommendation: 42 })).toThrow(
      ParameterValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// HH-GH-005 Paused workflows
// ---------------------------------------------------------------------------

describe('PausedWorkflowEvaluator (HH-GH-005)', () => {
  const evaluator = new PausedWorkflowEvaluator();

  const context = makeContext({
    repositories: [
      makeRepo([
        makeWorkflow({ name: 'Nightly', state: 'disabled_inactivity', is_scheduled: true }),
        makeWorkflow({ name: 'Docs', state: 'disabled_inactivity', is_scheduled: false }),
        makeWorkflow({ name: 'CI', state: 'active' }),
        makeWorkflow({ name: 'Old', state: 'disabled_manually' }),
      ]),
      makeRepo(undefined, 'no-workflows'),
    ],
  });

  it('flags workflows disabled for inactivity, with higher severity when scheduled', async () => {
    const result = await evaluator.evaluate(context, {}, 'medium');
    const issues = issuesOf(result);

    expect(result.controlId).toBe('HH-GH-005');
    expect(result.metadata?.itemsEvaluated).toBe(4);
    expect(issues.map((i) => [i.details.workflow_name, i.severity])).toEqual([
      ['Nightly', 'medium'],
      ['Docs', 'low'],
    ]);
    expect(issues[0]).toMatchObject({
      type: 'paused-workflow',
      repository: 'acme/app',
      description: 'Workflow "Nightly" is paused due to inactivity',
    });
    expect(issues[0].details.reason).toContain('after 60 days');
  });

  it('honours its parameters', async () => {
    const issues = issuesOf(
      await evaluator.evaluate(
        context,
        {
          workflow_state: 'disabled_manually',
          severity_if_scheduled: 'critical',
          severity_default: 'high',
          inactivity_period_days: 90,
        },
        'low'
      )
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].details.workflow_name).toBe('Old');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].details.reason).toContain('after 90 days');
  });

  it('validates parameter types', () => {
    expect(() =>
      evaluator.validateParameters({
        workflow_state: 'disabled_inactivity',
        severity_if_scheduled: 'high',
        severity_default: 'low',
        inactivity_period_days: 30,
      })
    ).not.toThrow();
    expect(() => evaluator.validateParameters({ workflow_state: 1 })).toThrow(
      ParameterValidationError
    );
    expect(() => evaluator.validateParameters({ severity_if_scheduled: 'x' })).toThrow(
      ParameterValidationError
    );
    expect(() => evaluator.validateParameters({ severity_default: 'x' })).toThrow(
      ParameterValidationError
    );
    expect(() => evaluator.validateParameters({ inactivity_period_days: '30' })).toThrow(
      ParameterValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// HH-GH-006 Disabled workflows
// ---------------------------------------------------------------------------

describe('DisabledWorkflowEvaluator (HH-GH-006)', () => {
  const evaluator = new DisabledWorkflowEvaluator();

  it('flags manually disabled workflows across repositories', async () => {
    const context = makeContext({
      repositories: [
        makeRepo([makeWorkflow({ name: 'Deploy', state: 'disabled_manually' })], 'web'),
        makeRepo([makeWorkflow({ name: 'CI', state: 'active' })], 'api'),
        makeRepo(undefined, 'empty'),
      ],
    });

    const result = await evaluator.evaluate(context, {}, 'high');
    const issues = issuesOf(result);

    expect(result.metadata?.itemsEvaluated).toBe(2);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'disabled-workflow',
      severity: 'high',
      repository: 'acme/web',
      description: 'Workflow "Deploy" has been manually disabled',
      details: { workflow_path: '.github/workflows/ci.yml' },
    });
  });

  it('can target a different workflow state', async () => {
    const context = makeContext({
      repositories: [makeRepo([makeWorkflow({ state: 'disabled_inactivity' })])],
    });
    const issues = issuesOf(
      await evaluator.evaluate(context, { workflow_state: 'disabled_inactivity' }, 'low')
    );
    expect(issues).toHaveLength(1);
  });

  it('validates workflow_state', () => {
    expect(() => evaluator.validateParameters({})).not.toThrow();
    expect(() => evaluator.validateParameters({ workflow_state: true })).toThrow(
      ParameterValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// HH-GH-007 / HH-GH-008 Workflow failures
// ---------------------------------------------------------------------------

describe('RepeatedActionFailureEvaluator (HH-GH-007)', () => {
  const evaluator = new RepeatedActionFailureEvaluator();

  it('flags workflows failing at least `threshold` times, most recent runs first', async () => {
    const context = makeContext({
      workflowRuns: [
        makeRun({ run_number: 1, created_at: '2026-04-01T00:00:00Z' }),
        makeRun({ run_number: 3, created_at: '2026-04-03T00:00:00Z' }),
        makeRun({ run_number: 2, created_at: '2026-04-02T00:00:00Z' }),
        makeRun({ run_number: 4, conclusion: 'success' }),
        makeRun({ workflow_name: 'Lint', run_number: 9 }),
      ],
    });

    const result = await evaluator.evaluate(context, {}, 'medium');
    const issues = issuesOf(result);

    expect(result.controlId).toBe('HH-GH-007');
    expect(result.metadata?.itemsEvaluated).toBe(5);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'repeated_action_failure',
      severity: 'medium',
      repository: 'acme/app',
      description: 'Workflow "CI" has failed 3 times',
      details: { workflow_name: 'CI', failure_count: 3 },
    });
    expect(
      (issues[0].details.recent_runs as Array<{ run_number: number }>).map((r) => r.run_number)
    ).toEqual([3, 2, 1]);
  });

  it('keeps workflow names that contain a colon intact', async () => {
    const context = makeContext({
      workflowRuns: [1, 2, 3].map((n) =>
        makeRun({ run_number: n, workflow_name: 'CI: build & test' })
      ),
    });

    const [issue] = issuesOf(await evaluator.evaluate(context, {}, 'medium'));

    expect(issue.repository).toBe('acme/app');
    expect(issue.details.workflow_name).toBe('CI: build & test');
    expect(issue.description).toBe('Workflow "CI: build & test" has failed 3 times');
  });

  it('separates the same workflow name in different repositories', async () => {
    const context = makeContext({
      workflowRuns: [
        makeRun({ repository: 'acme/a' }),
        makeRun({ repository: 'acme/a' }),
        makeRun({ repository: 'acme/b' }),
        makeRun({ repository: 'acme/b' }),
      ],
    });

    const issues = issuesOf(await evaluator.evaluate(context, { threshold: 2 }, 'low'));
    expect(issues.map((i) => i.repository).sort()).toEqual(['acme/a', 'acme/b']);
  });

  it('caps recent_runs at recent_limit', async () => {
    const context = makeContext({
      workflowRuns: Array.from({ length: 6 }, (_, i) =>
        makeRun({ run_number: i + 1, created_at: `2026-04-0${i + 1}T00:00:00Z` })
      ),
    });

    const [issue] = issuesOf(await evaluator.evaluate(context, { recent_limit: 2 }, 'low'));
    expect(issue.details.recent_runs).toHaveLength(2);
  });

  it('validates optional numeric parameters', () => {
    expect(() => evaluator.validateParameters({ threshold: 2, recent_limit: 3 })).not.toThrow();
    expect(() => evaluator.validateParameters({ threshold: '2' })).toThrow(
      ParameterValidationError
    );
    expect(() => evaluator.validateParameters({ recent_limit: [] })).toThrow(
      ParameterValidationError
    );
  });
});

describe('ActionFailureEvaluator (HH-GH-008)', () => {
  const evaluator = new ActionFailureEvaluator();

  it('reports workflows with exactly one failure, leaving repeats to HH-GH-007', async () => {
    const context = makeContext({
      workflowRuns: [
        makeRun({ id: 7, workflow_name: 'Deploy', run_number: 12, head_sha: 'def456' }),
        makeRun({ workflow_name: 'CI' }),
        makeRun({ workflow_name: 'CI' }),
        makeRun({ workflow_name: 'Lint', conclusion: 'success' }),
        makeRun({ workflow_name: 'Docs', conclusion: 'cancelled' }),
      ],
    });

    const result = await evaluator.evaluate(context, {}, 'low');
    const issues = issuesOf(result);

    expect(result.controlId).toBe('HH-GH-008');
    expect(result.metadata?.itemsEvaluated).toBe(5);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'action_failure',
      severity: 'low',
      repository: 'acme/app',
      description: 'Workflow "Deploy" failed (run #12)',
      details: { run_id: 7, head_sha: 'def456', event: 'push' },
    });
  });

  it('accepts any parameters', () => {
    expect(() => evaluator.validateParameters({ anything: true })).not.toThrow();
  });
});
