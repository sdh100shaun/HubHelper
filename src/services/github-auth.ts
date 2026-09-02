import { readFileSync } from 'node:fs';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { describeGhCliFailure, getGhCliToken } from './gh-cli-token.js';

export type AuthMode = 'pat' | 'app';

/** Where a PAT came from. Absent means the environment, for backwards compatibility. */
export type PatSource = 'env' | 'gh-cli' | 'flag';

export interface PatAuthConfig {
  mode: 'pat';
  token: string;
  source?: PatSource;
}

/**
 * Configuration for GitHub App authentication.
 *
 * Either `privateKey` (PEM contents) or `privateKeyPath` (path to PEM file)
 * must be provided. When both are set, `privateKey` takes precedence.
 */
export interface AppAuthConfig {
  mode: 'app';
  appId: string | number;
  installationId: string | number;
  privateKey?: string;
  privateKeyPath?: string;
}

export type AuthConfig = PatAuthConfig | AppAuthConfig;

/**
 * Resolve authentication configuration from environment variables.
 *
 * Resolution order: GitHub App (GITHUB_APP_ID) → GITHUB_TOKEN → the GitHub CLI.
 *
 * The GitHub CLI is tried last so that CI, which sets GITHUB_TOKEN explicitly,
 * never picks up a developer's ambient `gh auth login` credential by accident.
 *
 * Throws if no usable credentials are found.
 */
export function resolveAuthFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  if (env.GITHUB_APP_ID) {
    const appId = env.GITHUB_APP_ID;
    const installationId = env.GITHUB_APP_INSTALLATION_ID;
    const privateKey = env.GITHUB_APP_PRIVATE_KEY;
    const privateKeyPath = env.GITHUB_APP_PRIVATE_KEY_PATH;

    if (!installationId) {
      throw new Error(
        'GITHUB_APP_ID is set but GITHUB_APP_INSTALLATION_ID is missing. ' +
          'Find the installation ID at https://github.com/settings/installations or ' +
          'https://github.com/organizations/<org>/settings/installations.'
      );
    }

    if (!privateKey && !privateKeyPath) {
      throw new Error(
        'GitHub App auth requires either GITHUB_APP_PRIVATE_KEY (PEM contents) or ' +
          'GITHUB_APP_PRIVATE_KEY_PATH (path to .pem file).'
      );
    }

    return { mode: 'app', appId, installationId, privateKey, privateKeyPath };
  }

  if (env.GITHUB_TOKEN) {
    return { mode: 'pat', token: env.GITHUB_TOKEN, source: 'env' };
  }

  const ghCli = getGhCliToken(env);
  if (ghCli.ok) {
    return { mode: 'pat', token: ghCli.token, source: 'gh-cli' };
  }

  const guidance =
    'No GitHub credentials found. Set either GITHUB_TOKEN (PAT) or ' +
    'GITHUB_APP_ID + GITHUB_APP_INSTALLATION_ID + GITHUB_APP_PRIVATE_KEY[_PATH] (GitHub App), ' +
    'or authenticate the GitHub CLI.';

  throw new Error(`${guidance} ${describeGhCliFailure(ghCli.reason)}`);
}

function loadPrivateKey(config: AppAuthConfig): string {
  if (config.privateKey) {
    return config.privateKey;
  }
  if (config.privateKeyPath) {
    try {
      return readFileSync(config.privateKeyPath, 'utf8');
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to read GitHub App private key from ${config.privateKeyPath}: ${reason}`
      );
    }
  }
  throw new Error('App auth config has no privateKey or privateKeyPath.');
}

/**
 * Create an authenticated Octokit instance for either PAT or GitHub App auth.
 *
 * The returned client handles installation token refresh automatically when
 * using App auth, so callers can use it like any other Octokit instance.
 */
export function createGitHubClient(config: AuthConfig): Octokit {
  if (config.mode === 'pat') {
    return new Octokit({ auth: config.token });
  }

  const privateKey = loadPrivateKey(config);

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey,
      installationId: config.installationId,
    },
  });
}

/** Build a client straight from environment variables. */
export function createGitHubClientFromEnv(env: NodeJS.ProcessEnv = process.env): Octokit {
  return createGitHubClient(resolveAuthFromEnv(env));
}

/** Describe the active auth mode for logging without leaking secrets. */
export function describeAuth(config: AuthConfig): string {
  if (config.mode === 'pat') {
    return config.source === 'gh-cli'
      ? 'Personal Access Token (via GitHub CLI)'
      : 'Personal Access Token';
  }
  return `GitHub App (appId=${config.appId}, installationId=${config.installationId})`;
}
