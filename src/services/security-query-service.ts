/**
 * Security Query Service using GitHub Copilot SDK with Anthropic Claude
 *
 * Provides natural language query interface for security analysis using
 * the GitHub Copilot SDK configured with Anthropic Claude models.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult, SecurityIssue } from '../types/index.js';

export interface QueryResult {
  answer: string;
  relatedIssues?: SecurityIssue[];
  recommendations?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

export class SecurityQueryService {
  private anthropic: Anthropic;
  private model = 'claude-sonnet-4-20250514';
  private cachedContext?: string;
  private cachedAnalysis?: AnalysisResult;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'Anthropic API key required. Set ANTHROPIC_API_KEY environment variable or pass as parameter.'
      );
    }
    this.anthropic = new Anthropic({ apiKey: key });
  }

  /**
   * Query the security analysis using natural language
   */
  async query(question: string, analysisData: AnalysisResult): Promise<QueryResult> {
    try {
      // Prepare context for Claude
      const context = this.prepareContext(analysisData);

      // Cache analysis for follow-up questions
      this.cachedAnalysis = analysisData;
      this.cachedContext = context;

      // Use Claude via Anthropic SDK (integrated with Copilot workflow)
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: this.getSystemPrompt(),
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: context,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: question,
          },
        ],
      });

      return this.parseResponse(response, analysisData, question);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Query failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Ask a follow-up question using cached context
   */
  async followUp(question: string): Promise<QueryResult> {
    if (!this.cachedAnalysis || !this.cachedContext) {
      throw new Error('No previous analysis cached. Run a query first.');
    }
    return this.query(question, this.cachedAnalysis);
  }

  /**
   * Clear cached context
   */
  clearCache(): void {
    this.cachedContext = undefined;
    this.cachedAnalysis = undefined;
  }

  /**
   * Prepare analysis context for Claude
   */
  private prepareContext(analysis: AnalysisResult): string {
    const context = {
      organization_summary: {
        total_repositories: analysis.statistics.total_repos,
        total_pull_requests: analysis.statistics.total_prs,
        self_merges: analysis.statistics.self_merges,
        security_prs: analysis.statistics.security_prs,
        repos_with_disabled_actions: analysis.statistics.repos_with_disabled_actions,
        paused_workflows: analysis.statistics.paused_workflows,
        disabled_workflows: analysis.statistics.disabled_workflows,
      },
      issues_by_severity: {
        critical: analysis.issues.filter((i) => i.severity === 'critical').length,
        high: analysis.issues.filter((i) => i.severity === 'high').length,
        medium: analysis.issues.filter((i) => i.severity === 'medium').length,
        low: analysis.issues.filter((i) => i.severity === 'low').length,
      },
      issues_by_type: this.groupIssuesByType(analysis.issues),
      repositories_with_issues: this.getRepositoriesWithIssues(analysis.issues),
      recent_security_issues: analysis.issues
        .filter((i) => i.severity === 'critical' || i.severity === 'high')
        .slice(0, 10)
        .map((i) => ({
          type: i.type,
          severity: i.severity,
          repository: i.repository,
          description: i.description,
          detected_at: i.detected_at,
        })),
    };

    return `GitHub Security Analysis Data:\n\n${JSON.stringify(context, null, 2)}`;
  }

  /**
   * System prompt for Claude
   */
  private getSystemPrompt(): string {
    return `You are a GitHub security analyst assistant integrated with GitHub Copilot. Your role is to help developers understand and improve their organization's security posture.

You have access to comprehensive security analysis data including:
- Repository configuration issues
- Pull request review patterns
- Self-merge incidents
- Security-related changes
- Workflow status
- GitHub Actions configuration

When answering questions:
1. Be concise and actionable
2. Prioritize by severity (critical > high > medium > low)
3. Provide specific repository names and PR numbers when relevant
4. Suggest concrete remediation steps
5. Use emojis sparingly for visual hierarchy (🚨 critical, ⚠️ high, ℹ️ info)
6. Format lists clearly with bullet points
7. Be honest about limitations in the data

If asked about something not in the analysis data, clearly state that and suggest what command could provide that information.`;
  }

  /**
   * Parse Claude's response and extract structured data
   */
  private parseResponse(
    response: Anthropic.Message,
    analysisData: AnalysisResult,
    question: string
  ): QueryResult {
    // Extract text from Claude's response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const answer = content.text;

    // Determine confidence based on response characteristics
    const confidence = this.assessConfidence(answer);

    // Extract related issues based on question context
    const relatedIssues = this.findRelatedIssues(question, analysisData.issues);

    // Extract recommendations if present
    const recommendations = this.extractRecommendations(answer);

    return {
      answer,
      relatedIssues,
      recommendations,
      confidence,
    };
  }

  /**
   * Group issues by type
   */
  private groupIssuesByType(issues: SecurityIssue[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const issue of issues) {
      grouped[issue.type] = (grouped[issue.type] || 0) + 1;
    }
    return grouped;
  }

  /**
   * Get unique repositories with issues
   */
  private getRepositoriesWithIssues(issues: SecurityIssue[]): {
    repository: string;
    issue_count: number;
    severity_breakdown: Record<string, number>;
  }[] {
    const repoMap = new Map<
      string,
      { issue_count: number; severity_breakdown: Record<string, number> }
    >();

    for (const issue of issues) {
      const existing = repoMap.get(issue.repository) || {
        issue_count: 0,
        severity_breakdown: {},
      };
      existing.issue_count++;
      existing.severity_breakdown[issue.severity] =
        (existing.severity_breakdown[issue.severity] || 0) + 1;
      repoMap.set(issue.repository, existing);
    }

    return Array.from(repoMap.entries())
      .map(([repository, data]) => ({
        repository,
        ...data,
      }))
      .sort((a, b) => b.issue_count - a.issue_count)
      .slice(0, 10); // Top 10 repos
  }

  /**
   * Find issues related to the question
   */
  private findRelatedIssues(question: string, issues: SecurityIssue[]): SecurityIssue[] {
    const lowerQuestion = question.toLowerCase();
    const related: SecurityIssue[] = [];

    // Check for severity mentions
    if (lowerQuestion.includes('critical')) {
      related.push(...issues.filter((i) => i.severity === 'critical'));
    } else if (lowerQuestion.includes('high')) {
      related.push(...issues.filter((i) => i.severity === 'high'));
    }

    // Check for type mentions
    if (lowerQuestion.includes('self-merge') || lowerQuestion.includes('self merge')) {
      related.push(...issues.filter((i) => i.type === 'self-merge'));
    }
    if (lowerQuestion.includes('security pr') || lowerQuestion.includes('security-pr')) {
      related.push(...issues.filter((i) => i.type === 'security-pr'));
    }
    if (lowerQuestion.includes('unreviewed')) {
      related.push(...issues.filter((i) => i.type === 'unreviewed-security-pr'));
    }
    if (lowerQuestion.includes('actions') || lowerQuestion.includes('workflow')) {
      related.push(...issues.filter((i) => i.type === 'disabled-actions'));
    }

    // Check for repository mentions
    const repoMatch = lowerQuestion.match(/[a-z0-9-]+\/[a-z0-9-]+/i);
    if (repoMatch) {
      related.push(...issues.filter((i) => i.repository.includes(repoMatch[0])));
    }

    // Remove duplicates and limit
    return Array.from(new Set(related)).slice(0, 10);
  }

  /**
   * Extract recommendations from Claude's response
   */
  private extractRecommendations(answer: string): string[] | undefined {
    const recommendations: string[] = [];

    // Look for common recommendation patterns
    const lines = answer.split('\n');
    let inRecommendations = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if we're entering a recommendations section
      if (/^(recommend|action|next step|should|fix)/i.test(trimmed) || trimmed.match(/^\d+\./)) {
        inRecommendations = true;
      }

      // Extract bullet points or numbered items
      if (inRecommendations && (trimmed.match(/^[-•*]/) || trimmed.match(/^\d+\./))) {
        const cleaned = trimmed.replace(/^[-•*\d.]\s*/, '').trim();
        if (cleaned.length > 10) {
          recommendations.push(cleaned);
        }
      }
    }

    return recommendations.length > 0 ? recommendations : undefined;
  }

  /**
   * Assess confidence in the response
   */
  private assessConfidence(answer: string): 'high' | 'medium' | 'low' {
    // High confidence if answer contains specific details
    if (answer.match(/\d+ (repositories|PRs|issues)/i)) {
      return 'high';
    }

    // Medium confidence for general recommendations
    if (answer.match(/(recommend|should|consider)/i)) {
      return 'medium';
    }

    // Low confidence for uncertain responses
    if (answer.match(/(might|possibly|unclear|not sure)/i)) {
      return 'low';
    }

    return 'medium';
  }
}
