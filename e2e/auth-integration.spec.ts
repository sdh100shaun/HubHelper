/**
 * E2E integration tests for the GitHub auth module.
 *
 * Structural tests (client creation, config resolution) run unconditionally.
 * Live API tests are skipped automatically unless the relevant environment
 * variables are present AND HUBHELPER_LIVE_TESTS=true is set, so this suite
 * is safe to run in CI without secrets.
 *
 * PAT live test:   HUBHELPER_LIVE_TESTS=true + GITHUB_TOKEN
 * App live test:   HUBHELPER_LIVE_TESTS=true + GITHUB_APP_ID +
 *                      GITHUB_APP_INSTALLATION_ID +
 *                      GITHUB_APP_PRIVATE_KEY (or _PATH)
 */
import { expect, test } from '@playwright/test';
import { createGitHubClient, resolveAuthFromEnv } from '../src/services/github-auth.js';

// A syntactically valid (but functionally fake) RSA PEM used for structural tests.
const FAKE_PEM = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIEowIBAAKCAQEA2a2rwplBQLzHPZe5TNJT5gBfXMHSNc0lrfb0vmGwINwSNPdO',
  '-----END RSA PRIVATE KEY-----',
].join('\n');

// ────────────────────────────────────────────────────────────────────────────
// PAT auth
// ────────────────────────────────────────────────────────────────────────────

test.describe('PAT authentication', () => {
  test('resolveAuthFromEnv returns PAT config when GITHUB_TOKEN is set', () => {
    const config = resolveAuthFromEnv({ GITHUB_TOKEN: 'ghp_test_token' });
    expect(config.mode).toBe('pat');
    if (config.mode === 'pat') {
      expect(config.token).toBe('ghp_test_token');
    }
  });

  test('createGitHubClient(PAT) returns an Octokit instance with expected API surface', () => {
    const client = createGitHubClient({ mode: 'pat', token: 'ghp_fake' });
    // Verify key methods used by GitHubFetcher are present
    expect(typeof client.repos.listForOrg).toBe('function');
    expect(typeof client.repos.get).toBe('function');
    expect(typeof client.pulls.list).toBe('function');
    expect(typeof client.pulls.get).toBe('function');
    expect(typeof client.pulls.listFiles).toBe('function');
    expect(typeof client.actions.listRepoWorkflows).toBe('function');
    expect(typeof client.actions.listWorkflowRunsForRepo).toBe('function');
    expect(typeof client.orgs.listMembers).toBe('function');
  });

  test('PAT client can reach the live GitHub API', async () => {
    test.skip(
      !process.env.HUBHELPER_LIVE_TESTS || !process.env.GITHUB_TOKEN,
      'set HUBHELPER_LIVE_TESTS=true and GITHUB_TOKEN to enable live PAT test'
    );

    const client = createGitHubClient({ mode: 'pat', token: process.env.GITHUB_TOKEN! });
    const { data } = await client.rateLimit.get();
    expect(data.rate.limit).toBeGreaterThan(0);
    expect(data.rate.remaining).toBeGreaterThanOrEqual(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitHub App auth
// ────────────────────────────────────────────────────────────────────────────

test.describe('GitHub App authentication', () => {
  test('resolveAuthFromEnv returns App config when GITHUB_APP_ID is set', () => {
    const config = resolveAuthFromEnv({
      GITHUB_APP_ID: '12345',
      GITHUB_APP_INSTALLATION_ID: '67890',
      GITHUB_APP_PRIVATE_KEY: FAKE_PEM,
    });
    expect(config.mode).toBe('app');
    if (config.mode === 'app') {
      expect(config.appId).toBe('12345');
      expect(config.installationId).toBe('67890');
    }
  });

  test('App auth takes precedence over GITHUB_TOKEN when both are set', () => {
    const config = resolveAuthFromEnv({
      GITHUB_TOKEN: 'ghp_should_be_ignored',
      GITHUB_APP_ID: '42',
      GITHUB_APP_INSTALLATION_ID: '99',
      GITHUB_APP_PRIVATE_KEY: FAKE_PEM,
    });
    expect(config.mode).toBe('app');
  });

  test('createGitHubClient(App) returns an Octokit instance with expected API surface', () => {
    const client = createGitHubClient({
      mode: 'app',
      appId: '12345',
      installationId: '67890',
      privateKey: FAKE_PEM,
    });
    expect(typeof client.repos.listForOrg).toBe('function');
    expect(typeof client.pulls.list).toBe('function');
    expect(typeof client.actions.listRepoWorkflows).toBe('function');
    expect(typeof client.orgs.listMembers).toBe('function');
  });

  test('App client can reach the live GitHub API', async () => {
    const hasAppCreds =
      process.env.HUBHELPER_LIVE_TESTS &&
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_INSTALLATION_ID &&
      (process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY_PATH);

    test.skip(
      !hasAppCreds,
      'set HUBHELPER_LIVE_TESTS=true + GITHUB_APP_ID + GITHUB_APP_INSTALLATION_ID + ' +
        'GITHUB_APP_PRIVATE_KEY to enable live App test'
    );

    const config = resolveAuthFromEnv();
    expect(config.mode).toBe('app');
    const client = createGitHubClient(config);
    // rateLimit.get() triggers token exchange — confirms App auth is functional
    const { data } = await client.rateLimit.get();
    expect(data.rate.limit).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Error handling
// ────────────────────────────────────────────────────────────────────────────

test.describe('auth error handling', () => {
  test('resolveAuthFromEnv throws a clear error when no credentials are set', () => {
    expect(() => resolveAuthFromEnv({})).toThrow(/No GitHub credentials/);
  });

  test('resolveAuthFromEnv throws when GITHUB_APP_ID is set without installation ID', () => {
    expect(() => resolveAuthFromEnv({ GITHUB_APP_ID: '42', GITHUB_APP_PRIVATE_KEY: 'x' })).toThrow(
      /GITHUB_APP_INSTALLATION_ID/
    );
  });

  test('resolveAuthFromEnv throws when App is selected without a private key', () => {
    expect(() =>
      resolveAuthFromEnv({ GITHUB_APP_ID: '42', GITHUB_APP_INSTALLATION_ID: '99' })
    ).toThrow(/GITHUB_APP_PRIVATE_KEY/);
  });
});
