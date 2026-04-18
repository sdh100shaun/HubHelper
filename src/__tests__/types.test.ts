import { describe, expect, it } from '@jest/globals';
import type {
  AnalysisResult,
  PullRequest,
  Repository,
  SecurityIssue,
  Workflow,
} from '../types/index';

describe('Type Definitions', () => {
  it('should have valid PullRequest type', () => {
    const pr: PullRequest = {
      number: 1,
      title: 'Test',
      url: 'https://github.com/test/repo/pull/1',
      author: 'user',
      merged_by: 'user',
      merged_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      repository: 'test/repo',
      labels: [],
      is_security_related: false,
      files_changed: [],
    };

    expect(pr.number).toBe(1);
    expect(pr.author).toBe('user');
  });

  it('should have valid Repository type', () => {
    const repo: Repository = {
      name: 'repo',
      full_name: 'test/repo',
      private: false,
      actions_enabled: true,
      security_enabled: true,
    };

    expect(repo.name).toBe('repo');
    expect(repo.actions_enabled).toBe(true);
  });

  it('should have valid Workflow type', () => {
    const workflow: Workflow = {
      id: 1,
      name: 'CI',
      path: '.github/workflows/ci.yml',
      state: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      url: 'https://github.com/test/repo/actions/workflows/ci.yml',
      badge_url: 'https://github.com/test/repo/workflows/CI/badge.svg',
      is_scheduled: false,
    };

    expect(workflow.state).toBe('active');
    expect(workflow.is_scheduled).toBe(false);
  });

  it('should have valid SecurityIssue types', () => {
    const issueTypes: SecurityIssue['type'][] = [
      'self-merge',
      'security-pr',
      'disabled-actions',
      'unreviewed-security-pr',
      'paused-workflow',
      'disabled-workflow',
    ];

    expect(issueTypes).toHaveLength(6);

    const issue: SecurityIssue = {
      type: 'self-merge',
      severity: 'medium',
      repository: 'test/repo',
      description: 'Test issue',
      details: {},
      detected_at: '2026-01-01T00:00:00Z',
    };

    expect(issue.type).toBe('self-merge');
  });

  it('should have valid AnalysisResult type', () => {
    const result: AnalysisResult = {
      summary: 'Test summary',
      issues: [],
      recommendations: ['Test recommendation'],
      statistics: {
        total_repos: 1,
        total_prs: 1,
        self_merges: 0,
        security_prs: 0,
        repos_with_disabled_actions: 0,
        paused_workflows: 0,
        disabled_workflows: 0,
      },
    };

    expect(result.statistics.total_repos).toBe(1);
    expect(result.recommendations).toHaveLength(1);
  });

  it('should support Repository with optional workflows', () => {
    const repoWithWorkflows: Repository = {
      name: 'repo',
      full_name: 'test/repo',
      private: false,
      actions_enabled: true,
      security_enabled: true,
      workflows: [
        {
          id: 1,
          name: 'CI',
          path: '.github/workflows/ci.yml',
          state: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          url: 'https://github.com/test/repo/actions',
          badge_url: 'badge',
          is_scheduled: false,
        },
      ],
    };

    expect(repoWithWorkflows.workflows).toHaveLength(1);
  });
});
