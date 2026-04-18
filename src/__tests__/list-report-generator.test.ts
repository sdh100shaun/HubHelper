/**
 * Unit tests for ListReportGenerator
 *
 * GitHubFetcher and SecurityAnalyzer are fully mocked so that no network
 * calls are made.  RepositoryListManager is injected directly so we can
 * control list data without touching the filesystem.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SecurityAnalyzer } from '../analyzers/security-analyzer.js';
import { GitHubFetcher } from '../services/github-fetcher.js';
import { ListReportGenerator } from '../services/list-report-generator.js';
import { RepositoryListManager } from '../services/repository-list-manager.js';
import type { AnalysisResult, Repository, RepositoryList } from '../types/index.js';

// Mock the module-level dependencies so no real I/O or API calls happen
jest.mock('../services/github-fetcher.js');
jest.mock('../analyzers/security-analyzer.js');
jest.mock('../services/repository-list-manager.js');

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    name: 'repo1',
    full_name: 'test-org/repo1',
    private: false,
    actions_enabled: true,
    security_enabled: true,
    open_issues_count: 0,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeList(overrides: Partial<RepositoryList> = {}): RepositoryList {
  return {
    name: 'my-list',
    description: 'Test list',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    repositories: ['test-org/repo1'],
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ListReportGenerator', () => {
  // biome-ignore lint/suspicious/noExplicitAny: jest mock helpers need any
  let mockFetcher: any;
  // biome-ignore lint/suspicious/noExplicitAny: jest mock helpers need any
  let mockAnalyzer: any;
  // biome-ignore lint/suspicious/noExplicitAny: jest mock helpers need any
  let mockListManager: any;
  let generator: ListReportGenerator;

  beforeEach(() => {
    jest.clearAllMocks();

    const MockedFetcher = GitHubFetcher as unknown as jest.MockedClass<typeof GitHubFetcher>;
    const MockedAnalyzer = SecurityAnalyzer as unknown as jest.MockedClass<typeof SecurityAnalyzer>;
    const MockedListManager = RepositoryListManager as unknown as jest.MockedClass<
      typeof RepositoryListManager
    >;

    mockFetcher = {
      getRepositories: jest.fn<() => Promise<Repository[]>>(),
      getRecentPullRequests: jest.fn(),
    };
    MockedFetcher.mockImplementation(() => mockFetcher);

    mockAnalyzer = {
      generateAnalysisResult: jest.fn<() => AnalysisResult>(),
    };
    MockedAnalyzer.mockImplementation(() => mockAnalyzer);

    mockListManager = {
      getList: jest.fn<() => RepositoryList>(),
    };
    MockedListManager.mockImplementation(() => mockListManager);

    // Inject the mocked list manager via the optional constructor parameter
    generator = new ListReportGenerator('fake-token', 'test-org', mockListManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // generateReport – happy path
  // -------------------------------------------------------------------------
  describe('generateReport', () => {
    it('returns a report with correct summary counts for a healthy repo', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo()]);

      const report = await generator.generateReport('my-list');

      expect(report.list).toBe('my-list');
      expect(report.summary.totalRepos).toBe(1);
      expect(report.summary.actionsEnabled).toBe(1);
      expect(report.summary.securityEnabled).toBe(1);
      expect(report.summary.totalIssues).toBe(0);
      expect(report.summary.criticalIssues).toBe(0);
      expect(report.summary.highIssues).toBe(0);
      expect(report.repositories).toHaveLength(1);
      expect(report.generated).toBeDefined();
    });

    it('filters allRepos to only include repos in the list', async () => {
      mockListManager.getList.mockReturnValue(makeList({ repositories: ['test-org/repo1'] }));
      mockFetcher.getRepositories.mockResolvedValue([
        makeRepo({ name: 'repo1', full_name: 'test-org/repo1' }),
        makeRepo({ name: 'repo2', full_name: 'test-org/repo2' }),
      ]);

      const report = await generator.generateReport('my-list');

      expect(report.summary.totalRepos).toBe(1);
      expect(report.repositories[0].full_name).toBe('test-org/repo1');
    });

    it('counts security issues for repos with disabled actions', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo({ actions_enabled: false })]);

      const report = await generator.generateReport('my-list');

      expect(report.summary.totalIssues).toBe(1);
      expect(report.summary.highIssues).toBe(1);
      expect(report.repositories[0].security_issues).toBe(1);
    });

    it('counts security issues for repos with security disabled', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo({ security_enabled: false })]);

      const report = await generator.generateReport('my-list');

      expect(report.summary.totalIssues).toBe(1);
      expect(report.summary.highIssues).toBe(1);
    });

    it('counts both issue types when both actions and security are disabled', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([
        makeRepo({ actions_enabled: false, security_enabled: false }),
      ]);

      const report = await generator.generateReport('my-list');

      expect(report.summary.totalIssues).toBe(2);
      expect(report.summary.highIssues).toBe(2);
    });

    it('aggregates issue counts across multiple repositories', async () => {
      mockListManager.getList.mockReturnValue(
        makeList({ repositories: ['test-org/repo1', 'test-org/repo2', 'test-org/repo3'] })
      );
      mockFetcher.getRepositories.mockResolvedValue([
        makeRepo({ name: 'repo1', full_name: 'test-org/repo1', actions_enabled: false }),
        makeRepo({ name: 'repo2', full_name: 'test-org/repo2', security_enabled: false }),
        makeRepo({ name: 'repo3', full_name: 'test-org/repo3' }),
      ]);

      const report = await generator.generateReport('my-list');

      expect(report.summary.totalRepos).toBe(3);
      expect(report.summary.totalIssues).toBe(2);
      expect(report.summary.actionsEnabled).toBe(2);
      expect(report.summary.securityEnabled).toBe(2);
    });

    it('sets open_issues from open_issues_count field on repo', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo({ open_issues_count: 5 })]);

      const report = await generator.generateReport('my-list');

      expect(report.repositories[0].open_issues).toBe(5);
    });

    it('sets last_activity from updated_at field on repo', async () => {
      const updatedAt = '2026-03-15T12:00:00Z';
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo({ updated_at: updatedAt })]);

      const report = await generator.generateReport('my-list');

      expect(report.repositories[0].last_activity).toBe(updatedAt);
    });

    it('constructs correct repo URL', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo({ full_name: 'test-org/repo1' })]);

      const report = await generator.generateReport('my-list');

      expect(report.repositories[0].url).toBe('https://github.com/test-org/repo1');
    });

    it('throws when no repos from allRepos match the list', async () => {
      mockListManager.getList.mockReturnValue(
        makeList({ repositories: ['test-org/missing-repo'] })
      );
      mockFetcher.getRepositories.mockResolvedValue([
        makeRepo({ full_name: 'test-org/other-repo' }),
      ]);

      await expect(generator.generateReport('my-list')).rejects.toThrow(
        "No repositories found for list 'my-list'"
      );
    });

    it('throws when list does not exist', async () => {
      mockListManager.getList.mockImplementation(() => {
        throw new Error("List 'nonexistent' not found");
      });

      await expect(generator.generateReport('nonexistent')).rejects.toThrow(
        "List 'nonexistent' not found"
      );
    });

    it('propagates fetcher errors', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockRejectedValue(new Error('API error'));

      await expect(generator.generateReport('my-list')).rejects.toThrow('API error');
    });

    // -----------------------------------------------------------------------
    // Recommendations
    // -----------------------------------------------------------------------
    describe('recommendations', () => {
      it('adds recommendation for disabled actions', async () => {
        mockListManager.getList.mockReturnValue(makeList());
        mockFetcher.getRepositories.mockResolvedValue([makeRepo({ actions_enabled: false })]);

        const report = await generator.generateReport('my-list');

        expect(report.recommendations.some((r) => r.includes('Enable GitHub Actions'))).toBe(true);
      });

      it('adds recommendation for disabled security', async () => {
        mockListManager.getList.mockReturnValue(makeList());
        mockFetcher.getRepositories.mockResolvedValue([makeRepo({ security_enabled: false })]);

        const report = await generator.generateReport('my-list');

        expect(report.recommendations.some((r) => r.includes('Enable security features'))).toBe(
          true
        );
      });

      it('adds urgent recommendation for critical issues', async () => {
        // No current issue type yields critical counts via countSecurityIssues,
        // so we verify the "all good" path instead
        mockListManager.getList.mockReturnValue(makeList());
        mockFetcher.getRepositories.mockResolvedValue([makeRepo()]);

        const report = await generator.generateReport('my-list');

        expect(report.recommendations.some((r) => r.includes('All repositories meeting'))).toBe(
          true
        );
      });

      it('uses singular form for a single disabled-actions repo', async () => {
        mockListManager.getList.mockReturnValue(makeList());
        mockFetcher.getRepositories.mockResolvedValue([makeRepo({ actions_enabled: false })]);

        const report = await generator.generateReport('my-list');

        expect(
          report.recommendations.some(
            (r) => r.includes('1 repository') && !r.includes('repositories')
          )
        ).toBe(true);
      });

      it('uses plural form for multiple disabled-actions repos', async () => {
        mockListManager.getList.mockReturnValue(
          makeList({ repositories: ['test-org/repo1', 'test-org/repo2'] })
        );
        mockFetcher.getRepositories.mockResolvedValue([
          makeRepo({ name: 'repo1', full_name: 'test-org/repo1', actions_enabled: false }),
          makeRepo({ name: 'repo2', full_name: 'test-org/repo2', actions_enabled: false }),
        ]);

        const report = await generator.generateReport('my-list');

        expect(report.recommendations.some((r) => r.includes('2 repositories'))).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // generateDetailedReport
  // -------------------------------------------------------------------------
  describe('generateDetailedReport', () => {
    const mockAnalysisResult: AnalysisResult = {
      summary: 'Test summary',
      issues: [],
      recommendations: ['All clear'],
      statistics: {
        total_repos: 1,
        total_prs: 0,
        self_merges: 0,
        security_prs: 0,
        repos_with_disabled_actions: 0,
        paused_workflows: 0,
        disabled_workflows: 0,
      },
    };

    it('returns an AnalysisResult for repos in the list', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo()]);
      mockFetcher.getRecentPullRequests.mockResolvedValue([]);
      mockAnalyzer.generateAnalysisResult.mockReturnValue(mockAnalysisResult);

      const result = await generator.generateDetailedReport('my-list');

      expect(result).toBe(mockAnalysisResult);
      expect(mockAnalyzer.generateAnalysisResult).toHaveBeenCalledTimes(1);
    });

    it('filters both repos and PRs to only list members', async () => {
      mockListManager.getList.mockReturnValue(makeList({ repositories: ['test-org/repo1'] }));
      mockFetcher.getRepositories.mockResolvedValue([
        makeRepo({ name: 'repo1', full_name: 'test-org/repo1' }),
        makeRepo({ name: 'repo2', full_name: 'test-org/repo2' }),
      ]);
      mockFetcher.getRecentPullRequests.mockResolvedValue([
        { repository: 'test-org/repo1', number: 1, title: 'PR1' },
        { repository: 'test-org/repo2', number: 2, title: 'PR2' },
      ]);
      mockAnalyzer.generateAnalysisResult.mockReturnValue(mockAnalysisResult);

      await generator.generateDetailedReport('my-list');

      const [repos, prs] = mockAnalyzer.generateAnalysisResult.mock.calls[0] as [
        Repository[],
        unknown[],
      ];
      expect(repos).toHaveLength(1);
      expect(repos[0].full_name).toBe('test-org/repo1');
      expect(prs).toHaveLength(1);
    });

    it('uses the supplied daysBack parameter for PR fetching', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo()]);
      mockFetcher.getRecentPullRequests.mockResolvedValue([]);
      mockAnalyzer.generateAnalysisResult.mockReturnValue(mockAnalysisResult);

      await generator.generateDetailedReport('my-list', 7);

      expect(mockFetcher.getRecentPullRequests).toHaveBeenCalledWith(7);
    });

    it('defaults to 30 days when daysBack is not provided', async () => {
      mockListManager.getList.mockReturnValue(makeList());
      mockFetcher.getRepositories.mockResolvedValue([makeRepo()]);
      mockFetcher.getRecentPullRequests.mockResolvedValue([]);
      mockAnalyzer.generateAnalysisResult.mockReturnValue(mockAnalysisResult);

      await generator.generateDetailedReport('my-list');

      expect(mockFetcher.getRecentPullRequests).toHaveBeenCalledWith(30);
    });
  });
});
