/**
 * Tests for the Control Review State feature (Phase 1)
 *
 * Covers:
 * - resolveControlState logic (state vs. legacy enabled)
 * - filterControls excludes 'disabled' but keeps 'review'
 * - resolveControl produces correct state and enabled fields
 * - PolicyEngine segregates review issues into reviewIssues
 * - ConsoleReporter renders the "Controls Under Review" section
 */

import { resolvePolicy } from '../policy/resolver.js';
import type {
  Catalog,
  Control,
  ControlTailoring,
  Profile,
  ResolvedControl,
} from '../policy/types.js';

// ─── Minimal catalog/profile builders ──────────────────────────────────────

function makeControl(overrides: Partial<Control> = {}): Control {
  return {
    id: 'HH-TEST-001',
    statement: 'Test control',
    family: 'test',
    evaluator: { kind: 'github.repository', detector: 'disabled-actions' },
    parameter: [],
    'default-severity': 'medium',
    enabled: true,
    ...overrides,
  };
}

function makeCatalog(controls: Control[]): Catalog {
  return {
    metadata: {
      title: 'Test Catalog',
      version: '1.0.0',
      'last-modified': '2024-01-01T00:00:00.000Z',
      'oscal-version': '1.0.0',
    },
    controls,
  };
}

function makeProfile(include: string[], tailoring: ControlTailoring[] = []): Profile {
  return {
    metadata: { title: 'Test Profile', version: '1.0.0' },
    'catalog-ref': { href: 'catalog.yaml', version: '1.0.0' },
    controls: { include, exclude: [], tailoring },
  };
}

// ─── resolveControlState (tested via resolvePolicy outcome) ─────────────────

describe('resolveControlState via resolver', () => {
  it('defaults to active when neither state nor enabled is set', () => {
    // Omit state and enabled entirely via a partial build
    const control = {
      id: 'C1',
      statement: 'Test control',
      family: 'test',
      evaluator: { kind: 'github.repository', detector: 'disabled-actions' },
      parameter: [],
      'default-severity': 'medium',
    } as unknown as Control;
    const catalog = makeCatalog([control]);
    const profile = makeProfile(['C1']);
    const resolved = resolvePolicy(catalog, profile);
    expect(resolved.controls[0].state).toBe('active');
    expect(resolved.controls[0].enabled).toBe(true);
  });

  it('maps enabled:true → state:active', () => {
    const control = makeControl({ id: 'C1', enabled: true });
    const catalog = makeCatalog([control]);
    const profile = makeProfile(['C1']);
    const resolved = resolvePolicy(catalog, profile);
    expect(resolved.controls[0].state).toBe('active');
    expect(resolved.controls[0].enabled).toBe(true);
  });

  it('maps enabled:false → state:disabled (and is excluded)', () => {
    const control = makeControl({ id: 'C1', enabled: false });
    const catalog = makeCatalog([control]);
    const profile = makeProfile(['C1']);
    const resolved = resolvePolicy(catalog, profile);
    // disabled controls are filtered out during resolution
    expect(resolved.controls).toHaveLength(0);
  });

  it('honors explicit state:disabled even if enabled:true', () => {
    const control = makeControl({ id: 'C1', state: 'disabled', enabled: true });
    const catalog = makeCatalog([control]);
    const profile = makeProfile(['C1']);
    const resolved = resolvePolicy(catalog, profile);
    expect(resolved.controls).toHaveLength(0);
  });

  it('honors explicit state:review', () => {
    const control = makeControl({ id: 'C1', state: 'review' });
    const catalog = makeCatalog([control]);
    const profile = makeProfile(['C1']);
    const resolved = resolvePolicy(catalog, profile);
    expect(resolved.controls[0].state).toBe('review');
    expect(resolved.controls[0].enabled).toBe(true);
  });

  it('honors explicit state:active', () => {
    const control = makeControl({ id: 'C1', state: 'active' });
    const catalog = makeCatalog([control]);
    const profile = makeProfile(['C1']);
    const resolved = resolvePolicy(catalog, profile);
    expect(resolved.controls[0].state).toBe('active');
  });
});

