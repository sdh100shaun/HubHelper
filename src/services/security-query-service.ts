/**
 * Security Query Service — natural language queries via GitHub Copilot SDK.
 *
 * Uses the native Copilot CLI (no separate API key required).
 * Analysis data is exposed as custom tools so the AI can fetch exactly what
 * it needs.  When a GitHub token is provided, the GitHub MCP remote server is
 * also connected so the AI can answer questions about live repository state.
 */

import { CopilotClient, approveAll, defineTool } from '@github/copilot-sdk';
import type { MCPHTTPServerConfig } from '@github/copilot-sdk';
import type { AnalysisResult, SecurityIssue } from '../types/index.js';
import { SESSION_IDLE_TIMEOUT_SECONDS } from './copilot-client-config.js';

export interface QueryResult {
  answer: string;
  relatedIssues?: SecurityIssue[];
  recommendations?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

export class SecurityQueryService {
  private client: CopilotClient | null = null;
  private isDisposed = false;

  private readonly QUERY_TIMEOUT_MS = 30_000;

  // Rate limiting
  private lastQueryTime = 0;
  private queryHistory: number[] = [];
  private readonly MIN_QUERY_INTERVAL_MS = 1_000;
  private readonly MAX_QUERIES_PER_HOUR = 60;

  // Cached analysis for follow-up questions
  private cachedAnalysis?: AnalysisResult;

  constructor(
    private readonly githubToken?: string,
    private readonly model = 'claude-sonnet-4-5'
  ) {}

  private async ensureClient(): Promise<CopilotClient> {
    if (this.client) return this.client;
    this.client = new CopilotClient({
      sessionIdleTimeoutSeconds: SESSION_IDLE_TIMEOUT_SECONDS,
    });
    await this.client.start();
    return this.client;
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();

    const timeSinceLastQuery = now - this.lastQueryTime;
    if (timeSinceLastQuery < this.MIN_QUERY_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.MIN_QUERY_INTERVAL_MS - timeSinceLastQuery)
      );
    }

    const oneHourAgo = now - 3_600_000;
    this.queryHistory = this.queryHistory.filter((t) => t > oneHourAgo);

    if (this.queryHistory.length >= this.MAX_QUERIES_PER_HOUR) {
      const oldestQuery = this.queryHistory[0];
      const waitMinutes = Math.ceil((oldestQuery + 3_600_000 - now) / 60_000);
      throw new Error(
        `Rate limit: max ${this.MAX_QUERIES_PER_HOUR} queries/hour. Wait ${waitMinutes} min.`
      );
    }

