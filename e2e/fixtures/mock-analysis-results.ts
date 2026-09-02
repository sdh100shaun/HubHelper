/**
 * Mock data fixtures for Playwright tests
 * Creates reusable test data matching HubHelper's type system
 */

import type { AnalysisResult, SecurityIssue } from '../../src/types/index.js';

/**
 * Create a mock AnalysisResult with default values
 */
export const createMockAnalysisResult = (overrides?: Partial<AnalysisResult>): AnalysisResult => {
  const defaultResult: AnalysisResult = {
    summary: 'Test analysis summary',
    statistics: {
      total_repos: 0,
      total_prs: 0,
      self_merges: 0,
      security_prs: 0,
      repos_with_disabled_actions: 0,
      paused_workflows: 0,
      disabled_workflows: 0,
    },
    issues: [],
    recommendations: [],
  };

  return { ...defaultResult, ...overrides };
};

/**
 * Create a mock SecurityIssue with default values
 */
export const createMockSecurityIssue = (overrides?: Partial<SecurityIssue>): SecurityIssue => {
  const defaultIssue: SecurityIssue = {
    type: 'self-merge',
    severity: 'medium',
    repository: 'test/repo',
    description: 'Test security issue',
    details: {},
    detected_at: new Date().toISOString(),
  };

  return { ...defaultIssue, ...overrides };
};

/**
 * Create a mock result with statistics but no issues
 */
export const createEmptyResult = (): AnalysisResult => {
  return createMockAnalysisResult({
    summary: 'No issues found',
    statistics: {
      total_repos: 10,
      total_prs: 50,
      self_merges: 0,
      security_prs: 0,
      repos_with_disabled_actions: 0,
      paused_workflows: 0,
      disabled_workflows: 0,
    },
    issues: [],
    recommendations: [],
  });
};

/**
 * Create a mock result with various severity issues
 */
export const createResultWithIssues = (): AnalysisResult => {
  return createMockAnalysisResult({
    summary: 'Found 4 security issues',
    statistics: {
      total_repos: 10,
      total_prs: 50,
      self_merges: 2,
      security_prs: 3,
      repos_with_disabled_actions: 1,
      paused_workflows: 1,
      disabled_workflows: 0,
    },
    issues: [
      createMockSecurityIssue({
        type: 'unreviewed-security-pr',
        severity: 'critical',
        repository: 'org/api-server',
        description: 'Security PR merged without review',
        details: {
          pr_number: 123,
          url: 'https://github.com/org/api-server/pull/123',
          title: 'Update authentication library',
          merged_by: 'alice',
          merged_at: '2024-04-20T10:30:00Z',
        },
      }),
      createMockSecurityIssue({
        type: 'self-merge',
        severity: 'high',
        repository: 'org/frontend',
        description: 'Self-merged pull request',
        details: {
          pr_number: 456,
          url: 'https://github.com/org/frontend/pull/456',
          title: 'Add admin dashboard',
          author: 'bob',
          merged_by: 'bob',
          merged_at: '2024-04-19T15:45:00Z',
        },
      }),
      createMockSecurityIssue({
        type: 'security-pr',
        severity: 'medium',
        repository: 'org/backend',
        description: 'Security-related pull request',
        details: {
          pr_number: 789,
          url: 'https://github.com/org/backend/pull/789',
          title: 'Update dependencies with security fixes',
        },
      }),
      createMockSecurityIssue({
        type: 'disabled-actions',
        severity: 'low',
        repository: 'org/legacy-app',
        description: 'GitHub Actions disabled',
        details: {
          repo_name: 'org/legacy-app',
        },
      }),
    ],
    recommendations: [
      'Enable branch protection rules requiring at least one approving review',
      'Require mandatory security team review for security-related changes',
    ],
  });
};

/**
 * Create a result that includes both active issues and review-state issues
 */
export const createResultWithReviewIssues = (): AnalysisResult => {
  return createMockAnalysisResult({
    summary: 'Found 2 active issues and 2 issues under review',
    statistics: {
      total_repos: 10,
      total_prs: 50,
      self_merges: 1,
      security_prs: 1,
      repos_with_disabled_actions: 0,
      paused_workflows: 0,
      disabled_workflows: 0,
    },
    issues: [
      createMockSecurityIssue({
        type: 'self-merge',
        severity: 'high',
        repository: 'org/active-repo',
        description: 'Active: self-merged pull request',
        details: { pr_number: 1, url: 'https://github.com/org/active-repo/pull/1' },
      }),
      createMockSecurityIssue({
        type: 'disabled-actions',
        severity: 'medium',
        repository: 'org/another-repo',
        description: 'Active: GitHub Actions disabled',
        details: { repo_name: 'org/another-repo' },
      }),
    ],
    reviewIssues: [
      createMockSecurityIssue({
        type: 'paused-workflow',
        severity: 'low',
        repository: 'org/review-repo-1',
        description: 'Review: workflow paused due to inactivity',
        details: { workflow_name: 'CI', repo_name: 'org/review-repo-1' },
      }),
      createMockSecurityIssue({
        type: 'security-pr',
        severity: 'medium',
        repository: 'org/review-repo-2',
        description: 'Review: security-related pull request detected',
        details: { pr_number: 99, url: 'https://github.com/org/review-repo-2/pull/99' },
      }),
    ],
    recommendations: ['Enable branch protection rules'],
  });
};

/**
 * Create a result with XSS attack vectors for security testing
 */
export const createResultWithXSSVectors = (): AnalysisResult => {
  return createMockAnalysisResult({
    summary: 'XSS test data',
    statistics: {
      total_repos: 1,
      total_prs: 1,
      self_merges: 0,
      security_prs: 0,
      repos_with_disabled_actions: 0,
      paused_workflows: 0,
      disabled_workflows: 0,
    },
    issues: [
      createMockSecurityIssue({
        type: 'test',
        severity: 'low',
        repository: '<script>alert("XSS")</script>',
        description: '<img src=x onerror=alert(1)>',
        details: {
          title: '<b>Bold Attack</b>',
          url: 'javascript:alert(1)',
          workflow_url: 'data:text/html,<script>alert(1)</script>',
        },
      }),
    ],
    recommendations: ['<script>document.cookie</script>'],
  });
};
