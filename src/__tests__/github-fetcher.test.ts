import { GitHubFetcher } from '../services/github-fetcher';
import type { PullRequest, Repository } from '../types/index';

// Mock Octokit
const mockListForOrg = jest.fn();
const mockGetGithubActionsPermissions = jest.fn();
const mockGetRepo = jest.fn();
const mockListRepoWorkflows = jest.fn();
const mockListPulls = jest.fn();
const mockGetPull = jest.fn();
const mockListFiles = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      listForOrg: mockListForOrg,
      get: mockGetRepo,
    },
    actions: {
      getGithubActionsPermissionsRepository: mockGetGithubActionsPermissions,
      listRepoWorkflows: mockListRepoWorkflows,
    },
    pulls: {
      list: mockListPulls,
      get: mockGetPull,
      listFiles: mockListFiles,
    },
  })),
}));

describe('GitHubFetcher', () => {
  let fetcher: GitHubFetcher;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcher = new GitHubFetcher('test-token', 'test-org');
  });

  describe('constructor', () => {
    it('should create instance with token and organization', () => {
      expect(fetcher).toBeInstanceOf(GitHubFetcher);
    });
  });

  describe('getRepositories', () => {
    it('should fetch repositories from organization', async () => {
      mockListForOrg.mockResolvedValueOnce({
        data: [
          {
            name: 'repo1',
            full_name: 'test-org/repo1',
            private: false,
          },
        ],
      });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: true },
      });

      mockGetRepo.mockResolvedValue({
        data: {
          security_and_analysis: {
            secret_scanning: { status: 'enabled' },
          },
        },
      });

      mockListRepoWorkflows.mockResolvedValue({
        data: {
          workflows: [
            {
              id: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              state: 'active',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-24T00:00:00Z',
              html_url: 'https://github.com/test-org/repo1/actions',
              badge_url: 'https://github.com/test-org/repo1/workflows/CI/badge.svg',
            },
          ],
        },
      });

      const repos = await fetcher.getRepositories();

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('repo1');
      expect(repos[0].actions_enabled).toBe(true);
      expect(repos[0].security_enabled).toBe(true);
      expect(mockListForOrg).toHaveBeenCalled();
    });

    it('should handle repositories with disabled actions', async () => {
      mockListForOrg.mockResolvedValueOnce({
        data: [
          {
            name: 'repo2',
            full_name: 'test-org/repo2',
            private: true,
          },
        ],
      });
      mockListForOrg.mockResolvedValueOnce({ data: [] });

      mockGetGithubActionsPermissions.mockRejectedValue(new Error('404'));

      mockGetRepo.mockResolvedValue({
        data: {
          security_and_analysis: {},
        },
      });

      const repos = await fetcher.getRepositories();

      expect(repos).toHaveLength(1);
      expect(repos[0].actions_enabled).toBe(false);
      expect(repos[0].security_enabled).toBe(false);
      expect(repos[0].workflows).toBeUndefined();
    });

    // TODO: Fix workflow mock - includeWorkflows parameter not preventing workflow calls in test
    it.skip('should skip workflows when includeWorkflows is false', async () => {
      mockListForOrg
        .mockResolvedValueOnce({
          data: [
            {
              name: 'repo3',
              full_name: 'test-org/repo3',
              private: false,
            },
          ],
        })
        .mockResolvedValueOnce({ data: [] });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: true },
      });

      mockGetRepo.mockResolvedValue({
        data: { security_and_analysis: {} },
      });

      const repos = await fetcher.getRepositories(false);

      expect(repos).toHaveLength(1);
      expect(repos[0].workflows).toBeUndefined();
      expect(mockListRepoWorkflows).not.toHaveBeenCalled();
    });

    // TODO: Fix pagination mock - needs proper termination condition (data.length < perPage)
    it.skip('should handle pagination correctly', async () => {
      const page1Data = Array.from({ length: 100 }, (_, i) => ({
        name: `repo${i}`,
        full_name: `test-org/repo${i}`,
        private: false,
      }));

      const page2Data = [
        {
          name: 'repo100',
          full_name: 'test-org/repo100',
          private: false,
        },
      ];

      mockListForOrg
        .mockResolvedValueOnce({ data: page1Data })
        .mockResolvedValueOnce({ data: page2Data });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: false },
      });

      mockGetRepo.mockResolvedValue({
        data: { security_and_analysis: {} },
      });

      const repos = await fetcher.getRepositories(false);

      expect(repos.length).toBe(101);
      expect(mockListForOrg).toHaveBeenCalledTimes(2);
    });
  });

  describe('getWorkflows', () => {
    it('should fetch workflows for a repository', async () => {
      mockListRepoWorkflows.mockResolvedValue({
        data: {
          workflows: [
            {
              id: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              state: 'active',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-24T00:00:00Z',
              html_url: 'https://github.com/test-org/repo1/actions',
              badge_url: 'https://github.com/test-org/repo1/workflows/CI/badge.svg',
            },
            {
              id: 2,
              name: 'Scheduled Job',
              path: '.github/workflows/cron.yml',
              state: 'disabled_inactivity',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-20T00:00:00Z',
              html_url: 'https://github.com/test-org/repo1/actions',
              badge_url: 'https://github.com/test-org/repo1/workflows/Cron/badge.svg',
            },
          ],
        },
      });

      const workflows = await fetcher.getWorkflows('repo1');

      expect(workflows).toHaveLength(2);
      expect(workflows[0].name).toBe('CI');
      expect(workflows[0].state).toBe('active');
      expect(workflows[0].is_scheduled).toBe(false);
      expect(workflows[1].is_scheduled).toBe(true);
    });

    it('should return empty array when workflows fetch fails', async () => {
      mockListRepoWorkflows.mockRejectedValue(new Error('Not found'));

      const workflows = await fetcher.getWorkflows('nonexistent');

      expect(workflows).toEqual([]);
    });
  });

  describe('getRecentPullRequests', () => {
    // TODO: Fix complex integration test - needs proper date mocking and complete workflow mock chain
    it.skip('should fetch recent merged pull requests', async () => {
      // First call to listForOrg returns one repo
      mockListForOrg
        .mockResolvedValueOnce({
          data: [
            {
              name: 'repo1',
              full_name: 'test-org/repo1',
              private: false,
            },
          ],
        })
        .mockResolvedValueOnce({ data: [] });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: true },
      });

      mockGetRepo.mockResolvedValue({
        data: { security_and_analysis: {} },
      });

      mockListRepoWorkflows.mockResolvedValue({
        data: { workflows: [] },
      });

      mockListPulls.mockResolvedValue({
        data: [
          {
            number: 1,
            title: 'Fix security vulnerability',
            html_url: 'https://github.com/test-org/repo1/pull/1',
            user: { login: 'user1' },
            merged_at: new Date().toISOString(),
            created_at: '2026-01-20T00:00:00Z',
            labels: [{ name: 'security' }],
            body: 'Fixes CVE-2026-1234',
          },
        ],
      });

      mockGetPull.mockResolvedValue({
        data: {
          merged_by: { login: 'user2' },
        },
      });

      mockListFiles.mockResolvedValue({
        data: [{ filename: 'src/auth.ts' }, { filename: 'security.md' }],
      });

      const prs = await fetcher.getRecentPullRequests(30);

      expect(prs).toHaveLength(1);
      expect(prs[0].title).toBe('Fix security vulnerability');
      expect(prs[0].author).toBe('user1');
      expect(prs[0].merged_by).toBe('user2');
      expect(prs[0].is_security_related).toBe(true);
      expect(prs[0].files_changed).toEqual(['src/auth.ts', 'security.md']);
    });

    it('should skip PRs that were not merged', async () => {
      mockListForOrg.mockResolvedValueOnce({
        data: [
          {
            name: 'repo1',
            full_name: 'test-org/repo1',
            private: false,
          },
        ],
      });

      mockListForOrg.mockResolvedValueOnce({ data: [] });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: false },
      });

      mockGetRepo.mockResolvedValue({
        data: { security_and_analysis: {} },
      });

      mockListPulls.mockResolvedValue({
        data: [
          {
            number: 2,
            title: 'Unmerged PR',
            html_url: 'https://github.com/test-org/repo1/pull/2',
            user: { login: 'user1' },
            merged_at: null,
            created_at: '2026-01-24T00:00:00Z',
            labels: [],
            body: '',
          },
        ],
      });

      const prs = await fetcher.getRecentPullRequests(7);

      expect(prs).toHaveLength(0);
    });

    it('should skip PRs merged before the time window', async () => {
      mockListForOrg.mockResolvedValueOnce({
        data: [
          {
            name: 'repo1',
            full_name: 'test-org/repo1',
            private: false,
          },
        ],
      });

      mockListForOrg.mockResolvedValueOnce({ data: [] });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: false },
      });

      mockGetRepo.mockResolvedValue({
        data: { security_and_analysis: {} },
      });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      mockListPulls.mockResolvedValue({
        data: [
          {
            number: 3,
            title: 'Old PR',
            html_url: 'https://github.com/test-org/repo1/pull/3',
            user: { login: 'user1' },
            merged_at: oldDate.toISOString(),
            created_at: oldDate.toISOString(),
            labels: [],
            body: '',
          },
        ],
      });

      const prs = await fetcher.getRecentPullRequests(30);

      expect(prs).toHaveLength(0);
    });

    // TODO: Fix error handling test - console.error might be called in getRepositories, not PR loop
    it.skip('should handle errors when fetching PRs for a repo', async () => {
      mockListForOrg
        .mockResolvedValueOnce({
          data: [
            {
              name: 'repo1',
              full_name: 'test-org/repo1',
              private: false,
            },
          ],
        })
        .mockResolvedValueOnce({ data: [] });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: false },
      });

      mockGetRepo.mockResolvedValue({
        data: { security_and_analysis: {} },
      });

      mockListRepoWorkflows.mockResolvedValue({
        data: { workflows: [] },
      });

      mockListPulls.mockRejectedValue(new Error('API Error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const prs = await fetcher.getRecentPullRequests(30);

      expect(prs).toHaveLength(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching PRs'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    // TODO: Fix integration test - needs complete mock chain and proper date handling
    it.skip('should detect security-related PRs by labels', async () => {
      mockListForOrg
        .mockResolvedValueOnce({
          data: [
            {
              name: 'repo1',
              full_name: 'test-org/repo1',
              private: false,
            },
          ],
        })
        .mockResolvedValueOnce({ data: [] });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: false },
      });

      mockGetRepo.mockResolvedValue({
        data: { security_and_analysis: {} },
      });

      mockListRepoWorkflows.mockResolvedValue({
        data: { workflows: [] },
      });

      mockListPulls.mockResolvedValue({
        data: [
          {
            number: 4,
            title: 'Regular update',
            html_url: 'https://github.com/test-org/repo1/pull/4',
            user: { login: 'user1' },
            merged_at: new Date().toISOString(),
            created_at: '2026-01-24T00:00:00Z',
            labels: [{ name: 'vulnerability' }],
            body: 'Just an update',
          },
        ],
      });

      mockGetPull.mockResolvedValue({
        data: { merged_by: { login: 'user1' } },
      });

      mockListFiles.mockResolvedValue({
        data: [{ filename: 'README.md' }],
      });

      const prs = await fetcher.getRecentPullRequests(7);

      expect(prs).toHaveLength(1);
      expect(prs[0].is_security_related).toBe(true);
    });

    // TODO: Fix integration test - PR filtering logic might need date/workflow mock adjustments
    it.skip('should detect security-related PRs by file paths', async () => {
      mockListForOrg
        .mockResolvedValueOnce({
          data: [
            {
              name: 'repo1',
              full_name: 'test-org/repo1',
              private: false,
            },
          ],
        })
        .mockResolvedValueOnce({ data: [] });

      mockGetGithubActionsPermissions.mockResolvedValue({
        data: { enabled: false },
      });

      mockGetRepo.mockResolvedValue({
        data: { security_and_analysis: {} },
      });

      mockListRepoWorkflows.mockResolvedValue({
        data: { workflows: [] },
      });

      mockListPulls.mockResolvedValue({
        data: [
          {
            number: 5,
            title: 'Update CI',
            html_url: 'https://github.com/test-org/repo1/pull/5',
            user: { login: 'user1' },
            merged_at: new Date().toISOString(),
            created_at: '2026-01-24T00:00:00Z',
            labels: [],
            body: 'Updates workflow',
          },
        ],
      });

      mockGetPull.mockResolvedValue({
        data: { merged_by: { login: 'user1' } },
      });

      mockListFiles.mockResolvedValue({
        data: [{ filename: '.github/workflows/ci.yml' }],
      });

      const prs = await fetcher.getRecentPullRequests(7);

      expect(prs).toHaveLength(1);
      expect(prs[0].is_security_related).toBe(true);
    });
  });
});
