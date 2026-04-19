/**
 * Security Query Service using GitHub Copilot SDK with Anthropic Claude
 *
 * Provides natural language query interface for security analysis using
 * the GitHub Copilot SDK configured with Anthropic Claude models.
 */

import { CopilotClient } from '@github/copilot-sdk';
import type { AnalysisResult, SecurityIssue } from '../types/index.js';

export interface QueryResult {
  answer: string;
  relatedIssues?: SecurityIssue[];
  recommendations?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

export class SecurityQueryService {
  private client: CopilotClient;
  private model = 'claude-sonnet-4-20250514';
  private cachedContext?: string;
  private cachedAnalysis?: AnalysisResult;
  private anthropicKey: string;
  private readonly QUERY_TIMEOUT_MS = 30000; // 30 seconds
  private isDisposed = false;

  // Rate limiting
  private lastQueryTime = 0;
  private queryHistory: number[] = [];
  private readonly MIN_QUERY_INTERVAL_MS = 1000; // 1 second
  private readonly MAX_QUERIES_PER_HOUR = 60;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'Anthropic API key required. Set ANTHROPIC_API_KEY environment variable or pass as parameter.'
      );
    }
    this.anthropicKey = key;
    this.client = new CopilotClient({ autoStart: false });

    // Clear from environment after reading to prevent leaks
    if (!apiKey && process.env.ANTHROPIC_API_KEY) {
      delete process.env.ANTHROPIC_API_KEY;
    }
  }

  /**
   * Ensure client is started
   */
  private async ensureStarted(): Promise<void> {
    if (this.client.getState() !== 'connected') {
      await this.client.start();
    }
  }

  /**
   * Check and enforce rate limits
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();

    // Enforce minimum interval between queries
    const timeSinceLastQuery = now - this.lastQueryTime;
    if (timeSinceLastQuery < this.MIN_QUERY_INTERVAL_MS) {
      const waitTime = this.MIN_QUERY_INTERVAL_MS - timeSinceLastQuery;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Clean up old query timestamps (older than 1 hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    this.queryHistory = this.queryHistory.filter((t) => t > oneHourAgo);

    // Check hourly limit
    if (this.queryHistory.length >= this.MAX_QUERIES_PER_HOUR) {
      const oldestQuery = this.queryHistory[0];
      const waitMinutes = Math.ceil((oldestQuery + 3600000 - now) / 60000);
      throw new Error(
        `Rate limit exceeded: Maximum ${this.MAX_QUERIES_PER_HOUR} queries per hour. ` +
          `Please wait ${waitMinutes} minute(s) before trying again.`
      );
    }

    // Record this query
    this.queryHistory.push(now);
    this.lastQueryTime = now;
  }

  /**
   * Query the security analysis using natural language
   */
  async query(question: string, analysisData: AnalysisResult): Promise<QueryResult> {
    if (this.isDisposed) {
      throw new Error('Service has been disposed. Create a new instance.');
    }

    // Check rate limit before processing
    await this.checkRateLimit();

    try {
      // Prepare context for Claude
      const context = this.prepareContext(analysisData);

      // Cache analysis for follow-up questions
      this.cachedAnalysis = analysisData;
      this.cachedContext = context;

      // Ensure client is started
      await this.ensureStarted();

      // Create session with Anthropic provider and Claude model
      const session = await this.client.createSession({
        model: this.model,
        provider: {
          type: 'anthropic',
          baseUrl: 'https://api.anthropic.com',
          apiKey: this.anthropicKey,
        },
        systemMessage: {
          mode: 'replace',
          content: `${this.getSystemPrompt()}\n\n${context}`,
        },
        // biome-ignore lint/suspicious/noExplicitAny: SDK types not fully defined
        onPermissionRequest: async (request: any) => {
          // Log permission request for audit
          const toolName = String(request.toolName || request.tool || 'unknown');
          console.warn(`[Security] Permission requested: ${toolName}`);

          // Whitelist of safe read-only operations
          const safeTools = [
            'read_file',
            'list_directory',
            'search_files',
            'get_file_info',
          ];

          if (safeTools.includes(toolName)) {
            return { kind: 'approved' as const };
          }

          // Deny write operations and other unsafe tools
          console.warn(`[Security] Denied tool: ${toolName}`);
          return {
            kind: 'denied-by-rules' as const,
            rules: [`Tool '${toolName}' not allowed in query mode (read-only operations only)`],
          };
        },
      });

      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Query timeout: No response after 30 seconds')),
            this.QUERY_TIMEOUT_MS
          );
        });

        // Send question and wait for response with timeout
        const response = await Promise.race([
          session.sendAndWait({ prompt: question }),
          timeoutPromise,
        ]);

        if (!response) {
          throw new Error('No response received from Claude');
        }

        // Parse and return result
        return this.parseResponse(response.data.content, analysisData, question);
      } finally {
        // Clean up session
        await session.disconnect();
      }
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
   * Clear cached context and stop client
   */
  async clearCache(): Promise<void> {
    this.cachedContext = undefined;
    this.cachedAnalysis = undefined;
    if (this.client.getState() === 'connected') {
      await this.client.stop();
    }
  }

  /**
   * Securely dispose of service and clear sensitive data
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    // Overwrite API key in memory before clearing
    if (this.anthropicKey) {
      // Overwrite with zeros
      this.anthropicKey = '0'.repeat(this.anthropicKey.length);
      // Clear reference
      this.anthropicKey = '';
    }

    // Clear cached data
    await this.clearCache();

    this.isDisposed = true;
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
    content: string,
    analysisData: AnalysisResult,
    question: string
  ): QueryResult {
    const answer = content;

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
