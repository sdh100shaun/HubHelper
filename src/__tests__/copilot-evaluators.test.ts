import path from 'node:path';
import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  CopilotAgentPrUnreviewedEvaluator,
  CopilotDuplicateSeatEvaluator,
  CopilotIdleSeatEvaluator,
  CopilotOrgPolicyDriftEvaluator,
  CopilotPublicCodeMatchingEvaluator,
  CopilotSeatSprawlEvaluator,
  CopilotSpendThresholdEvaluator,
  CopilotUnallocatedSpendEvaluator,
  CopilotUnapprovedClientEvaluator,
  CopilotUnapprovedModelEvaluator,
} from '../evaluators/copilot-evaluators.js';
import { PolicyEngine } from '../policy/engine.js';
import type { EvaluationContext } from '../policy/types.js';
import type { CopilotUsageModel } from '../services/copilot/model.js';
import { CopilotUsageAggregator } from '../services/copilot/usage-aggregator.js';
import type { SecurityIssue } from '../types/index.js';
import { buildFixtureStore, FIXTURE_RANGE } from './helpers/copilot-fixtures.js';

const ENT = { kind: 'enterprise' as const, enterprise: 'mega' };
const ORG = { kind: 'org' as const, org: 'acme' };

let ent: CopilotUsageModel;
let org: CopilotUsageModel;

function ctx(model?: CopilotUsageModel): EvaluationContext {
  return {
    repositories: [],
    pullRequests: [],
    workflowRuns: [],
    scope: { 'lookback-days': 30 },
    copilot: model,
  };
}

async function run(
  evaluator: {
    evaluate: (
      c: EvaluationContext,
      p: Record<string, unknown>,
      s: 'low'
    ) => Promise<{ issues: unknown[] }>;
  },
  model: CopilotUsageModel | undefined,
  params: Record<string, unknown> = {}
): Promise<SecurityIssue[]> {
  return (await evaluator.evaluate(ctx(model), params, 'low')).issues as SecurityIssue[];
}

beforeAll(async () => {
  const e = await buildFixtureStore(ENT, {
    duplicateSeat: ['ivan'],
    publicCode: { labs: 'allow' },
  });
  ent = new CopilotUsageAggregator(e.store).build(ENT, FIXTURE_RANGE);
  const o = await buildFixtureStore(ORG);
  org = new CopilotUsageAggregator(o.store).build(ORG, FIXTURE_RANGE);
});

