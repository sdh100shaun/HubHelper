// Mock chalk before importing ConsoleReporter
jest.mock('chalk');

import { ConsoleReporter } from '../reporters/console-reporter';
import type { AnalysisResult } from '../types/index';

// Mock console methods
const mockLog = jest.spyOn(console, 'log').mockImplementation();
const mockError = jest.spyOn(console, 'error').mockImplementation();

describe('ConsoleReporter', () => {
  let reporter: ConsoleReporter;

  beforeEach(() => {
    reporter = new ConsoleReporter();
    mockLog.mockClear();
    mockError.mockClear();
  });

  afterAll(() => {
    mockLog.mockRestore();
    mockError.mockRestore();
  });

  describe('printInfo', () => {
    it('should print info message', () => {
      reporter.printInfo('Test message');
      expect(mockLog).toHaveBeenCalled();
    });
  });

  describe('printSuccess', () => {
    it('should print success message', () => {
      reporter.printSuccess('Success!');
      expect(mockLog).toHaveBeenCalled();
    });
  });

  describe('printError', () => {
    it('should print error message', () => {
      const error = new Error('Test error');
      reporter.printError(error);
      expect(mockLog).toHaveBeenCalled();
    });

    it('should handle error with stack trace', () => {
      const error = new Error('Test error with stack');
      error.stack = 'Stack trace here';
      reporter.printError(error);
      expect(mockLog).toHaveBeenCalled();
    });
  });

  describe('printAnalysisResult', () => {
    const mockResult: AnalysisResult = {
      summary: 'Analyzed 10 repositories',
      statistics: {
        total_repos: 10,
        total_prs: 50,
        self_merges: 5,
        security_prs: 3,
        repos_with_disabled_actions: 2,
        paused_workflows: 1,
        disabled_workflows: 1,
      },
      issues: [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'test/repo',
          description: 'Self-merged PR',
          details: {
            pr_number: 1,
            author: 'user1',
            merged_by: 'user1',
          },
          detected_at: '2026-01-24T00:00:00Z',
        },
        {
          type: 'security-pr',
          severity: 'critical',
          repository: 'test/repo2',
          description: 'Security PR without review',
          details: {
            pr_number: 2,
          },
          detected_at: '2026-01-24T00:00:00Z',
        },
      ],
      recommendations: ['Enable branch protection', 'Require reviews'],
    };

    it('should print complete analysis result', () => {
      reporter.printAnalysisResult(mockResult);
      expect(mockLog).toHaveBeenCalled();
    });

    it('should print result with AI insights', () => {
      const aiInsights = 'AI detected patterns in your organization';
      reporter.printAnalysisResult(mockResult, aiInsights);
      expect(mockLog).toHaveBeenCalled();
    });

    it('should handle result with no issues', () => {
      const noIssuesResult: AnalysisResult = {
        ...mockResult,
        issues: [],
      };
      reporter.printAnalysisResult(noIssuesResult);
      expect(mockLog).toHaveBeenCalled();
    });

    it('should handle different severity levels', () => {
      const multiSeverityResult: AnalysisResult = {
        ...mockResult,
        issues: [
          {
            type: 'self-merge',
            severity: 'critical',
            repository: 'test/repo1',
            description: 'Critical issue',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
          {
            type: 'disabled-actions',
            severity: 'high',
            repository: 'test/repo2',
            description: 'High severity issue',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
          {
            type: 'paused-workflow',
            severity: 'medium',
            repository: 'test/repo3',
            description: 'Medium severity issue',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
          {
            type: 'disabled-workflow',
            severity: 'low',
            repository: 'test/repo4',
            description: 'Low severity issue',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
        ],
      };
      reporter.printAnalysisResult(multiSeverityResult);
      expect(mockLog).toHaveBeenCalled();
    });

    it('should handle all issue types', () => {
      const allTypesResult: AnalysisResult = {
        ...mockResult,
        issues: [
          {
            type: 'self-merge',
            severity: 'medium',
            repository: 'test/repo',
            description: 'Self-merge',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
          {
            type: 'security-pr',
            severity: 'high',
            repository: 'test/repo',
            description: 'Security PR',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
          {
            type: 'disabled-actions',
            severity: 'medium',
            repository: 'test/repo',
            description: 'Disabled Actions',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
          {
            type: 'unreviewed-security-pr',
            severity: 'critical',
            repository: 'test/repo',
            description: 'Unreviewed Security PR',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
          {
            type: 'paused-workflow',
            severity: 'medium',
            repository: 'test/repo',
            description: 'Paused Workflow',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
          {
            type: 'disabled-workflow',
            severity: 'low',
            repository: 'test/repo',
            description: 'Disabled Workflow',
            details: {},
            detected_at: '2026-01-24T00:00:00Z',
          },
        ],
      };
      reporter.printAnalysisResult(allTypesResult);
      expect(mockLog).toHaveBeenCalled();
    });

    it('should handle empty recommendations', () => {
      const noRecommendations: AnalysisResult = {
        ...mockResult,
        recommendations: [],
      };
      reporter.printAnalysisResult(noRecommendations);
      expect(mockLog).toHaveBeenCalled();
    });
  });
});
