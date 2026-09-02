import { execFileSync } from 'node:child_process';

/** Why a GitHub CLI token could not be obtained. */
export type GhCliFailureReason = 'disabled' | 'not-installed' | 'not-authenticated' | 'failed';

export type GhCliTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: GhCliFailureReason };

/** Environment variable that opts out of GitHub CLI credential discovery entirely. */
export const GH_CLI_OPT_OUT_ENV = 'HUBHELPER_NO_GH_CLI';

/** How long to wait for `gh` before giving up, in milliseconds. */
const GH_TIMEOUT_MS = 5000;

function hasCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;
}

/**
 * Read the token held by the GitHub CLI (`gh auth token`).
 *
 * This lets local runs reuse the credential from `gh auth login` instead of
 * requiring a hand-minted PAT. `execFileSync` is used rather than `exec` so no
 * shell is involved and `GH_HOST` cannot be turned into command injection.
 *
 * The token is only ever returned through the success branch — failures map to
 * a fixed reason and never carry captured output, because the child process's
 * stdout *is* the secret.
 */
export function getGhCliToken(env: NodeJS.ProcessEnv = process.env): GhCliTokenResult {
  if (env[GH_CLI_OPT_OUT_ENV]) {
    return { ok: false, reason: 'disabled' };
  }

  const args = ['auth', 'token'];
  if (env.GH_HOST) {
    args.push('--hostname', env.GH_HOST);
  }

  let stdout: string;
  try {
    stdout = execFileSync('gh', args, {
      encoding: 'utf8',
      timeout: GH_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
  } catch (err) {
    if (hasCode(err, 'ENOENT')) {
      return { ok: false, reason: 'not-installed' };
    }
    // `gh auth token` exits non-zero when no host is logged in.
    if (typeof (err as { status?: unknown }).status === 'number') {
      return { ok: false, reason: 'not-authenticated' };
    }
    return { ok: false, reason: 'failed' };
  }

  const token = typeof stdout === 'string' ? stdout.trim() : '';
  if (token.length === 0) {
    return { ok: false, reason: 'not-authenticated' };
  }

  return { ok: true, token };
}

/** Actionable guidance for a GitHub CLI failure, safe to show to the user. */
export function describeGhCliFailure(reason: GhCliFailureReason): string {
  switch (reason) {
    case 'disabled':
      return `GitHub CLI lookup is disabled by ${GH_CLI_OPT_OUT_ENV}.`;
    case 'not-installed':
      return 'The GitHub CLI (gh) was not found on PATH. Install it from https://cli.github.com.';
    case 'not-authenticated':
      return 'The GitHub CLI is installed but not logged in. Run: gh auth login';
    default:
      return 'The GitHub CLI could not provide a token. Check `gh auth status`.';
  }
}
