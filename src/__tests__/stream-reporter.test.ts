import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StreamReporter } from '../reporters/stream-reporter.js';
import type { GitHubEvent, SecurityIssue, StreamEventResult } from '../types/index.js';

jest.mock('chalk');

function makeEvent(type = 'PullRequestEvent', repoName = 'org/repo'): GitHubEvent {
  return {
    id: '1',
    type,
    actor: { login: 'user' },
    repo: { id: 1, name: repoName, url: '' },
    payload: {
      action: 'closed',
      number: 42,
      pull_request: {
        number: 42,
        title: 'Fix auth bypass',
        body: null,
        html_url: 'https://github.com/org/repo/pull/42',
        user: { login: 'user' },
        merged_by: null,
        merged_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        labels: [],
        merged: true,
      },
    },
    created_at: new Date().toISOString(),
    public: true,
  };
}

function makeViolation(severity: SecurityIssue['severity'] = 'high'): SecurityIssue {
  return {
    type: 'self-merge',
    severity,
    repository: 'org/repo',
    description: 'PR was self-merged without review',
    details: {},
    detected_at: new Date().toISOString(),
  };
}

function makeResult(
  violations: SecurityIssue[] = [],
  event: GitHubEvent = makeEvent()
): StreamEventResult {
  return {
    event,
    violations,
    timestamp: new Date().toISOString(),
  };
}

describe('StreamReporter', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('printBanner', () => {
    it('prints org, interval, and profile information', () => {
      const reporter = new StreamReporter({ minSeverity: 'medium', showCompliant: false });
      reporter.printBanner('my-org', 30, 'policies/default.yaml');

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('my-org');
      expect(output).toContain('30');
      expect(output).toContain('policies/default.yaml');
    });
  });

  describe('printEvent', () => {
    it('prints OK line when there are no violations and showCompliant is true', () => {
      const reporter = new StreamReporter({ minSeverity: 'medium', showCompliant: true });
      reporter.printEvent(makeResult([]));

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('OK');
    });

    it('prints nothing when there are no violations and showCompliant is false', () => {
      const reporter = new StreamReporter({ minSeverity: 'medium', showCompliant: false });
      reporter.printEvent(makeResult([]));

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('prints violation lines when there are qualifying violations', () => {
      const reporter = new StreamReporter({ minSeverity: 'medium', showCompliant: false });
      reporter.printEvent(makeResult([makeViolation('high')]));

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('VIOLATION high');
      expect(output).toContain('self-merged');
    });

    it('does not print a violation below minSeverity as a violation', () => {
      const reporter = new StreamReporter({ minSeverity: 'high', showCompliant: false });
      reporter.printEvent(makeResult([makeViolation('low')]));

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('prints multiple violation lines for multiple qualifying violations', () => {
      const reporter = new StreamReporter({ minSeverity: 'low', showCompliant: false });
      const violations = [makeViolation('critical'), makeViolation('high')];
      reporter.printEvent(makeResult(violations));

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('VIOLATION critical');
      expect(output).toContain('VIOLATION high');
    });

    it('truncates long PR titles to max total characters including the ellipsis (39 + ellipsis when max=40)', () => {
      const reporter = new StreamReporter({ minSeverity: 'low', showCompliant: true });
      const longTitle = 'A'.repeat(60);
      const event = makeEvent();
      const pr = (event.payload as Record<string, unknown>).pull_request as Record<string, unknown>;
      pr.title = longTitle;

      reporter.printEvent(makeResult([], event));

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('…');
    });

    it('handles WorkflowRunEvent description format', () => {
      const reporter = new StreamReporter({ minSeverity: 'low', showCompliant: true });
      const event = makeEvent('WorkflowRunEvent');
      (event.payload as Record<string, unknown>).workflow_run = {
        name: 'CI Pipeline',
        head_branch: 'main',
        id: 1,
        head_sha: 'abc',
        status: 'completed',
        conclusion: 'failure',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        workflow_id: 1,
        run_number: 42,
        event: 'push',
        run_attempt: 1,
        html_url: '',
      };
      (event.payload as Record<string, unknown>).action = 'completed';

      reporter.printEvent(makeResult([], event));

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('CI Pipeline');
    });
  });

  describe('printShutdown', () => {
    it('prints events processed, violations found, and uptime', () => {
      const reporter = new StreamReporter({ minSeverity: 'medium', showCompliant: false });
      reporter.printShutdown({ eventsProcessed: 42, violationsFound: 7, uptime: 125 });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('42');
      expect(output).toContain('7');
      expect(output).toContain('2m 5s');
    });
  });

  describe('printInlineError', () => {
    it('does not throw when called', () => {
      const reporter = new StreamReporter({ minSeverity: 'medium', showCompliant: false });
      expect(() => reporter.printInlineError('something went wrong')).not.toThrow();
    });
  });
});
