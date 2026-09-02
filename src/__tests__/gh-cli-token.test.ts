import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  GH_CLI_OPT_OUT_ENV,
  describeGhCliFailure,
  getGhCliToken,
} from '../services/gh-cli-token.js';

jest.mock('node:child_process', () => ({
  execFileSync: jest.fn(),
}));

// execFileSync is heavily overloaded; a loose cast keeps the mock ergonomic.
const mockExecFileSync = execFileSync as unknown as jest.Mock;

const TOKEN = 'gho_16C7e42F292c6912E7710c838347Ae178B4a';

function errorWith(props: Record<string, unknown>): Error {
  return Object.assign(new Error('gh failed'), props);
}

describe('getGhCliToken', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns the token reported by the GitHub CLI', () => {
    mockExecFileSync.mockReturnValue(`${TOKEN}\n`);

    const result = getGhCliToken({});

    expect(result).toEqual({ ok: true, token: TOKEN });
  });

  it('invokes gh without a shell and without a hostname by default', () => {
    mockExecFileSync.mockReturnValue(TOKEN);

    getGhCliToken({});

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    const [file, args] = mockExecFileSync.mock.calls[0] as [string, string[]];
    expect(file).toBe('gh');
    expect(args).toEqual(['auth', 'token']);
  });

  it('passes GH_HOST through as --hostname', () => {
    mockExecFileSync.mockReturnValue(TOKEN);

    getGhCliToken({ GH_HOST: 'github.example.com' });

    const [, args] = mockExecFileSync.mock.calls[0] as [string, string[]];
    expect(args).toEqual(['auth', 'token', '--hostname', 'github.example.com']);
  });

  it('is disabled by the opt-out environment variable', () => {
    const result = getGhCliToken({ [GH_CLI_OPT_OUT_ENV]: '1' });

    expect(result).toEqual({ ok: false, reason: 'disabled' });
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('reports not-installed when gh is missing from PATH', () => {
    mockExecFileSync.mockImplementation(() => {
      throw errorWith({ code: 'ENOENT' });
    });

    expect(getGhCliToken({})).toEqual({ ok: false, reason: 'not-installed' });
  });

  it('reports not-authenticated when gh exits non-zero', () => {
    mockExecFileSync.mockImplementation(() => {
      throw errorWith({ status: 1 });
    });

    expect(getGhCliToken({})).toEqual({ ok: false, reason: 'not-authenticated' });
  });

  it('reports not-authenticated when gh returns no token', () => {
    mockExecFileSync.mockReturnValue('   \n');

    expect(getGhCliToken({})).toEqual({ ok: false, reason: 'not-authenticated' });
  });

  it('reports a generic failure for unexpected errors', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('timed out');
    });

    expect(getGhCliToken({})).toEqual({ ok: false, reason: 'failed' });
  });

  it('never leaks the token through a failure result', () => {
    mockExecFileSync.mockImplementation(() => {
      throw errorWith({ status: 1, stdout: TOKEN });
    });

    const result = getGhCliToken({});

    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe('describeGhCliFailure', () => {
  it('points at installation when gh is missing', () => {
    expect(describeGhCliFailure('not-installed')).toContain('cli.github.com');
  });

  it('points at gh auth login when gh is not logged in', () => {
    expect(describeGhCliFailure('not-authenticated')).toContain('gh auth login');
  });

  it('names the opt-out variable when lookup is disabled', () => {
    expect(describeGhCliFailure('disabled')).toContain(GH_CLI_OPT_OUT_ENV);
  });

  it('gives generic guidance for unexpected failures', () => {
    expect(describeGhCliFailure('failed')).toContain('gh auth status');
  });
});
