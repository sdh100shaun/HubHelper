import { HTMLReporter } from '../reporters/html-reporter';
import type { AnalysisResult } from '../types/index';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('HTMLReporter', () => {
  let reporter: HTMLReporter;
  const testFilePath = join(process.cwd(), 'test-report.html');

  beforeEach(() => {
    reporter = new HTMLReporter();
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

  describe('generateReport', () => {
    it('should generate HTML report', () => {
      const html = reporter.generateReport(mockResult);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('GitHub Security Analysis');
      expect(html).toContain('Analyzed 10 repositories');
    });

    it('should include statistics in report', () => {
      const html = reporter.generateReport(mockResult);

      expect(html).toContain('10'); // total_repos
      expect(html).toContain('50'); // total_prs
      expect(html).toContain('5');  // self_merges
    });

    it('should include AI insights when provided', () => {
      const aiInsights = 'Detected patterns across repositories';
      const html = reporter.generateReport(mockResult, aiInsights);

      expect(html).toContain(aiInsights);
      expect(html).toContain('AI-Powered Insights');
    });

    it('should not include AI section without insights', () => {
      const html = reporter.generateReport(mockResult);

      expect(html).not.toContain('AI-Powered Insights');
    });

    it('should include Content Security Policy headers', () => {
      const html = reporter.generateReport(mockResult);

      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain("script-src 'none'");
    });

    it('should escape user-controlled data', () => {
      const maliciousResult: AnalysisResult = {
        ...mockResult,
        summary: '<script>alert("xss")</script>',
        issues: [
          {
            type: 'self-merge',
            severity: 'high',
            repository: '<script>alert(1)</script>',
            description: '<img src=x onerror=alert(1)>',
            details: {
              title: '</title><script>alert(2)</script>',
            },
            detected_at: '2026-01-24T00:00:00Z',
          },
        ],
      };

      const html = reporter.generateReport(maliciousResult);

      // Should escape HTML tags
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
    });

    it('should handle empty issues array', () => {
      const noIssuesResult: AnalysisResult = {
        ...mockResult,
        issues: [],
      };

      const html = reporter.generateReport(noIssuesResult);

      expect(html).toContain('No Issues Found');
    });

    it('should include all severity badges', () => {
      const multiSeverityResult: AnalysisResult = {
        ...mockResult,
        issues: [
          { type: 'self-merge', severity: 'critical', repository: 'r1', description: 'd1', details: {}, detected_at: '2026-01-24' },
          { type: 'self-merge', severity: 'high', repository: 'r2', description: 'd2', details: {}, detected_at: '2026-01-24' },
          { type: 'self-merge', severity: 'medium', repository: 'r3', description: 'd3', details: {}, detected_at: '2026-01-24' },
          { type: 'self-merge', severity: 'low', repository: 'r4', description: 'd4', details: {}, detected_at: '2026-01-24' },
        ],
      };

      const html = reporter.generateReport(multiSeverityResult);

      expect(html).toContain('severity-critical');
      expect(html).toContain('severity-high');
      expect(html).toContain('severity-medium');
      expect(html).toContain('severity-low');
    });

    it('should include recommendations when present', () => {
      const html = reporter.generateReport(mockResult);

      expect(html).toContain('Recommendations');
      expect(html).toContain('Enable branch protection');
      expect(html).toContain('Require reviews');
    });

    it('should escape recommendations', () => {
      const maliciousRecommendations: AnalysisResult = {
        ...mockResult,
        recommendations: ['<script>alert(1)</script>', 'Normal recommendation'],
      };

      const html = reporter.generateReport(maliciousRecommendations);

      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('should sanitize URLs', () => {
      const maliciousURL: AnalysisResult = {
        ...mockResult,
        issues: [
          {
            type: 'self-merge',
            severity: 'high',
            repository: 'test/repo',
            description: 'Test',
            details: {
              url: 'javascript:alert(1)',
            },
            detected_at: '2026-01-24T00:00:00Z',
          },
        ],
      };

      const html = reporter.generateReport(maliciousURL);

      // Should not include javascript: URLs
      expect(html).not.toContain('javascript:alert(1)');
    });
  });

  describe('saveToFile', () => {
    it('should save HTML report to file', () => {
      reporter.saveToFile(mockResult, testFilePath);

      expect(existsSync(testFilePath)).toBe(true);
      const content = readFileSync(testFilePath, 'utf-8');
      expect(content).toContain('GitHub Security Analysis');
    });

    it('should save report with AI insights', () => {
      const aiInsights = 'AI analysis results';
      reporter.saveToFile(mockResult, testFilePath, aiInsights);

      const content = readFileSync(testFilePath, 'utf-8');
      expect(content).toContain(aiInsights);
    });

    it('should overwrite existing file', () => {
      reporter.saveToFile(mockResult, testFilePath);
      const firstContent = readFileSync(testFilePath, 'utf-8');

      const updatedResult: AnalysisResult = {
        ...mockResult,
        summary: 'Updated summary',
      };
      reporter.saveToFile(updatedResult, testFilePath);
      const secondContent = readFileSync(testFilePath, 'utf-8');

      expect(secondContent).not.toBe(firstContent);
      expect(secondContent).toContain('Updated summary');
    });
  });
});
