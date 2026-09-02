import { describe, expect, it, jest } from '@jest/globals';
import type { Octokit } from '@octokit/rest';
import { checkAuthStatus, parseScopeHeader } from '../services/auth-status.js';
import type { AuthConfig } from '../services/github-auth.js';

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

const PAT: AuthConfig = { mode: 'pat', token: 'ghp_test', source: 'env' };
const GH_CLI_PAT: AuthConfig = { mode: 'pat', token: 'gho_test', source: 'gh-cli' };

interface OctokitStub {
  scopes?: string | undefined;
  login?: string;
  userError?: unknown;
  membersError?: unknown;
  reposError?: unknown;
  repoNames?: string[];
  actionsError?: unknown;
}

function httpError(status: number): Error {
  return Object.assign(new Error(`HttpError ${status}`), { status });
}

function probeNamed(
  result: { probes: { name: string; ok: boolean; detail: string }[] },
  name: string
) {
  const found = result.probes.find((probe) => probe.name === name);
  if (!found) throw new Error(`no probe named ${name}`);
  return found;
}

function makeOctokit(stub: OctokitStub = {}): Octokit {
  const headers: Record<string, string> = {};
  if (stub.scopes !== undefined) {
    headers['x-oauth-scopes'] = stub.scopes;
  }

  return {
    request: jest.fn(async () => {
      if (stub.userError) throw stub.userError;
      return { data: { login: stub.login ?? 'octocat' }, headers };
    }),
    orgs: {
      listMembers: jest.fn(async () => {
        if (stub.membersError) throw stub.membersError;
        return { data: [{ login: 'octocat' }] };
      }),
    },
    repos: {
      listForOrg: jest.fn(async () => {
        if (stub.reposError) throw stub.reposError;
        return { data: (stub.repoNames ?? ['hubhelper']).map((name) => ({ name })) };
      }),
    },
    actions: {
      getGithubActionsPermissionsRepository: jest.fn(async () => {
        if (stub.actionsError) throw stub.actionsError;
        return { data: { enabled: true } };
      }),
    },
  } as unknown as Octokit;
}

describe('parseScopeHeader', () => {
  it('splits and trims a classic scope header', () => {
    expect(parseScopeHeader('repo, read:org, gist')).toEqual(['repo', 'read:org', 'gist']);
  });

  it('returns an empty list for a classic token with no scopes', () => {
    expect(parseScopeHeader('')).toEqual([]);
  });

  it('returns null when the header is absent', () => {
    expect(parseScopeHeader(undefined)).toBeNull();
  });
});

describe('checkAuthStatus', () => {
  it('reports identity, scopes and a passing verdict for a fully scoped token', async () => {
    const result = await checkAuthStatus(makeOctokit({ scopes: 'repo, read:org, gist' }), PAT);

    expect(result.login).toBe('octocat');
    expect(result.scopes).toEqual(['repo', 'read:org', 'gist']);
    expect(result.requiredScopes.every((check) => check.granted)).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('describes the credential without exposing the token', async () => {
    const result = await checkAuthStatus(makeOctokit({ scopes: 'repo, read:org' }), GH_CLI_PAT);

    expect(result.source).toBe('Personal Access Token (via GitHub CLI)');
    expect(result.source).not.toContain('gho_test');
  });

  it('flags a missing required scope and fails the verdict', async () => {
    const result = await checkAuthStatus(makeOctokit({ scopes: 'repo' }), PAT);

    const readOrg = result.requiredScopes.find((check) => check.scope === 'read:org');
    expect(readOrg?.granted).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('accepts admin:org as satisfying read:org', async () => {
    const result = await checkAuthStatus(makeOctokit({ scopes: 'repo, admin:org' }), PAT);

    const readOrg = result.requiredScopes.find((check) => check.scope === 'read:org');
    expect(readOrg?.granted).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('treats an absent scope header as not enumerable rather than empty', async () => {
    const result = await checkAuthStatus(makeOctokit({ scopes: undefined }), PAT);

    expect(result.scopes).toBeNull();
    expect(result.requiredScopes).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('survives a credential with no user identity, such as an App installation', async () => {
    const appAuth: AuthConfig = {
      mode: 'app',
      appId: '1',
      installationId: '2',
      privateKey: 'secret',
    };
    const result = await checkAuthStatus(makeOctokit({ userError: httpError(403) }), appAuth);

    expect(result.login).toBeNull();
    expect(result.scopes).toBeNull();
    // An App installation token has no user, so the identity probe is skipped.
    expect(result.probes).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails the verdict when a PAT cannot identify itself', async () => {
    const result = await checkAuthStatus(makeOctokit({ userError: httpError(401) }), PAT);

    expect(probeNamed(result, 'Identify credential').ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('runs no org probes when no organisation is supplied', async () => {
    const result = await checkAuthStatus(makeOctokit({ scopes: 'repo, read:org' }), PAT);

    expect(result.probes.map((probe) => probe.name)).toEqual(['Identify credential']);
    expect(result.elevated).toEqual([]);
  });

  it('probes org membership and repositories when an organisation is supplied', async () => {
    const result = await checkAuthStatus(
      makeOctokit({ scopes: 'repo, read:org' }),
      PAT,
      'test-org'
    );

    expect(result.probes.every((probe) => probe.ok)).toBe(true);
    expect(probeNamed(result, 'List organisation repositories').detail).toContain(
      'test-org/hubhelper'
    );
    expect(result.ok).toBe(true);
  });

  it('fails the verdict when org members cannot be read', async () => {
    const result = await checkAuthStatus(
      makeOctokit({ scopes: 'repo, read:org', membersError: httpError(403) }),
      PAT,
      'test-org'
    );

    const members = probeNamed(result, 'Read organisation members');
    expect(members.ok).toBe(false);
    expect(members.detail).toBe('HTTP 403');
    expect(result.ok).toBe(false);
  });

  it('reports missing repository admin as elevated-only, keeping the verdict green', async () => {
    const result = await checkAuthStatus(
      makeOctokit({ scopes: 'repo, read:org', actionsError: httpError(403) }),
      PAT,
      'test-org'
    );

    expect(result.elevated).toHaveLength(1);
    expect(result.elevated[0].ok).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('skips the admin probe when the organisation has no repositories', async () => {
    const result = await checkAuthStatus(
      makeOctokit({ scopes: 'repo, read:org', repoNames: [] }),
      PAT,
      'test-org'
    );

    expect(probeNamed(result, 'List organisation repositories').detail).toContain(
      'no repositories'
    );
    expect(result.elevated).toEqual([]);
  });

  it('records a repository listing failure as a required probe failure', async () => {
    const result = await checkAuthStatus(
      makeOctokit({ scopes: 'repo, read:org', reposError: httpError(404) }),
      PAT,
      'test-org'
    );

    expect(probeNamed(result, 'List organisation repositories').ok).toBe(false);
    expect(result.ok).toBe(false);
  });
});