describe('tailoring overrides for state', () => {
  it('tailoring state:review overrides catalog active', () => {
    const control = makeControl({ id: 'C1', state: 'active' });
    const catalog = makeCatalog([control]);
    const tailoring: ControlTailoring = { 'control-id': 'C1', state: 'review' };
    const profile = makeProfile(['C1'], [tailoring]);
    const resolved = resolvePolicy(catalog, profile);
    expect(resolved.controls[0].state).toBe('review');
  });

  it('tailoring enabled:false overrides catalog active → disabled state', () => {
    const control = makeControl({ id: 'C1', state: 'active' });
    const catalog = makeCatalog([control]);
    const tailoring: ControlTailoring = { 'control-id': 'C1', enabled: false };
    const profile = makeProfile(['C1'], [tailoring]);
    const resolved = resolvePolicy(catalog, profile);
    // The control is resolved with state:'disabled'; engine skips it during evaluation
    expect(resolved.controls[0].state).toBe('disabled');
    expect(resolved.controls[0].enabled).toBe(false);
  });

  it('tailoring enabled:true when catalog is review keeps active', () => {
    const control = makeControl({ id: 'C1', state: 'review' });
    const catalog = makeCatalog([control]);
    const tailoring: ControlTailoring = { 'control-id': 'C1', enabled: true };
    const profile = makeProfile(['C1'], [tailoring]);
    const resolved = resolvePolicy(catalog, profile);
    expect(resolved.controls[0].state).toBe('active');
  });

  it('tailoring with no state/enabled fields inherits catalog state', () => {
    const control = makeControl({ id: 'C1', state: 'review' });
    const catalog = makeCatalog([control]);
    const tailoring: ControlTailoring = {
      'control-id': 'C1',
      'parameter-values': {},
    };
    const profile = makeProfile(['C1'], [tailoring]);
    const resolved = resolvePolicy(catalog, profile);
    expect(resolved.controls[0].state).toBe('review');
  });
});

describe('filterControls keeps review controls', () => {
  it('review controls are included in resolved policy', () => {
    const c1 = makeControl({ id: 'C1', state: 'active' });
    const c2 = makeControl({ id: 'C2', state: 'review' });
    const c3 = makeControl({ id: 'C3', state: 'disabled' });
    const catalog = makeCatalog([c1, c2, c3]);
    const profile = makeProfile(['C1', 'C2', 'C3']);
    const resolved = resolvePolicy(catalog, profile);
    const ids = resolved.controls.map((c) => c.id);
    expect(ids).toContain('C1');
    expect(ids).toContain('C2');
    expect(ids).not.toContain('C3');
  });
});

// ─── PolicyEngine segregation ───────────────────────────────────────────────

import { PolicyEngine } from '../policy/engine.js';
import { evaluatorRegistry } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, ResolvedPolicy } from '../policy/types.js';
import type { SecurityIssue } from '../types/index.js';

function makeIssue(repo: string, type: SecurityIssue['type'] = 'disabled-actions'): SecurityIssue {
  return {
    type,
    severity: 'medium',
    repository: repo,
    description: `Test issue in ${repo}`,
    details: { repo_name: repo },
    detected_at: new Date().toISOString(),
  };
}

