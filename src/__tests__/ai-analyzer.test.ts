import { beforeEach, describe, expect, it } from '@jest/globals';
import { AIAnalyzer } from '../analyzers/ai-analyzer';
import type { AnalysisResult, SecurityIssue } from '../types/index';

describe('AIAnalyzer', () => {
  let analyzer: AIAnalyzer;

  beforeEach(() => {
    analyzer = new AIAnalyzer();
  });

  describe('analyzePatterns', () => {
    it('should detect self-merge patterns', async () => {
      const issues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'medium',
          repository: 'test/repo1',
          description: 'Self merge detected',
          details: {},
          detected_at: '2026-01-01T00:00:00Z',
        },
        {
          type: 'self-merge',
          severity: 'medium',
          repository: 'test/repo2',
          description: 'Self merge detected',
          details: {},
          detected_at: '2026-01-01T00:00:00Z',
        },
      ];

      const patterns = await analyzer.analyzePatterns(issues);

      expect(patterns.patterns).toContain('Self-merges detected across 2 repositories');
    });

    it('should assess risk level based on critical issues', async () => {
      const criticalIssues: SecurityIssue[] = [
        {
          type: 'unreviewed-security-pr',
          severity: 'critical',
          repository: 'test/repo',
          description: 'Critical security issue',
          details: {},
          detected_at: '2026-01-01T00:00:00Z',
        },
      ];

      const patterns = await analyzer.analyzePatterns(criticalIssues);

      expect(patterns.risk_assessment).toBe('Critical risk - immediate action required');
    });

    it('should assess low risk for no issues', async () => {
      const patterns = await analyzer.analyzePatterns([]);

      expect(patterns.risk_assessment).toBe('Low risk');
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend branch protection for self-merges', async () => {
      const issues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'medium',
          repository: 'test/repo',
          description: 'Self merge',
          details: {},
          detected_at: '2026-01-01T00:00:00Z',
        },
      ];

      const recommendations = await analyzer.generateRecommendations(issues);

      expect(recommendations.some((r) => r.includes('branch protection'))).toBe(true);
    });

    it('should recommend security review for unreviewed security PRs', async () => {
      const issues: SecurityIssue[] = [
        {
          type: 'unreviewed-security-pr',
          severity: 'critical',
          repository: 'test/repo',
          description: 'Unreviewed security PR',
          details: {},
          detected_at: '2026-01-01T00:00:00Z',
        },
      ];

      const recommendations = await analyzer.generateRecommendations(issues);

      expect(recommendations.some((r) => r.includes('security team review'))).toBe(true);
    });

    it('should recommend enabling Actions for disabled repos', async () => {
      const issues: SecurityIssue[] = [
        {
          type: 'disabled-actions',
          severity: 'medium',
          repository: 'test/repo',
          description: 'Actions disabled',
          details: {},
          detected_at: '2026-01-01T00:00:00Z',
        },
      ];

      const recommendations = await analyzer.generateRecommendations(issues);

      expect(recommendations.some((r) => r.includes('Enable GitHub Actions'))).toBe(true);
    });

    it('should provide urgent recommendation for critical issues', async () => {
      const issues: SecurityIssue[] = [
        {
          type: 'unreviewed-security-pr',
          severity: 'critical',
          repository: 'test/repo',
          description: 'Critical',
          details: {},
          detected_at: '2026-01-01T00:00:00Z',
        },
        {
          type: 'security-pr',
          severity: 'critical',
          repository: 'test/repo2',
          description: 'Critical',
          details: {},
          detected_at: '2026-01-01T00:00:00Z',
        },
      ];

      const recommendations = await analyzer.generateRecommendations(issues);

      expect(recommendations.some((r) => r.includes('URGENT'))).toBe(true);
      expect(recommendations.some((r) => r.includes('2 critical'))).toBe(true);
    });
  });

  describe('generateInsights', () => {
    it('should generate insights from analysis result', async () => {
      const analysisResult: AnalysisResult = {
        summary: 'Test summary',
        issues: [
          {
            type: 'self-merge',
            severity: 'medium',
            repository: 'test/repo',
            description: 'Self merge',
            details: {},
            detected_at: '2026-01-01T00:00:00Z',
          },
        ],
        recommendations: [],
        statistics: {
          total_repos: 10,
          total_prs: 50,
          self_merges: 5,
          security_prs: 3,
          repos_with_disabled_actions: 2,
          paused_workflows: 1,
          disabled_workflows: 1,
        },
      };

      const insights = await analyzer.generateInsights(analysisResult);

      expect(insights).toContain('Security Analysis');
      expect(typeof insights).toBe('string');
      expect(insights.length).toBeGreaterThan(0);
    });
  });
});
