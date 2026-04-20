/**
 * GitHub Copilot SDK Integration
 *
 * This service integrates with the GitHub Copilot SDK to provide
 * AI-powered analysis and recommendations for security issues.
 *
 * Note: The Copilot SDK is in technical preview and requires
 * GitHub Copilot CLI to be installed and authenticated.
 */

import type { AnalysisResult, SecurityIssue } from '../types/index.js';

export class CopilotService {
  private isAvailable = false;

  constructor() {
    // Check if Copilot SDK is available
    this.checkAvailability();
  }

  private async checkAvailability(): Promise<void> {
    try {
      // In a full implementation, this would initialize the Copilot SDK client
      // For now, we'll use structured analysis
      this.isAvailable = false;
    } catch (_error) {
      this.isAvailable = false;
    }
  }

  /**
   * Use Copilot AI to analyze security issues and provide insights
   */
  async analyzeWithAI(analysisResult: AnalysisResult): Promise<{
    insights: string;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    action_items: string[];
  }> {
    if (!this.isAvailable) {
      return this.fallbackAnalysis(analysisResult);
    }

    try {
      // In a full implementation with Copilot SDK:
      //
      // import { CopilotClient } from '@github/copilot-sdk';
      //
      // const client = new CopilotClient();
      // const session = await client.createSession();
      //
      // const prompt = `Analyze the following GitHub security findings and provide insights:
      //
      // ${JSON.stringify(analysisResult, null, 2)}
      //
      // Please provide:
      // 1. Key security risks
      // 2. Risk level (low/medium/high/critical)
      // 3. Actionable recommendations
      // 4. Patterns and trends`;
      //
      // const response = await session.send(prompt);
      // const aiAnalysis = response.message;
      //
      // await session.close();

      return this.fallbackAnalysis(analysisResult);
    } catch (error) {
      console.error('Error using Copilot AI:', error);
      return this.fallbackAnalysis(analysisResult);
    }
  }

  /**
   * Fallback analysis when Copilot SDK is not available
   */
  private fallbackAnalysis(analysisResult: AnalysisResult): {
    insights: string;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    action_items: string[];
  } {
    const { issues, statistics } = analysisResult;

    // Calculate risk level
    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const highCount = issues.filter((i) => i.severity === 'high').length;

    let risk_level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalCount > 0) {
      risk_level = 'critical';
    } else if (highCount > 3) {
      risk_level = 'high';
    } else if (issues.length > 10) {
      risk_level = 'medium';
    }

    // Generate insights
    const insights = this.generateInsights(analysisResult);

    // Generate action items
    const action_items = this.generateActionItems(issues, statistics);

    return { insights, risk_level, action_items };
  }

  private generateInsights(analysisResult: AnalysisResult): string {
    const { statistics, issues } = analysisResult;
    const insights: string[] = [];

    insights.push('Security Analysis Summary:\n');

    // Repository health
    const actionsDisabledRate =
      (statistics.repos_with_disabled_actions / statistics.total_repos) * 100;
    if (actionsDisabledRate > 20) {
      insights.push(
        `⚠️ ${actionsDisabledRate.toFixed(0)}% of repositories have Actions disabled, limiting automated security scanning capabilities.`
      );
    }

    // Self-merge analysis
    if (statistics.self_merges > 0) {
      const selfMergeRate = (statistics.self_merges / statistics.total_prs) * 100;
      insights.push(
        `🔀 ${selfMergeRate.toFixed(1)}% of PRs were self-merged, indicating potential gaps in code review processes.`
      );

      const securitySelfMerges = issues.filter((i) => i.type === 'unreviewed-security-pr').length;

      if (securitySelfMerges > 0) {
        insights.push(
          `🚨 ${securitySelfMerges} security-related PRs were merged without external review - this is a critical security risk!`
        );
      }
    }

    // Security PR trends
    if (statistics.security_prs > 0) {
      insights.push(
        `🔒 ${statistics.security_prs} security-related PRs identified, suggesting active dependency management.`
      );
    }

    // Pattern detection
    const reposWithIssues = new Set(issues.map((i) => i.repository));
    const issueConcentration = (reposWithIssues.size / statistics.total_repos) * 100;

    insights.push(
      `\n📊 Issues are concentrated in ${reposWithIssues.size} repositories ` +
        `(${issueConcentration.toFixed(0)}% of total).`
    );

    return insights.join('\n');
  }

  private generateActionItems(
    issues: SecurityIssue[],
    statistics: { [key: string]: number }
  ): string[] {
    const actions: string[] = [];

    // Critical actions
    const criticalIssues = issues.filter((i) => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      actions.push(
        `[URGENT] Review and address ${criticalIssues.length} critical security issues immediately`
      );

      const unreviewedSecurity = issues.filter((i) => i.type === 'unreviewed-security-pr');
      if (unreviewedSecurity.length > 0) {
        actions.push(
          '[URGENT] Implement mandatory review requirements for security-related changes'
        );
      }
    }

    // Self-merge actions
    if (statistics.self_merges > 0) {
      actions.push('Enable branch protection rules requiring at least one approving review');
    }

    // Actions disabled
    if (statistics.repos_with_disabled_actions > 0) {
      actions.push(
        `Enable GitHub Actions on ${statistics.repos_with_disabled_actions} repositories for automated security scanning`
      );
    }

    // General security hardening
    actions.push(
      'Consider implementing CODEOWNERS for critical paths',
      'Set up automated security scanning with CodeQL or Snyk',
      'Enable Dependabot for automated dependency updates'
    );

    return actions;
  }

  /**
   * Generate natural language description of a security issue
   */
  async explainIssue(issue: SecurityIssue): Promise<string> {
    const explanations: Record<SecurityIssue['type'], (i: SecurityIssue) => string> = {
      'self-merge': (i) =>
        `This PR was merged by ${i.details.author} who was also the author. Self-merges bypass the code review process and can introduce security vulnerabilities. ${i.severity === 'high' ? 'This is particularly concerning as it involves security-related changes.' : ''}`,

      'security-pr': (i) =>
        `This PR contains security-related changes (${i.details.title}). Security changes require careful review to ensure they don't introduce new vulnerabilities. ${i.details.was_self_merged ? 'Additionally, this PR was self-merged without external review.' : ''}`,

      'disabled-actions': (i) =>
        `GitHub Actions is disabled on ${i.details.repo_name}. This prevents automated security scanning, testing, and CI/CD workflows that help catch issues early.`,

      'paused-workflow': (i) =>
        `The workflow "${i.details.workflow_name}" has been automatically paused due to repository inactivity. ${i.details.reason || 'GitHub disables scheduled workflows after 60 days of no repository activity.'}`,

      'disabled-workflow': (i) =>
        `The workflow "${i.details.workflow_name}" has been manually disabled. Consider re-enabling if this workflow is still needed for automated testing or deployment.`,

      'unreviewed-security-pr': (i) =>
        `Critical: This security-related PR (${i.details.title}) was merged by its author without external review. Security changes should always be reviewed by security-knowledgeable team members to prevent introducing vulnerabilities.`,
    };

    const explanation = explanations[issue.type]?.(issue) || issue.description;
    return explanation;
  }
}