describe('PolicyEngine review state segregation', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  it('places active control issues in issues array', async () => {
    const mockResolvedPolicy: ResolvedPolicy = {
      metadata: { catalogVersion: '1.0.0', profileVersion: '1.0.0', profileTitle: 'Test' },
      controls: [
        {
          id: 'C1',
          statement: 'Active control',
          family: 'test',
          evaluator: { kind: 'github.repository', detector: 'test-detector-active' },
          parameters: [],
          severity: 'medium',
          state: 'active',
          enabled: true,
        } as unknown as ResolvedControl,
      ],
      scope: { 'lookback-days': 30 },
      reporting: { formats: ['console'], 'include-recommendations': true },
    };

    const mockEvaluator = {
      controlId: 'C1',
      kind: 'github.repository' as const,
      evaluate: jest.fn().mockResolvedValue({
        controlId: 'C1',
        issues: [makeIssue('repo-1')],
      } as EvaluationResult),
      validateParameters: jest.fn(),
    };

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    jest.spyOn(evaluatorRegistry, 'get').mockReturnValue(mockEvaluator as any);
    // biome-ignore lint/suspicious/noExplicitAny: test private field access
    (engine as any).policy = mockResolvedPolicy;

    const result = await engine.evaluate([], [], []);
    expect(result.issues).toHaveLength(1);
    expect(result.reviewIssues).toHaveLength(0);
  });

  it('places review control issues in reviewIssues array', async () => {
    const mockResolvedPolicy: ResolvedPolicy = {
      metadata: { catalogVersion: '1.0.0', profileVersion: '1.0.0', profileTitle: 'Test' },
      controls: [
        {
          id: 'C2',
          statement: 'Review control',
          family: 'test',
          evaluator: { kind: 'github.repository', detector: 'test-detector-review' },
          parameters: [],
          severity: 'medium',
          state: 'review',
          enabled: true,
        } as unknown as ResolvedControl,
      ],
      scope: { 'lookback-days': 30 },
      reporting: { formats: ['console'], 'include-recommendations': true },
    };

    const mockEvaluator = {
      controlId: 'C2',
      kind: 'github.repository' as const,
      evaluate: jest.fn().mockResolvedValue({
        controlId: 'C2',
        issues: [makeIssue('repo-2')],
      } as EvaluationResult),
      validateParameters: jest.fn(),
    };

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    jest.spyOn(evaluatorRegistry, 'get').mockReturnValue(mockEvaluator as any);
    // biome-ignore lint/suspicious/noExplicitAny: test private field access
    (engine as any).policy = mockResolvedPolicy;

    const result = await engine.evaluate([], [], []);
    expect(result.issues).toHaveLength(0);
    expect(result.reviewIssues).toHaveLength(1);
    expect(result.reviewIssues[0].repository).toBe('repo-2');
  });

  it('statistics.totalIssues excludes review issues', async () => {
    const mockResolvedPolicy: ResolvedPolicy = {
      metadata: { catalogVersion: '1.0.0', profileVersion: '1.0.0', profileTitle: 'Test' },
      controls: [
        {
          id: 'C1',
          statement: 'Active',
          family: 'test',
          evaluator: { kind: 'github.repository', detector: 'det-1' },
          parameters: [],
          severity: 'medium',
          state: 'active',
          enabled: true,
        } as unknown as ResolvedControl,
        {
          id: 'C2',
          statement: 'Review',
          family: 'test',
          evaluator: { kind: 'github.repository', detector: 'det-2' },
          parameters: [],
          severity: 'medium',
          state: 'review',
          enabled: true,
        } as unknown as ResolvedControl,
      ],
      scope: { 'lookback-days': 30 },
      reporting: { formats: ['console'], 'include-recommendations': true },
    };

    jest.spyOn(evaluatorRegistry, 'get').mockImplementation(
      (detector: string) =>
        ({
          controlId: detector === 'det-1' ? 'C1' : 'C2',
          kind: 'github.repository' as const,
          evaluate: jest.fn().mockResolvedValue({
            controlId: detector === 'det-1' ? 'C1' : 'C2',
            issues: [makeIssue(detector)],
          } as EvaluationResult),
          validateParameters: jest.fn(),
          // biome-ignore lint/suspicious/noExplicitAny: test mock
        }) as any
    );

    // biome-ignore lint/suspicious/noExplicitAny: test private field access
    (engine as any).policy = mockResolvedPolicy;

    const result = await engine.evaluate([], [], []);
    expect(result.issues).toHaveLength(1);
    expect(result.reviewIssues).toHaveLength(1);
    expect(result.statistics.totalIssues).toBe(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});

// ─── ConsoleReporter renders review section ─────────────────────────────────

import { ConsoleReporter } from '../reporters/console-reporter.js';
import type { AnalysisResult } from '../types/index.js';

describe('ConsoleReporter review issues section', () => {
  let reporter: ConsoleReporter;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    reporter = new ConsoleReporter();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders "Controls Under Review" section when reviewIssues present', () => {
    const result: AnalysisResult = {
      summary: 'Test',
      issues: [],
      reviewIssues: [makeIssue('repo-review')],
      recommendations: [],
      statistics: {
        total_repos: 1,
        total_prs: 0,
        self_merges: 0,
        security_prs: 0,
        repos_with_disabled_actions: 1,
        paused_workflows: 0,
        disabled_workflows: 0,
      },
    };

    reporter.printAnalysisResult(result);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/Controls Under Review/);
    expect(allOutput).toMatch(/informational/);
  });

  it('does not render review section when reviewIssues is empty', () => {
    const result: AnalysisResult = {
      summary: 'Test',
      issues: [],
      reviewIssues: [],
      recommendations: [],
      statistics: {
        total_repos: 1,
        total_prs: 0,
        self_merges: 0,
        security_prs: 0,
        repos_with_disabled_actions: 0,
        paused_workflows: 0,
        disabled_workflows: 0,
      },
    };

    reporter.printAnalysisResult(result);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).not.toMatch(/Controls Under Review/);
  });

  it('does not render review section when reviewIssues is undefined', () => {
    const result: AnalysisResult = {
      summary: 'Test',
      issues: [],
      recommendations: [],
      statistics: {
        total_repos: 1,
        total_prs: 0,
        self_merges: 0,
        security_prs: 0,
        repos_with_disabled_actions: 0,
        paused_workflows: 0,
        disabled_workflows: 0,
      },
    };

    reporter.printAnalysisResult(result);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).not.toMatch(/Controls Under Review/);
  });
});
