import { beforeEach, describe, expect, it } from '@jest/globals';
import { SecurityAnalyzer } from '../analyzers/security-analyzer';
import type { PullRequest, Repository } from '../types/index';

describe('SecurityAnalyzer', () => {
  let analyzer: SecurityAnalyzer;

  beforeEach(() => {
    analyzer = new SecurityAnalyzer();
  });

  describe('analyzeSelfMerges', () => {
    it('should detect self-merged pull requests', () => {
      const pullRequests: PullRequest[] = [
        {
          number: 1,
          title: 'Test PR',
          url: 'https://github.com/test/repo/pull/1',
          author: 'user1',
          merged_by: 'user1',
          merged_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          repository: 'test/repo',
          labels: [],
          is_security_related: false,
          files_changed: [],
        },
      ];

      const issues = analyzer.analyzeSelfMerges(pullRequests);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('self-merge');
      expect(issues[0].severity).toBe('medium');
    });

    it('should flag security-related self-merges as high severity', () => {
      const pullRequests: PullRequest[] = [
        {
          number: 1,
          title: 'Security fix',
          url: 'https://github.com/test/repo/pull/1',
          author: 'user1',
          merged_by: 'user1',
          merged_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          repository: 'test/repo',
          labels: ['security'],
          is_security_related: true,
          files_changed: [],
        },
      ];

      const issues = analyzer.analyzeSelfMerges(pullRequests);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('high');
    });

    it('should not flag PRs merged by others', () => {
      const pullRequests: PullRequest[] = [
        {
          number: 1,
          title: 'Test PR',
          url: 'https://github.com/test/repo/pull/1',
          author: 'user1',
          merged_by: 'user2',
          merged_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          repository: 'test/repo',
          labels: [],
          is_security_related: false,
          files_changed: [],
        },
      ];

      const issues = analyzer.analyzeSelfMerges(pullRequests);

      expect(issues).toHaveLength(0);
    });
  });

  describe('analyzeSecurityPRs', () => {
    it('should detect security-related pull requests', () => {
      const pullRequests: PullRequest[] = [
        {
          number: 1,
          title: 'Fix XSS vulnerability',
          url: 'https://github.com/test/repo/pull/1',
          author: 'user1',
          merged_by: 'user2',
          merged_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          repository: 'test/repo',
          labels: ['security'],
          is_security_related: true,
          files_changed: [],
        },
      ];

      const issues = analyzer.analyzeSecurityPRs(pullRequests);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('security-pr');
    });

    it('should assign critical severity for CVE-related PRs', () => {
      const pullRequests: PullRequest[] = [
        {
          number: 1,
          title: 'Fix CVE-2024-1234',
          url: 'https://github.com/test/repo/pull/1',
          author: 'user1',
          merged_by: 'user2',
          merged_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          repository: 'test/repo',
          labels: [],
          is_security_related: true,
          files_changed: [],
        },
      ];

      const issues = analyzer.analyzeSecurityPRs(pullRequests);

      expect(issues[0].severity).toBe('critical');
    });
  });

  describe('analyzeDisabledActions', () => {
    it('should detect repositories with disabled Actions', () => {
      const repositories: Repository[] = [
        {
          name: 'repo1',
          full_name: 'test/repo1',
          private: false,
          actions_enabled: false,
          security_enabled: true,
        },
      ];

      const issues = analyzer.analyzeDisabledActions(repositories);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('disabled-actions');
      expect(issues[0].severity).toBe('medium');
    });

    it('should not flag repositories with enabled Actions', () => {
      const repositories: Repository[] = [
        {
          name: 'repo1',
          full_name: 'test/repo1',
          private: false,
          actions_enabled: true,
          security_enabled: true,
        },
      ];

      const issues = analyzer.analyzeDisabledActions(repositories);

      expect(issues).toHaveLength(0);
    });
  });

  describe('analyzePausedWorkflows', () => {
    it('should detect paused workflows', () => {
      const repositories: Repository[] = [
        {
          name: 'repo1',
          full_name: 'test/repo1',
          private: false,
          actions_enabled: true,
          security_enabled: true,
          workflows: [
            {
              id: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              state: 'disabled_inactivity',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-06-01T00:00:00Z',
              url: 'https://github.com/test/repo1/actions/workflows/ci.yml',
              badge_url: 'https://github.com/test/repo1/workflows/CI/badge.svg',
              is_scheduled: true,
            },
          ],
        },
      ];

      const issues = analyzer.analyzePausedWorkflows(repositories);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('paused-workflow');
      expect(issues[0].severity).toBe('medium');
    });
  });

  describe('analyzeDisabledWorkflows', () => {
    it('should detect manually disabled workflows', () => {
      const repositories: Repository[] = [
        {
          name: 'repo1',
          full_name: 'test/repo1',
          private: false,
          actions_enabled: true,
          security_enabled: true,
          workflows: [
            {
              id: 1,
              name: 'Deploy',
              path: '.github/workflows/deploy.yml',
              state: 'disabled_manually',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
              url: 'https://github.com/test/repo1/actions/workflows/deploy.yml',
              badge_url: 'https://github.com/test/repo1/workflows/Deploy/badge.svg',
              is_scheduled: false,
            },
          ],
        },
      ];

      const issues = analyzer.analyzeDisabledWorkflows(repositories);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('disabled-workflow');
      expect(issues[0].severity).toBe('low');
    });
  });

  describe('generateAnalysisResult', () => {
    it('should generate comprehensive analysis result', () => {
      const repositories: Repository[] = [
        {
          name: 'repo1',
          full_name: 'test/repo1',
          private: false,
          actions_enabled: true,
          security_enabled: true,
        },
      ];

      const pullRequests: PullRequest[] = [
        {
          number: 1,
          title: 'Test PR',
          url: 'https://github.com/test/repo1/pull/1',
          author: 'user1',
          merged_by: 'user1',
          merged_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          repository: 'test/repo1',
          labels: [],
          is_security_related: false,
          files_changed: [],
        },
      ];

      const result = analyzer.generateAnalysisResult(repositories, pullRequests);

      expect(result.statistics.total_repos).toBe(1);
      expect(result.statistics.total_prs).toBe(1);
      expect(result.statistics.self_merges).toBe(1);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.summary).toContain('Analyzed 1 repositories');
    });

    it('should sort issues by severity', () => {
      const pullRequests: PullRequest[] = [
        {
          number: 1,
          title: 'Low priority',
          url: 'https://github.com/test/repo/pull/1',
          author: 'user1',
          merged_by: 'user1',
          merged_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          repository: 'test/repo',
          labels: [],
          is_security_related: false,
          files_changed: [],
        },
        {
          number: 2,
          title: 'Fix critical CVE',
          url: 'https://github.com/test/repo/pull/2',
          author: 'user1',
          merged_by: 'user1',
          merged_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          repository: 'test/repo',
          labels: ['security'],
          is_security_related: true,
          files_changed: [],
        },
      ];

      const result = analyzer.generateAnalysisResult([], pullRequests);

      // First issue should be critical (unreviewed security PR)
      expect(result.issues[0].severity).toBe('critical');
    });
  });
});
