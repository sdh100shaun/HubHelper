/**
 * Finding identity helpers
 *
 * Gives every security issue a control ID and a stable fingerprint so that
 * consumers (SARIF, JSON output, the agentic audit workflow) can tell a new
 * finding from one already reported, run after run.
 */

import { createHash } from 'node:crypto';
import type { SecurityIssue } from '../types/index.js';

const ISSUE_TYPE_TO_CONTROL_ID: Record<SecurityIssue['type'], string> = {
  'self-merge': 'HH-GH-001',
  'unreviewed-security-pr': 'HH-GH-002',
  'security-pr': 'HH-GH-003',
  'disabled-actions': 'HH-GH-004',
  'paused-workflow': 'HH-GH-005',
  'disabled-workflow': 'HH-GH-006',
  repeated_action_failure: 'HH-GH-007',
  action_failure: 'HH-GH-008',
  'security-pr-volume': 'HH-GH-009',
  'contractor-repo-access': 'HH-GH-010',
};

/** Placeholder control ID for issue types without a catalog control. */
export const UNKNOWN_CONTROL_ID = 'HH-GH-000';

/**
 * Map an issue type to its catalog control ID.
 */
export function getControlId(issueType: string): string {
  return ISSUE_TYPE_TO_CONTROL_ID[issueType as SecurityIssue['type']] ?? UNKNOWN_CONTROL_ID;
}

/**
 * The thing within a repository that a finding is about, such as a PR or workflow.
 * Volatile values (counts, timestamps, descriptions) are left out on purpose so
 * the fingerprint stays the same while the underlying problem persists.
 */
export function getFindingSubject(issue: SecurityIssue): string {
  const { details } = issue;

  if (typeof details.pr_number === 'number') return `pr:${details.pr_number}`;
  if (typeof details.contractor_login === 'string') {
    return `contractor:${details.contractor_login}`;
  }
  if (typeof details.run_id === 'number') return `run:${details.run_id}`;
  if (details.workflow_path) return `workflow:${details.workflow_path}`;
  if (details.workflow_name) return `workflow:${details.workflow_name}`;
  return 'repository';
}

/**
 * Stable SHA-256 fingerprint of control ID, repository and subject.
 */
export function getFindingFingerprint(issue: SecurityIssue): string {
  const input = [getControlId(issue.type), issue.repository, getFindingSubject(issue)].join('|');
  return createHash('sha256').update(input).digest('hex');
}

export interface IdentifiedSecurityIssue extends SecurityIssue {
  control_id: string;
  fingerprint: string;
}

/**
 * Return a copy of the issue with `control_id` and `fingerprint` added.
 */
export function withFindingIdentity(issue: SecurityIssue): IdentifiedSecurityIssue {
  return {
    ...issue,
    control_id: getControlId(issue.type),
    fingerprint: getFindingFingerprint(issue),
  };
}
