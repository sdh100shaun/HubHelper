import type { SecurityIssue } from '../types/index';
import {
  getControlId,
  getFindingFingerprint,
  getFindingSubject,
  UNKNOWN_CONTROL_ID,
  withFindingIdentity,
} from '../utils/finding-identity';

function makeIssue(overrides: Partial<SecurityIssue> = {}): SecurityIssue {
  return {
    type: 'self-merge',
    severity: 'high',
    repository: 'org/repo',
    description: 'PR #7 was merged by its author',
    details: { pr_number: 7 },
    detected_at: '2026-11-26T10:00:00Z',
    ...overrides,
  };
}

describe('finding-identity', () => {
  describe('getControlId', () => {
    it.each([
      ['self-merge', 'HH-GH-001'],
      ['unreviewed-security-pr', 'HH-GH-002'],
      ['security-pr', 'HH-GH-003'],
      ['disabled-actions', 'HH-GH-004'],
      ['paused-workflow', 'HH-GH-005'],
      ['disabled-workflow', 'HH-GH-006'],
      ['repeated_action_failure', 'HH-GH-007'],
      ['action_failure', 'HH-GH-008'],
      ['security-pr-volume', 'HH-GH-009'],
      ['contractor-repo-access', 'HH-GH-010'],
    ])('maps %s to %s', (type, controlId) => {
      expect(getControlId(type)).toBe(controlId);
    });

    it('returns the placeholder for unknown types', () => {
      expect(getControlId('something-else')).toBe(UNKNOWN_CONTROL_ID);
    });
  });

  describe('getFindingSubject', () => {
    it('uses the PR number first', () => {
      expect(getFindingSubject(makeIssue())).toBe('pr:7');
    });

    it('uses the contractor login', () => {
      const issue = makeIssue({
        type: 'contractor-repo-access',
        details: { contractor_login: 'octocat' },
      });
      expect(getFindingSubject(issue)).toBe('contractor:octocat');
    });

    it('uses the run ID before the workflow name', () => {
      const issue = makeIssue({
        type: 'action_failure',
        details: { run_id: 99, workflow_name: 'CI' },
      });
      expect(getFindingSubject(issue)).toBe('run:99');
    });

    it('uses the workflow path before the workflow name', () => {
      const issue = makeIssue({
        type: 'disabled-workflow',
        details: { workflow_path: '.github/workflows/ci.yml', workflow_name: 'CI' },
      });
      expect(getFindingSubject(issue)).toBe('workflow:.github/workflows/ci.yml');
    });

    it('uses the workflow name when there is no path', () => {
      const issue = makeIssue({
        type: 'repeated_action_failure',
        details: { workflow_name: 'Deploy' },
      });
      expect(getFindingSubject(issue)).toBe('workflow:Deploy');
    });

    it('falls back to the repository itself', () => {
      const issue = makeIssue({ type: 'disabled-actions', details: {} });
      expect(getFindingSubject(issue)).toBe('repository');
    });
  });

  describe('getFindingFingerprint', () => {
    it('is a SHA-256 hex digest', () => {
      expect(getFindingFingerprint(makeIssue())).toMatch(/^[0-9a-f]{64}$/);
    });

    it('ignores volatile fields such as description, severity and detection time', () => {
      const a = makeIssue();
      const b = makeIssue({
        description: 'Different wording',
        severity: 'critical',
        detected_at: '2026-12-01T00:00:00Z',
      });
      expect(getFindingFingerprint(a)).toBe(getFindingFingerprint(b));
    });

    it('differs by repository, subject and control', () => {
      const base = getFindingFingerprint(makeIssue());
      expect(getFindingFingerprint(makeIssue({ repository: 'org/other' }))).not.toBe(base);
      expect(getFindingFingerprint(makeIssue({ details: { pr_number: 8 } }))).not.toBe(base);
      expect(getFindingFingerprint(makeIssue({ type: 'security-pr' }))).not.toBe(base);
    });
  });

  describe('withFindingIdentity', () => {
    it('adds control_id and fingerprint without changing the original', () => {
      const issue = makeIssue();
      const identified = withFindingIdentity(issue);

      expect(identified.control_id).toBe('HH-GH-001');
      expect(identified.fingerprint).toBe(getFindingFingerprint(issue));
      expect(identified.repository).toBe('org/repo');
      expect(issue).not.toHaveProperty('control_id');
    });
  });
});
