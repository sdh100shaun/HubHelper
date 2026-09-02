import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Octokit } from '@octokit/rest';
import { getGhCliToken } from '../services/gh-cli-token.js';
import { createGitHubClient, describeAuth, resolveAuthFromEnv } from '../services/github-auth.js';

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

// Mocked so these tests never depend on whether the machine running them
// happens to have an authenticated GitHub CLI.
jest.mock('../services/gh-cli-token.js', () => ({
  getGhCliToken: jest.fn(() => ({ ok: false, reason: 'not-installed' })),
  describeGhCliFailure: jest.fn((reason: string) => `gh hint: ${reason}`),
}));

const MockOctokit = Octokit as jest.MockedClass<typeof Octokit>;
const mockGetGhCliToken = getGhCliToken as unknown as jest.Mock;

describe('resolveAuthFromEnv', () => {
  beforeEach(() => {
    mockGetGhCliToken.mockClear();
    mockGetGhCliToken.mockReturnValue({ ok: false, reason: 'not-installed' });
  });

  it('returns PAT config when GITHUB_TOKEN is set', () => {
    const config = resolveAuthFromEnv({ GITHUB_TOKEN: 'ghp_test' });
    expect(config).toEqual({ mode: 'pat', token: 'ghp_test', source: 'env' });
  });

  it('prefers GitHub App when GITHUB_APP_ID is set', () => {
    const config = resolveAuthFromEnv({
      GITHUB_TOKEN: 'ghp_ignored',
      GITHUB_APP_ID: '12345',
      GITHUB_APP_INSTALLATION_ID: '67890',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\n...',
    });
    expect(config.mode).toBe('app');
    if (config.mode === 'app') {
      expect(config.appId).toBe('12345');
      expect(config.installationId).toBe('67890');
    }
  });

  it('accepts a private key path as an alternative', () => {
    const config = resolveAuthFromEnv({
      GITHUB_APP_ID: '12345',
      GITHUB_APP_INSTALLATION_ID: '67890',
      GITHUB_APP_PRIVATE_KEY_PATH: '/etc/secrets/app.pem',
    });
    expect(config.mode).toBe('app');
    if (config.mode === 'app') {
      expect(config.privateKeyPath).toBe('/etc/secrets/app.pem');
    }
  });

  it('throws when GITHUB_APP_ID is set without an installation ID', () => {
    expect(() =>
      resolveAuthFromEnv({
        GITHUB_APP_ID: '12345',
        GITHUB_APP_PRIVATE_KEY: 'x',
      })
    ).toThrow(/GITHUB_APP_INSTALLATION_ID/);
  });

  it('throws when GitHub App is selected without any private key', () => {
    expect(() =>
      resolveAuthFromEnv({
        GITHUB_APP_ID: '12345',
        GITHUB_APP_INSTALLATION_ID: '67890',
      })
    ).toThrow(/GITHUB_APP_PRIVATE_KEY/);
  });

  it('throws when no credentials are provided', () => {
    expect(() => resolveAuthFromEnv({})).toThrow(/No GitHub credentials/);
  });

  it('falls back to the GitHub CLI when no token or App is configured', () => {
    mockGetGhCliToken.mockReturnValue({ ok: true, token: 'gho_from_cli' });

    const config = resolveAuthFromEnv({});

    expect(config).toEqual({ mode: 'pat', token: 'gho_from_cli', source: 'gh-cli' });
  });

  it('prefers GITHUB_TOKEN over the GitHub CLI', () => {
    mockGetGhCliToken.mockReturnValue({ ok: true, token: 'gho_from_cli' });

    const config = resolveAuthFromEnv({ GITHUB_TOKEN: 'ghp_env' });

    expect(config).toEqual({ mode: 'pat', token: 'ghp_env', source: 'env' });
    expect(mockGetGhCliToken).not.toHaveBeenCalled();
  });

  it('prefers GitHub App over the GitHub CLI', () => {
    mockGetGhCliToken.mockReturnValue({ ok: true, token: 'gho_from_cli' });

    const config = resolveAuthFromEnv({
      GITHUB_APP_ID: '12345',
      GITHUB_APP_INSTALLATION_ID: '67890',
      GITHUB_APP_PRIVATE_KEY: 'x',
    });

    expect(config.mode).toBe('app');
    expect(mockGetGhCliToken).not.toHaveBeenCalled();
  });

  it('includes GitHub CLI guidance in the no-credentials error', () => {
    mockGetGhCliToken.mockReturnValue({ ok: false, reason: 'not-authenticated' });

    expect(() => resolveAuthFromEnv({})).toThrow(/gh hint: not-authenticated/);
  });
});

describe('describeAuth', () => {
  it('describes PAT auth without leaking the token', () => {
    const desc = describeAuth({ mode: 'pat', token: 'ghp_supersecret' });
    expect(desc).toBe('Personal Access Token');
    expect(desc).not.toContain('ghp_supersecret');
  });

  it('names the GitHub CLI when the token came from it', () => {
    const desc = describeAuth({ mode: 'pat', token: 'gho_supersecret', source: 'gh-cli' });
    expect(desc).toBe('Personal Access Token (via GitHub CLI)');
    expect(desc).not.toContain('gho_supersecret');
  });

  it('keeps the plain description for an environment token', () => {
    expect(describeAuth({ mode: 'pat', token: 'ghp_x', source: 'env' })).toBe(
      'Personal Access Token'
    );
  });

  it('describes App auth with non-secret identifiers', () => {
    const desc = describeAuth({
      mode: 'app',
      appId: '12345',
      installationId: '67890',
      privateKey: 'secret',
    });
    expect(desc).toContain('12345');
    expect(desc).toContain('67890');
    expect(desc).not.toContain('secret');
  });
});

describe('createGitHubClient', () => {
  beforeEach(() => {
    MockOctokit.mockClear();
  });

  it('creates a PAT-authenticated client', () => {
    createGitHubClient({ mode: 'pat', token: 'ghp_abc' });
    expect(MockOctokit).toHaveBeenCalledWith({ auth: 'ghp_abc' });
  });

  it('creates an App-authenticated client with inline private key', () => {
    createGitHubClient({
      mode: 'app',
      appId: '42',
      installationId: '99',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
    });
    expect(MockOctokit).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ appId: '42', installationId: '99' }),
      })
    );
  });

  it('throws when App config has neither privateKey nor privateKeyPath', () => {
    expect(() =>
      createGitHubClient({
        mode: 'app',
        appId: '42',
        installationId: '99',
      })
    ).toThrow(/no privateKey or privateKeyPath/);
  });
});