    this.queryHistory.push(now);
    this.lastQueryTime = now;
  }

  /**
   * Query security analysis using natural language.
   */
  async query(question: string, analysisData: AnalysisResult): Promise<QueryResult> {
    if (this.isDisposed) {
      throw new Error('Service disposed — create a new instance.');
    }

    await this.checkRateLimit();
    this.cachedAnalysis = analysisData;

    const client = await this.ensureClient();

    // Build analysis-specific tools so the AI can fetch data on demand
    const tools = this.buildAnalysisTools(analysisData);

    // Configure GitHub MCP server when a token is available
    const mcpServers: Record<string, MCPHTTPServerConfig> | undefined =
      this.githubToken != null
        ? {
            github: {
              type: 'http',
              url: 'https://api.githubcopilot.com/mcp/',
              headers: { Authorization: `Bearer ${this.githubToken}` },
              tools: ['*'],
            },
          }
        : undefined;

    const session = await client.createSession({
      model: this.model,
      tools,
      onPermissionRequest: approveAll,
      ...(mcpServers ? { mcpServers } : {}),
      systemMessage: {
        mode: 'append',
        content: this.buildSystemPrompt(analysisData),
      },
    });

    try {
      let timeoutHandle!: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('Query timeout: no response after 30 s')),
          this.QUERY_TIMEOUT_MS
        );
      });

      const response = await Promise.race([
        session.sendAndWait({ prompt: question }),
        timeoutPromise,
      ]);

      clearTimeout(timeoutHandle);

      if (!response) {
        throw new Error('No response received');
      }

      return this.parseResponse(response.data.content, analysisData, question);
    } catch (error) {
      throw new Error(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await session.destroy().catch(() => {});
    }
  }

  /**
   * Follow-up question using the last cached analysis.
   */
  async followUp(question: string): Promise<QueryResult> {
    if (!this.cachedAnalysis) {
      throw new Error('No previous analysis cached. Run a query first.');
    }
    return this.query(question, this.cachedAnalysis);
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.cachedAnalysis = undefined;
    if (this.client) {
      await this.client.stop().catch(() => {});
      this.client = null;
    }
  }

  // ── Tool builders ──────────────────────────────────────────────────────────

  private buildAnalysisTools(analysis: AnalysisResult) {
    return [
      defineTool('get_security_summary', {
        description: 'Returns the overall security statistics for the GitHub organization.',
        handler: () => JSON.stringify(analysis.statistics, null, 2),
      }),

      defineTool('get_issues_by_severity', {
        description: 'Returns security issues filtered to a specific severity level.',
        parameters: {
          type: 'object',
          properties: {
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              description: 'Severity level to filter by.',
            },
          },
          required: ['severity'],
        },
        handler: (args: unknown) => {
          const { severity } = args as { severity: string };
          const filtered = analysis.issues.filter((i) => i.severity === severity);
          return JSON.stringify(filtered, null, 2);
        },
      }),

      defineTool('get_issues_by_type', {
        description: 'Returns security issues of a specific type.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'self-merge',
                'security-pr',
                'disabled-actions',
                'unreviewed-security-pr',
                'paused-workflow',
                'disabled-workflow',
                'action_failure',
                'repeated_action_failure',
                'security-pr-volume',
              ],
              description: 'Issue type to filter by.',
            },
          },
          required: ['type'],
        },
        handler: (args: unknown) => {
          const { type } = args as { type: string };
          const filtered = analysis.issues.filter((i) => i.type === type);
          return JSON.stringify(filtered, null, 2);
        },
      }),

      defineTool('get_issues_by_repository', {
        description: 'Returns all security issues found in a specific repository.',
        parameters: {
          type: 'object',
          properties: {
            repository: {
              type: 'string',
              description: 'Repository name (full name like "owner/repo" or partial).',
            },
          },
          required: ['repository'],
        },
        handler: (args: unknown) => {
          const { repository } = args as { repository: string };
          const filtered = analysis.issues.filter((i) =>
            i.repository.toLowerCase().includes(repository.toLowerCase())
          );
          return JSON.stringify(filtered, null, 2);
        },
      }),

      defineTool('get_top_repositories', {
        description: 'Returns repositories ranked by number of security issues.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of repositories to return (default 10).',
            },
          },
        },
        handler: (args: unknown) => {
          const { limit = 10 } = (args as { limit?: number }) ?? {};
          const counts = analysis.issues.reduce<
            Record<string, { count: number; severities: Record<string, number> }>
          >((acc, issue) => {
            if (!acc[issue.repository]) {
              acc[issue.repository] = { count: 0, severities: {} };
            }
            acc[issue.repository].count++;
            acc[issue.repository].severities[issue.severity] =
              (acc[issue.repository].severities[issue.severity] ?? 0) + 1;
            return acc;
          }, {});
          const ranked = Object.entries(counts)
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, limit)
            .map(([repository, data]) => ({ repository, ...data }));
          return JSON.stringify(ranked, null, 2);
        },
      }),

      defineTool('get_recommendations', {
        description: 'Returns the AI-generated recommendations from the security analysis.',
        handler: () => JSON.stringify(analysis.recommendations, null, 2),
      }),
    ];
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildSystemPrompt(analysis: AnalysisResult): string {
    const stats = analysis.statistics;
    return `You are a GitHub security analyst assistant integrated with GitHub Copilot.

You have access to a pre-run security analysis of a GitHub organization:
- ${stats.total_repos} repositories scanned
- ${stats.total_prs} pull requests reviewed
- ${analysis.issues.length} issues found (${analysis.issues.filter((i) => i.severity === 'critical').length} critical, ${analysis.issues.filter((i) => i.severity === 'high').length} high)

Use the provided tools (get_security_summary, get_issues_by_severity, get_issues_by_type, get_issues_by_repository, get_top_repositories, get_recommendations) to look up specific data before answering.
${this.githubToken ? 'You also have access to the GitHub MCP server for live repository queries — including its search_code tool for finding code patterns across all repositories. When asked about code, use search_code (scoped with `org:<orgname>`) to locate matches and explain each snippet you return.' : ''}

When answering:
- Be concise and actionable
- Cite specific repositories and PR numbers when relevant
- Prioritise by severity (critical > high > medium > low)
- Suggest concrete remediation steps`;
  }

  private parseResponse(
    content: string,
    analysisData: AnalysisResult,
    question: string
  ): QueryResult {
    const confidence = this.assessConfidence(content);
    const relatedIssues = this.findRelatedIssues(question, analysisData.issues);
    const recommendations = this.extractRecommendations(content);
    return { answer: content, relatedIssues, recommendations, confidence };
  }

  private findRelatedIssues(question: string, issues: SecurityIssue[]): SecurityIssue[] {
    const q = question.toLowerCase();
    const related: SecurityIssue[] = [];

    if (q.includes('critical')) related.push(...issues.filter((i) => i.severity === 'critical'));
    else if (q.includes('high')) related.push(...issues.filter((i) => i.severity === 'high'));

    if (q.includes('self-merge') || q.includes('self merge'))
      related.push(...issues.filter((i) => i.type === 'self-merge'));
    if (q.includes('unreviewed'))
      related.push(...issues.filter((i) => i.type === 'unreviewed-security-pr'));
    if (q.includes('actions') || q.includes('workflow'))
      related.push(...issues.filter((i) => i.type === 'disabled-actions'));

    return Array.from(new Set(related)).slice(0, 10);
  }

  private extractRecommendations(answer: string): string[] | undefined {
    const recs: string[] = [];
    let capturing = false;
    for (const line of answer.split('\n')) {
      const t = line.trim();
      if (/^(recommend|action|next step|should|fix)/i.test(t) || /^\d+\./.test(t)) {
        capturing = true;
      }
      if (capturing && (t.match(/^[-•*]/) || t.match(/^\d+\./))) {
        const cleaned = t.replace(/^[-•*\d.]\s*/, '').trim();
        if (cleaned.length > 10) recs.push(cleaned);
      }
    }
    return recs.length > 0 ? recs : undefined;
  }

  private assessConfidence(answer: string): 'high' | 'medium' | 'low' {
    if (/\d+ (repositories|PRs|issues)/i.test(answer)) return 'high';
    if (/(might|possibly|unclear|not sure)/i.test(answer)) return 'low';
    return 'medium';
  }
}
