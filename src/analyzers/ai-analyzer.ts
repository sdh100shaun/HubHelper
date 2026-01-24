import type { AnalysisResult, SecurityIssue } from '../types/index.js';

/**
 * AI-powered analyzer using GitHub Copilot SDK
 * This provides enhanced analysis and natural language insights
 */
export class AIAnalyzer {
  /**
   * Generate AI-powered insights from security issues
   */
  async generateInsights(analysisResult: AnalysisResult): Promise<string> {
    // Prepare context for AI analysis
    const context = this.prepareAnalysisContext(analysisResult);

    // For now, we'll generate structured insights based on patterns
    // In a full implementation, this would use the Copilot SDK to generate
    // more sophisticated AI-powered recommendations
    return this.generateStructuredInsights(analysisResult);
  }

  /**
   * Analyze patterns in security issues
   */
  async analyzePatterns(issues: SecurityIssue[]): Promise<{
    patterns: string[];
    trends: string[];
    risk_assessment: string;
  }> {
    const patterns: string[] = [];
    const trends: string[] = [];

    // Analyze self-merge patterns
    const selfMerges = issues.filter((i) => i.type === 'self-merge');
    if (selfMerges.length > 0) {
      const repos = new Set(selfMerges.map((i) => i.repository));
      patterns.push(`Self-merges detected across ${repos.size} repositories`);

      if (selfMerges.length > 5) {
        trends.push(
          'High frequency of self-merges indicates potential lack of code review culture'
        );
      }
    }

    // Analyze security PR patterns
    const securityPRs = issues.filter((i) => i.type === 'security-pr');
    if (securityPRs.length > 0) {
      const critical = securityPRs.filter((i) => i.severity === 'critical').length;
      patterns.push(`${securityPRs.length} security-related PRs identified`);

      if (critical > 0) {
        trends.push(`${critical} critical security issues require immediate attention`);
      }
    }

    // Analyze disabled actions
    const disabledActions = issues.filter((i) => i.type === 'disabled-actions');
    if (disabledActions.length > 0) {
      patterns.push(`${disabledActions.length} repositories have GitHub Actions disabled`);
      trends.push('Consider enabling Actions for automated security scanning and CI/CD');
    }

    // Risk assessment
    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const highCount = issues.filter((i) => i.severity === 'high').length;

    let risk_assessment = 'Low risk';
    if (criticalCount > 0) {
      risk_assessment = 'Critical risk - immediate action required';
    } else if (highCount > 3) {
      risk_assessment = 'High risk - attention needed';
    } else if (issues.length > 10) {
      risk_assessment = 'Medium risk - improvements recommended';
    }

    return { patterns, trends, risk_assessment };
  }

  /**
   * Generate recommendations based on detected issues
   */
  async generateRecommendations(issues: SecurityIssue[]): Promise<string[]> {
    const recommendations: string[] = [];
    const issueTypes = new Set(issues.map((i) => i.type));

    if (issueTypes.has('self-merge')) {
      recommendations.push(
        '🔒 Enable branch protection rules requiring at least one approving review',
        '👥 Consider implementing a CODEOWNERS file for automatic reviewer assignment',
        '📋 Establish team guidelines prohibiting self-merges for production code'
      );
    }

    if (issueTypes.has('unreviewed-security-pr')) {
      recommendations.push(
        '🛡️ Require mandatory security team review for security-related changes',
        '🔐 Implement CODEOWNERS for security-sensitive directories (.github/, security/, etc.)',
        '📊 Set up automated security scanning with CodeQL or similar tools'
      );
    }

    if (issueTypes.has('disabled-actions')) {
      recommendations.push(
        '⚙️ Enable GitHub Actions for automated CI/CD and security scanning',
        '🤖 Configure Dependabot for automated dependency updates',
        '🔍 Set up automated code quality and security checks'
      );
    }

    const criticalIssues = issues.filter((i) => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      recommendations.push(
        `⚠️ URGENT: Address ${criticalIssues.length} critical security issues immediately`,
        '📞 Consider engaging security team for incident response review'
      );
    }

    return recommendations;
  }

  private prepareAnalysisContext(analysisResult: AnalysisResult): string {
    return JSON.stringify(
      {
        summary: analysisResult.summary,
        statistics: analysisResult.statistics,
        issue_count_by_type: this.groupIssuesByType(analysisResult.issues),
        issue_count_by_severity: this.groupIssuesBySeverity(analysisResult.issues),
      },
      null,
      2
    );
  }

  private generateStructuredInsights(analysisResult: AnalysisResult): string {
    const { statistics, issues } = analysisResult;
    const insights: string[] = [];

    insights.push('=== Security Analysis Insights ===\n');

    // Overall health
    const issueRate = (issues.length / statistics.total_prs) * 100;
    insights.push(`📊 Issue Detection Rate: ${issueRate.toFixed(1)}% of PRs flagged`);

    // Self-merge analysis
    if (statistics.self_merges > 0) {
      const selfMergeRate = (statistics.self_merges / statistics.total_prs) * 100;
      insights.push(
        `⚠️ Self-Merge Rate: ${selfMergeRate.toFixed(1)}% (${statistics.self_merges}/${statistics.total_prs} PRs)`
      );
    }

    // Security PR analysis
    if (statistics.security_prs > 0) {
      insights.push(`🔒 Security PRs: ${statistics.security_prs} detected`);
    }

    // Actions status
    if (statistics.repos_with_disabled_actions > 0) {
      const disabledRate = (statistics.repos_with_disabled_actions / statistics.total_repos) * 100;
      insights.push(
        `⚙️ Actions Disabled: ${disabledRate.toFixed(1)}% of repos (${statistics.repos_with_disabled_actions}/${statistics.total_repos})`
      );
    }

    return insights.join('\n');
  }

  private groupIssuesByType(issues: SecurityIssue[]): Record<string, number> {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  private groupIssuesBySeverity(issues: SecurityIssue[]): Record<string, number> {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}