describe('Copilot evaluators', () => {
  it('return nothing without Copilot data', async () => {
    for (const E of [
      CopilotIdleSeatEvaluator,
      CopilotPublicCodeMatchingEvaluator,
      CopilotAgentPrUnreviewedEvaluator,
      CopilotSeatSprawlEvaluator,
    ]) {
      const result = await new E().evaluate(ctx(), {}, 'low');
      expect(result.issues).toEqual([]);
      expect(result.metadata?.itemsEvaluated).toBe(0);
    }
  });

  it('HH-GH-011 flags idle and never-used seats', async () => {
    const issues = await run(new CopilotIdleSeatEvaluator(), org, { inactive_days: 30 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'copilot-idle-seat',
      repository: 'acme',
      details: { login: 'frank', control_id: 'HH-GH-011' },
    });
    expect(issues[0].description).toContain('not been used since it was assigned');
    const idle = {
      ...org,
      seats: {
        ...org.seats,
        all: [{ ...org.seats.all[0], idleDays: 40, lastActivityAt: '2026-10-01T00:00:00Z' }],
      },
    };
    expect((await run(new CopilotIdleSeatEvaluator(), idle))[0].description).toContain(
      'idle for 40 days'
    );
  });

  it('HH-GH-012 flags orgs allowing public code matches', async () => {
    const issues = await run(new CopilotPublicCodeMatchingEvaluator(), ent);
    expect(issues.map((i) => i.repository)).toEqual(['labs']);
    expect(
      await run(new CopilotPublicCodeMatchingEvaluator(), ent, { required_setting: 'allow' })
    ).toHaveLength(1);
  });

  it('HH-GH-013 flags models outside the allow list, with variants allowed', async () => {
    expect(await run(new CopilotUnapprovedModelEvaluator(), ent)).toEqual([]);
    const issues = await run(new CopilotUnapprovedModelEvaluator(), ent, {
      allowed_models: ['GPT-5', 'claude-sonnet'],
    });
    expect(issues.map((i) => i.details.model)).toEqual(['o4-mini']);
  });

  it('HH-GH-014 flags clients and IDEs outside the allow list', async () => {
    expect(await run(new CopilotUnapprovedClientEvaluator(), ent)).toEqual([]);
    const issues = await run(new CopilotUnapprovedClientEvaluator(), ent, {
      allowed_clients: ['vscode', 'jetbrains'],
    });
    expect(issues.map((i) => i.details.client).sort()).toEqual(['neovim', 'opencode']);
  });

  it('HH-GH-015 flags agent PRs merged without human approval', async () => {
    const issues = await run(new CopilotAgentPrUnreviewedEvaluator(), org);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      repository: 'acme/api',
      details: { pr_number: 42, requested_by: 'carol' },
    });
  });

  it('HH-GH-016 checks the budget forecast and per-user cap', async () => {
    expect(await run(new CopilotSpendThresholdEvaluator(), org)).toEqual([]);
    const issues = await run(new CopilotSpendThresholdEvaluator(), org, {
      monthly_budget: 10,
      per_user_cap: 50,
    });
    expect(issues[0].description).toContain('above the budget of 10');
    expect(
      issues
        .slice(1)
        .map((i) => i.details.login)
        .sort()
    ).toEqual(['alice', 'carol', 'erin']);
  });

  it('HH-GH-017 flags direct seat assignment above the limit', async () => {
    expect(await run(new CopilotSeatSprawlEvaluator(), org, { max_direct_pct: 50 })).toEqual([]);
    const issues = await run(new CopilotSeatSprawlEvaluator(), org, { max_direct_pct: 10 });
    expect(issues[0].details).toMatchObject({ direct_pct: 16.7, limit: 10 });
    const none = { ...org, seats: { ...org.seats, directAssignedPct: null } };
    expect(await run(new CopilotSeatSprawlEvaluator(), none)).toEqual([]);
  });

  it('HH-GH-018 flags duplicate seats in enterprises only', async () => {
    expect(
      (await run(new CopilotDuplicateSeatEvaluator(), ent)).map((i) => i.details.login)
    ).toEqual(['ivan']);
    expect(await run(new CopilotDuplicateSeatEvaluator(), org)).toEqual([]);
  });

  it('HH-GH-019 compares org settings with the baseline', async () => {
    const issues = await run(new CopilotOrgPolicyDriftEvaluator(), ent, {
      baseline: [
        'public_code_suggestions=block',
        'ide_chat=enabled',
        'missing=x',
        'malformed',
        '=x',
      ],
    });
    expect(issues.map((i) => `${i.repository}:${i.details.setting}`)).toEqual([
      'labs:public_code_suggestions',
    ]);
    expect(
      await run(new CopilotOrgPolicyDriftEvaluator(), org, { baseline: ['cli=disabled'] })
    ).toEqual([]);
  });

  it('HH-GH-020 flags spend without a cost centre', async () => {
    const issues = await run(new CopilotUnallocatedSpendEvaluator(), ent, {
      max_unallocated_pct: 10,
    });
    expect(issues).toHaveLength(1);
    expect(
      await run(new CopilotUnallocatedSpendEvaluator(), ent, { max_unallocated_pct: 99 })
    ).toEqual([]);
    expect(await run(new CopilotUnallocatedSpendEvaluator(), org)).toEqual([]);
    const noCredits = { ...ent, kpis: { ...ent.kpis, aiCreditsUsed: 0 } };
    expect(await run(new CopilotUnallocatedSpendEvaluator(), noCredits)).toEqual([]);
  });
});

describe('Copilot policy profiles', () => {
  const policies = path.resolve(__dirname, '../../policies');

  it('the copilot profile evaluates all ten controls against a model', async () => {
    const engine = new PolicyEngine();
    await engine.loadPolicy(path.join(policies, 'copilot.yaml'));
    const result = await engine.evaluate([], [], [], undefined, ent);
    expect(result.statistics.controlsEvaluated).toBe(10);
    const types = new Set(result.issues.map((i) => i.type));
    expect(types).toEqual(
      new Set([
        'copilot-idle-seat',
        'copilot-public-code-matching',
        'copilot-agent-pr-unreviewed',
        'copilot-duplicate-seat',
        'copilot-org-policy-drift',
        'copilot-unallocated-spend',
      ])
    );
  });

  it('the default profile is unaffected when no Copilot data is passed', async () => {
    const engine = new PolicyEngine();
    await engine.loadPolicy(path.join(policies, 'default.yaml'));
    const result = await engine.evaluate([], [], []);
    expect(result.issues.filter((i) => i.type.startsWith('copilot-'))).toEqual([]);
  });
});
