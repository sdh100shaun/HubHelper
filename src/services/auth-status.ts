import type { Octokit } from '@octokit/rest';
import { type AuthConfig, describeAuth } from './github-auth.js';

/** A classic OAuth scope HubHelper needs, and why. */
export interface ScopeCheck {
  scope: string;
  granted: boolean;
  purpose: string;
}

/** The outcome of calling one endpoint to see whether it is actually reachable. */
export interface ProbeResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AuthStatusResult {
  /** Human-readable description of the active credential, never the token itself. */
  source: string;
  login: string | null;
  /** Granted scopes, or null when the token type does not enumerate them. */
  scopes: string[] | null;
  requiredScopes: ScopeCheck[];
  /** Checks that must pass for HubHelper to work at all. */
  probes: ProbeResult[];
  /** Checks that only affect result fidelity, not basic operation. */
  elevated: ProbeResult[];
  /** False when any required scope or probe failed. */
  ok: boolean;
}

/** Probe names, exported so callers can react to a specific check without string matching. */
export const PROBE_IDENTITY = 'Identify credential';
export const PROBE_ORG_MEMBERS = 'Read organisation members';
export const PROBE_ORG_REPOS = 'List organisation repositories';
export const PROBE_REPO_ADMIN = 'Repository administration (Actions and security settings)';

/** Classic scopes HubHelper depends on, mapped to the features that need them. */
const REQUIRED_SCOPES: ReadonlyArray<{ scope: string; purpose: string }> = [
  {
    scope: 'repo',
    purpose: 'private repositories, pull requests, workflow runs and file contents',
  },
  {
    scope: 'read:org',
    purpose: 'organisation members and the org event stream (watch/stream commands)',
  },
];

function statusOf(err: unknown): number | null {
  if (typeof err === 'object' && err !== null) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

function messageOf(err: unknown): string {
  const status = statusOf(err);
  if (status !== null) return `HTTP ${status}`;
  return err instanceof Error ? err.message : String(err);
}

async function probe(name: string, run: () => Promise<string>): Promise<ProbeResult> {
  try {
    return { name, ok: true, detail: await run() };
  } catch (err) {
    return { name, ok: false, detail: messageOf(err) };
  }
}

/**
 * Parse the `x-oauth-scopes` response header.
 *
 * Returns null when the header is absent, which is how fine-grained PATs and
 * GitHub App installation tokens behave — that is "not enumerable", not "no
 * scopes". A classic token with no scopes sends an empty header instead.
 */
export function parseScopeHeader(value: unknown): string[] | null {
  if (typeof value !== 'string') return null;
  return value
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

/** True when `granted` satisfies `required`, accounting for scope hierarchy. */
function hasScope(granted: string[], required: string): boolean {
  if (granted.includes(required)) return true;
  // `admin:org` implies `read:org`; `repo` implies its own sub-scopes.
  if (required === 'read:org')
    return granted.includes('admin:org') || granted.includes('write:org');
  return false;
}

/**
 * Report which permissions the current credential actually grants.
 *
 * Two GitHubFetcher calls — the repository Actions permissions endpoint and the
 * `security_and_analysis` block of `repos.get` — require repository *admin* and
 * are swallowed on failure, so a non-admin silently gets `actions_enabled` and
 * `security_enabled` reported as false for every repository. The `elevated`
 * probes exist to surface that degradation instead of leaving it invisible.
 */
export async function checkAuthStatus(
  octokit: Octokit,
  auth: AuthConfig,
  org?: string
): Promise<AuthStatusResult> {
  const source = describeAuth(auth);

  let login: string | null = null;
  let scopes: string[] | null = null;
  let userError: unknown = null;

  try {
    const response = await octokit.request('GET /user');
    const data = response.data as { login?: unknown };
    if (typeof data?.login === 'string') {
      login = data.login;
    }
    scopes = parseScopeHeader(response.headers['x-oauth-scopes']);
  } catch (err) {
    // App installation tokens have no user identity, so this is only a failure
    // for a PAT — see the identity probe below.
    userError = err;
  }

  const requiredScopes: ScopeCheck[] =
    scopes === null
      ? []
      : REQUIRED_SCOPES.map(({ scope, purpose }) => ({
          scope,
          purpose,
          granted: hasScope(scopes as string[], scope),
        }));

  const probes: ProbeResult[] = [];
  const elevated: ProbeResult[] = [];

  // A PAT always resolves to a user, so a failure here means the token itself is
  // bad. Without this probe a rejected token with no --org would pass every
  // (vacuous) check and be reported as healthy.
  if (auth.mode === 'pat') {
    probes.push({
      name: PROBE_IDENTITY,
      ok: userError === null,
      detail: userError === null ? `authenticated as ${login}` : messageOf(userError),
    });
  }

  if (org) {
    probes.push(
      await probe(PROBE_ORG_MEMBERS, async () => {
        await octokit.orgs.listMembers({ org, per_page: 1 });
        return `members of ${org} are readable`;
      })
    );

    // Kept inline rather than wrapped in `probe` so the sampled repository name
    // stays available for the admin probe below.
    let firstRepo: string | null = null;
    try {
      const { data } = await octokit.repos.listForOrg({ org, per_page: 1, type: 'all' });
      firstRepo = data[0]?.name ?? null;
      probes.push({
        name: PROBE_ORG_REPOS,
        ok: true,
        detail: firstRepo ? `sampled ${org}/${firstRepo}` : `${org} has no repositories`,
      });
    } catch (err) {
      probes.push({
        name: PROBE_ORG_REPOS,
        ok: false,
        detail: messageOf(err),
      });
    }

    if (firstRepo !== null) {
      const repo = firstRepo;
      elevated.push(
        await probe(PROBE_REPO_ADMIN, async () => {
          await octokit.actions.getGithubActionsPermissionsRepository({ owner: org, repo });
          return `admin-level reads succeed on ${org}/${repo}`;
        })
      );
    }
  }

  const ok = requiredScopes.every((check) => check.granted) && probes.every((result) => result.ok);

  return { source, login, scopes, requiredScopes, probes, elevated, ok };
}
