import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { JSONReporter } from '../reporters/json-reporter';
import type { AnalysisResult } from '../types/index';

describe('JSONReporter', () => {
  let reporter: JSONReporter;
  const testFilePath = join(process.cwd(), 'test-report.json');

  beforeEach(() => {
    reporter = new JSONReporter();
    // Clean up test file if it exists
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    // Clean up test file after each test
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  const mockResult: AnalysisResult = {
    summary: 'Analyzed 10 repositories and 50 pull requests',
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
          title: 'Fix bug',
          url: 'https://github.com/test/repo/pull/1',
          author: 'user1',
          merged_by: 'user1',
          merged_at: '2026-01-24T10:00:00Z',
        },
        detected_at: '2026-01-24T12:00:00Z',
      },
    ],
    recommendations: ['Enable branch protection', 'Require reviews'],
  };

  describe('saveToFile', () => {
    it('should save JSON report to file', () => {
      reporter.saveToFile(mockResult, testFilePath);

      expect(existsSync(testFilePath)).toBe(true);
      const content = readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.summary).toBe(mockResult.summary);
      expect(parsed.statistics).toEqual(mockResult.statistics);
      expect(parsed.issues).toEqual(mockResult.issues);
      expect(parsed.recommendations).toEqual(mockResult.recommendations);
    });

    it('should include generated_at timestamp', () => {
      const beforeTime = new Date().toISOString();
      reporter.saveToFile(mockResult, testFilePath);
      const afterTime = new Date().toISOString();

      const content = readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.generated_at).toBeDefined();
      expect(typeof parsed.generated_at).toBe('string');
      // Timestamp should be between before and after
      expect(parsed.generated_at >= beforeTime).toBe(true);
      expect(parsed.generated_at <= afterTime).toBe(true);
    });

    it('should format JSON with proper indentation', () => {
      reporter.saveToFile(mockResult, testFilePath);

      const content = readFileSync(testFilePath, 'utf-8');

      // Check for 2-space indentation
      expect(content).toContain('  "summary"');
      expect(content).toContain('  "statistics"');
      expect(content).toContain('    "total_repos"');
    });

    it('should overwrite existing file', () => {
      reporter.saveToFile(mockResult, testFilePath);
      const firstContent = readFileSync(testFilePath, 'utf-8');
      const _firstParsed = JSON.parse(firstContent);

      const updatedResult: AnalysisResult = {
        ...mockResult,
        summary: 'Updated summary',
      };

      reporter.saveToFile(updatedResult, testFilePath);
      const secondContent = readFileSync(testFilePath, 'utf-8');
      const secondParsed = JSON.parse(secondContent);

      expect(secondContent).not.toBe(firstContent);
      expect(secondParsed.summary).toBe('Updated summary');
      // Timestamp should exist and be a valid ISO string
      expect(secondParsed.generated_at).toBeDefined();
      expect(typeof secondParsed.generated_at).toBe('string');
      expect(new Date(secondParsed.generated_at).toISOString()).toBe(secondParsed.generated_at);
    });

    it('should preserve all data types correctly', () => {
      const complexResult: AnalysisResult = {
        summary: 'Test with various data types',
        statistics: {
          total_repos: 0,
          total_prs: 100,
          self_merges: 5,
          security_prs: 0,
          repos_with_disabled_actions: 10,
          paused_workflows: 0,
          disabled_workflows: 0,
        },
        issues: [],
        recommendations: [],
      };

      reporter.saveToFile(complexResult, testFilePath);

      const content = readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Verify numbers are preserved as numbers
      expect(typeof parsed.statistics.total_repos).toBe('number');
      expect(parsed.statistics.total_repos).toBe(0);
      expect(parsed.statistics.total_prs).toBe(100);

      // Verify arrays are preserved
      expect(Array.isArray(parsed.issues)).toBe(true);
      expect(Array.isArray(parsed.recommendations)).toBe(true);
      expect(parsed.issues).toHaveLength(0);
    });

    it('should handle special characters in strings', () => {
      const specialCharsResult: AnalysisResult = {
        summary: 'Test with "quotes" and \n newlines \t tabs',
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
          {
            type: 'self-merge',
            severity: 'high',
            repository: 'test/repo-with-dashes',
            description: 'Description with "quotes" and \'apostrophes\'',
            details: {
              title: 'Title with <html> tags & symbols',
            },
            detected_at: '2026-01-24T00:00:00Z',
          },
        ],
        recommendations: ['Fix "security" issues', 'Update <dependency>'],
      };

      reporter.saveToFile(specialCharsResult, testFilePath);

      const content = readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.summary).toBe(specialCharsResult.summary);
      expect(parsed.issues[0].description).toBe(specialCharsResult.issues[0].description);
      expect(parsed.issues[0].details.title).toBe('Title with <html> tags & symbols');
    });

    it('should handle empty results', () => {
      const emptyResult: AnalysisResult = {
        summary: '',
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

      reporter.saveToFile(emptyResult, testFilePath);

      expect(existsSync(testFilePath)).toBe(true);
      const content = readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.summary).toBe('');
      expect(parsed.issues).toHaveLength(0);
      expect(parsed.recommendations).toHaveLength(0);
    });

    it('should handle large datasets', () => {
      const largeResult: AnalysisResult = {
        summary: 'Large dataset test',
        statistics: {
          total_repos: 1000,
          total_prs: 5000,
          self_merges: 500,
          security_prs: 100,
          repos_with_disabled_actions: 50,
          paused_workflows: 25,
          disabled_workflows: 10,
        },
        issues: Array.from({ length: 100 }, (_, i) => ({
          type: 'self-merge' as const,
          severity: 'high' as const,
          repository: `org/repo-${i}`,
          description: `Issue ${i}`,
          details: {
            pr_number: i,
            title: `PR ${i}`,
          },
          detected_at: '2026-01-24T00:00:00Z',
        })),
        recommendations: Array.from({ length: 50 }, (_, i) => `Recommendation ${i}`),
      };

      reporter.saveToFile(largeResult, testFilePath);

      const content = readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.issues).toHaveLength(100);
      expect(parsed.recommendations).toHaveLength(50);
      expect(parsed.statistics.total_repos).toBe(1000);
    });
  });

  describe('print', () => {
    let mockLog: jest.SpyInstance;

    beforeEach(() => {
      mockLog = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      mockLog.mockRestore();
    });

    it('should print JSON to console', () => {
      reporter.print(mockResult);

      expect(mockLog).toHaveBeenCalledTimes(1);
      const output = mockLog.mock.calls[0][0];

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed.summary).toBe(mockResult.summary);
      expect(parsed.statistics).toEqual(mockResult.statistics);
    });

    it('should format output with indentation', () => {
      reporter.print(mockResult);

      const output = mockLog.mock.calls[0][0];

      // Check for 2-space indentation
      expect(output).toContain('  "summary"');
      expect(output).toContain('  "statistics"');
      expect(output).toContain('    "total_repos"');
    });

    it('should not include generated_at in print output', () => {
      reporter.print(mockResult);

      const output = mockLog.mock.calls[0][0];

      // Print should not add generated_at (only saveToFile does)
      expect(output).not.toContain('generated_at');
    });

    it('should handle empty results', () => {
      const emptyResult: AnalysisResult = {
        summary: '',
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

      reporter.print(emptyResult);

      expect(mockLog).toHaveBeenCalledTimes(1);
      const output = mockLog.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.issues).toHaveLength(0);
    });

    it('should preserve data types in output', () => {
      reporter.print(mockResult);

      const output = mockLog.mock.calls[0][0];
      const parsed = JSON.parse(output);

      // Numbers should remain numbers
      expect(typeof parsed.statistics.total_repos).toBe('number');
      // Arrays should remain arrays
      expect(Array.isArray(parsed.issues)).toBe(true);
      // Objects should remain objects
      expect(typeof parsed.statistics).toBe('object');
    });
  });
});
