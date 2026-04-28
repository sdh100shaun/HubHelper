/**
 * Unit tests for ContractorRepoAccessEvaluator (HH-GH-010)
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { ContractorRepoAccessEvaluator } from '../evaluators/contractor-repo-access-evaluator.js';
import type { EvaluationContext } from '../policy/types.js';
import type { PullRequest, Repository, UserProfile } from '../types/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeRepo = (name: string): Repository => ({
  name,
  full_name: `myorg/${name}`,
  private: false,
  actions_enabled: true,
  security_enabled: false,
});

const makePR = (author: string, repo: string, number = 1): PullRequest => ({
  number,
  title: 'Test PR',
  url: `https://github.com/myorg/${repo}/pull/${number}`,
  author,
  merged_by: 'other-user',
  merged_at: '2026-04-01T00:00:00Z',
  created_at: '2026-04-01T00:00:00Z',
  repository: `myorg/${repo}`,
  labels: [],
  is_security_related: false,
  files_changed: ['src/index.ts'],
});

const makeUser = (login: string, email: string | null): UserProfile => ({
  login,
  name: 'Test User',
  email,
});

const defaultContext = (overrides: Partial<EvaluationContext> = {}): EvaluationContext => ({
  repositories: [makeRepo('client-project'), makeRepo('internal-api')],
  pullRequests: [],
  workflowRuns: [],
  scope: { 'lookback-days': 30 },
  classifierResults: new Map(),
  ...overrides,
});

const defaultParams = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  contractor_domains: ['contractor.io'],
  allowed_repos: ['client-project'],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContractorRepoAccessEvaluator', () => {
  let evaluator: ContractorRepoAccessEvaluator;

  beforeEach(() => {
    evaluator = new ContractorRepoAccessEvaluator();
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------
  it('has correct controlId and kind', () => {
    expect(evaluator.controlId).toBe('HH-GH-010');
    expect(evaluator.kind).toBe('github.repository');
  });

  // -------------------------------------------------------------------------
  // Early-exit paths
  // -------------------------------------------------------------------------
  it('returns no issues when contractor_domains is empty', async () => {
    const result = await evaluator.evaluate(
      defaultContext({ orgMembers: [makeUser('alice', 'alice@contractor.io')] }),
      defaultParams({ contractor_domains: [] }),
      'high'
    );
    expect(result.issues).toHaveLength(0);
    expect(result.metadata?.itemsEvaluated).toBe(0);
  });

  it('returns no issues when orgMembers is absent from context', async () => {
    const ctx = defaultContext({
      pullRequests: [makePR('alice', 'internal-api')],
    });
    ctx.orgMembers = undefined;

    const result = await evaluator.evaluate(ctx, defaultParams(), 'high');
    expect(result.issues).toHaveLength(0);
  });

  it('returns no issues when no org members match the contractor domain', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('bob', 'bob@company.com')],
        pullRequests: [makePR('bob', 'internal-api')],
      }),
      defaultParams(),
      'high'
    );
    expect(result.issues).toHaveLength(0);
  });

  it('returns no issues when contractor members have no PRs in context', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [],
      }),
      defaultParams(),
      'high'
    );
    expect(result.issues).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Allowed-repo enforcement
  // -------------------------------------------------------------------------
  it('raises no issue when contractor PR is in an allowed repo', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [makePR('alice', 'client-project')],
      }),
      defaultParams({ allowed_repos: ['client-project'] }),
      'high'
    );
    expect(result.issues).toHaveLength(0);
  });

  it('raises an issue when contractor PR is in a non-allowed repo', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [makePR('alice', 'internal-api')],
      }),
      defaultParams({ allowed_repos: ['client-project'] }),
      'high'
    );

    expect(result.issues).toHaveLength(1);
    const issue = result.issues[0] as {
      type: string;
      severity: string;
      repository: string;
      description: string;
      details: Record<string, unknown>;
    };
    expect(issue.type).toBe('contractor-repo-access');
    expect(issue.severity).toBe('high');
    expect(issue.repository).toBe('myorg/internal-api');
    expect(issue.details.contractor_login).toBe('alice');
    expect(issue.details.contractor_email).toBe('alice@contractor.io');
    expect(issue.details.repo_name).toBe('internal-api');
  });

  it('uses the severity passed in as parameter', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [makePR('alice', 'internal-api')],
      }),
      defaultParams({ allowed_repos: [] }),
      'critical'
    );

    expect(result.issues).toHaveLength(1);
    expect((result.issues[0] as { severity: string }).severity).toBe('critical');
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------
  it('deduplicates multiple PRs from the same contractor to the same repo', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [
          makePR('alice', 'internal-api', 1),
          makePR('alice', 'internal-api', 2),
          makePR('alice', 'internal-api', 3),
        ],
      }),
      defaultParams({ allowed_repos: [] }),
      'high'
    );

    expect(result.issues).toHaveLength(1);
  });

  it('creates separate issues for the same contractor in different non-allowed repos', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        repositories: [makeRepo('client-project'), makeRepo('internal-api'), makeRepo('backend')],
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [makePR('alice', 'internal-api', 1), makePR('alice', 'backend', 2)],
      }),
      defaultParams({ allowed_repos: ['client-project'] }),
      'high'
    );

    expect(result.issues).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Non-contractor members
  // -------------------------------------------------------------------------
  it('does not flag non-contractor members in any repo', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io'), makeUser('bob', 'bob@company.com')],
        pullRequests: [
          makePR('alice', 'client-project'), // allowed
          makePR('bob', 'internal-api'), // not a contractor, should not be flagged
        ],
      }),
      defaultParams({ allowed_repos: ['client-project'] }),
      'high'
    );

    expect(result.issues).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Domain matching edge cases
  // -------------------------------------------------------------------------
  it('matches contractor domain case-insensitively', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@CONTRACTOR.IO')],
        pullRequests: [makePR('alice', 'internal-api')],
      }),
      defaultParams({ contractor_domains: ['contractor.io'] }),
      'high'
    );

    expect(result.issues).toHaveLength(1);
  });

  it('handles contractor_domains entries with leading @ gracefully', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [makePR('alice', 'internal-api')],
      }),
      defaultParams({ contractor_domains: ['@contractor.io'] }),
      'high'
    );

    expect(result.issues).toHaveLength(1);
  });

  it('skips members with null email', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', null)],
        pullRequests: [makePR('alice', 'internal-api')],
      }),
      defaultParams(),
      'high'
    );

    expect(result.issues).toHaveLength(0);
  });

  it('strips org prefix from allowed_repos entries', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [makePR('alice', 'client-project')],
      }),
      defaultParams({ allowed_repos: ['myorg/client-project'] }),
      'high'
    );

    expect(result.issues).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Multiple contractor domains
  // -------------------------------------------------------------------------
  it('matches members from any configured contractor domain', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [
          makeUser('alice', 'alice@contractor.io'),
          makeUser('bob', 'bob@freelancer.com'),
        ],
        pullRequests: [makePR('alice', 'internal-api', 1), makePR('bob', 'internal-api', 2)],
      }),
      defaultParams({ contractor_domains: ['contractor.io', 'freelancer.com'] }),
      'high'
    );

    expect(result.issues).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------
  it('reports itemsEvaluated as repository count', async () => {
    const result = await evaluator.evaluate(
      defaultContext({
        orgMembers: [makeUser('alice', 'alice@contractor.io')],
        pullRequests: [],
      }),
      defaultParams(),
      'high'
    );

    expect(result.metadata?.itemsEvaluated).toBe(2); // two repos in defaultContext
  });

  // -------------------------------------------------------------------------
  // validateParameters
  // -------------------------------------------------------------------------
  it('validateParameters does not throw for valid params', () => {
    expect(() => evaluator.validateParameters(defaultParams())).not.toThrow();
  });

  it('validateParameters does not throw when arrays are missing (optional)', () => {
    expect(() => evaluator.validateParameters({})).not.toThrow();
  });
});
