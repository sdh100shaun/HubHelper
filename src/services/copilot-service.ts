import { type AssistantMessageEvent, approveAll, CopilotClient } from '@github/copilot-sdk';
import type { AnalysisResult, CodeSearchResult, SecurityIssue } from '../types/index.js';
import { SESSION_IDLE_TIMEOUT_SECONDS } from './copilot-client-config.js';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AIOutput {
  insights: string;
  risk_level: RiskLevel;
  action_items: string[];
}

const RISK_LEVELS = new Set<RiskLevel>(['low', 'medium', 'high', 'critical']);

function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && RISK_LEVELS.has(value as RiskLevel);
}

function parseAIResponse(content: string): AIOutput | null {
  // Strip markdown fences if the model wraps output in ```json ... ```
  const stripped = content.replace(/```(?:json)?\n?/g, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const risk_level = isRiskLevel(obj.risk_level) ? obj.risk_level : 'low';
    const insights = typeof obj.insights === 'string' ? obj.insights : '';
    const action_items = Array.isArray(obj.action_items)
      ? obj.action_items.filter((i): i is string => typeof i === 'string')
      : [];

    return { insights, risk_level, action_items };
  } catch {
    return null;
  }
}

function buildAnalysisPrompt(result: AnalysisResult): string {
  const summary = {
    statistics: result.statistics,
    issue_count_by_type: result.issues.reduce<Record<string, number>>((acc, i) => {
      acc[i.type] = (acc[i.type] ?? 0) + 1;
      return acc;
    }, {}),
    issue_count_by_severity: result.issues.reduce<Record<string, number>>((acc, i) => {
      acc[i.severity] = (acc[i.severity] ?? 0) + 1;
      return acc;
    }, {}),
    sample_issues: result.issues.slice(0, 5),
  };

  return `You are a GitHub security analyst. Analyze the following security findings for a GitHub organization.
Respond with ONLY valid JSON — no markdown fences, no extra text.

${JSON.stringify(summary, null, 2)}

Respond with exactly this structure:
{
  "risk_level": "critical" | "high" | "medium" | "low",
  "insights": "2-4 sentence summary of the key security concerns and patterns observed",
  "action_items": ["highest priority action", "second action", "...up to 6 items total"]
}`;
}

export class CopilotService {
  private client: CopilotClient | null = null;
  private initPromise: Promise<boolean> | null = null;

  constructor(private readonly model = 'claude-sonnet-4-5') {}

  private async init(): Promise<boolean> {
    try {
      this.client = new CopilotClient({
        sessionIdleTimeoutSeconds: SESSION_IDLE_TIMEOUT_SECONDS,
      });
      await this.client.start();
      return true;
    } catch {
      this.client = null;
      return false;
    }
  }

  private ensureClient(): Promise<boolean> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  async analyzeWithAI(analysisResult: AnalysisResult): Promise<AIOutput> {
    const available = await this.ensureClient();
    if (!available || !this.client) {
      return this.fallbackAnalysis(analysisResult);
    }

    const session = await this.client.createSession({
      model: this.model,
      onPermissionRequest: approveAll,
    });
    try {
      const event: AssistantMessageEvent | undefined = await session.sendAndWait({
        prompt: buildAnalysisPrompt(analysisResult),
      });

      if (!event) return this.fallbackAnalysis(analysisResult);

      const parsed = parseAIResponse(event.data.content);
      return parsed ?? this.fallbackAnalysis(analysisResult);
    } catch {
      return this.fallbackAnalysis(analysisResult);
    } finally {
      await session.disconnect().catch(() => {});
    }
  }

  async explainIssue(issue: SecurityIssue): Promise<string> {
    const available = await this.ensureClient();
    if (!available || !this.client) {
      return this.fallbackExplain(issue);
    }

    const session = await this.client.createSession({
      model: this.model,
      onPermissionRequest: approveAll,
    });
    try {
      const prompt = `Explain this GitHub security issue in 2-3 sentences for a developer. Be specific and actionable.\n\n${JSON.stringify(issue, null, 2)}`;
      const event: AssistantMessageEvent | undefined = await session.sendAndWait({ prompt });
      return event?.data.content ?? this.fallbackExplain(issue);
    } catch {
      return this.fallbackExplain(issue);
    } finally {
      await session.disconnect().catch(() => {});
    }
  }

  async explainCode(result: CodeSearchResult): Promise<string> {
    const available = await this.ensureClient();
    if (!available || !this.client) {
      return this.fallbackExplainCode(result);
    }

    const session = await this.client.createSession({
      model: this.model,
      onPermissionRequest: approveAll,
    });
    try {
      // Build a code fence that is always longer than any backtick sequence in
      // the snippet (CommonMark §4.5) to prevent fence breakout / prompt injection.
      const snippetSection = (() => {
        if (!result.snippet) {
          return `(no snippet available — see full file at ${result.url})`;
        }
        const runs = [...result.snippet.matchAll(/`+/g)].map((m) => m[0].length);
        const fence = '`'.repeat(Math.max(3, runs.length > 0 ? Math.max(...runs) + 1 : 3));
        return `${fence}\n${result.snippet}\n${fence}`;
      })();
      const prompt = `Explain the following code snippet found in ${result.repository} at ${result.path}.
Describe what it does, its likely purpose, and flag any security implications. Be concise (3-5 sentences).

${snippetSection}`;
      const event: AssistantMessageEvent | undefined = await session.sendAndWait({ prompt });
      return event?.data.content ?? this.fallbackExplainCode(result);
    } catch {
      return this.fallbackExplainCode(result);
    } finally {
      await session.disconnect().catch(() => {});
    }
  }

  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.stop().catch(() => {});
      this.client = null;
    }
    // Always reset initPromise so the next ensureClient() call retries init
    // rather than returning a cached rejected/stale promise.
    this.initPromise = null;
  }

  private fallbackExplainCode(result: CodeSearchResult): string {
    return `Code found in ${result.repository} at ${result.path}. Review the file at ${result.url} for full context.`;
  }

  // ── Fallback analysis (no SDK required) ──────────────────────────────────

  private fallbackAnalysis(analysisResult: AnalysisResult): AIOutput {
    const { issues, statistics } = analysisResult;

    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const highCount = issues.filter((i) => i.severity === 'high').length;

    let risk_level: RiskLevel = 'low';
    if (criticalCount > 0) risk_level = 'critical';
    else if (highCount > 3) risk_level = 'high';
    else if (issues.length > 10) risk_level = 'medium';

    return {
      insights: this.buildFallbackInsights(analysisResult),
      risk_level,
      action_items: this.buildFallbackActions(issues, statistics),
    };
  }

  private buildFallbackInsights(analysisResult: AnalysisResult): string {
    const { statistics, issues } = analysisResult;
    const lines: string[] = ['Security Analysis Summary:\n'];

    const disabledRate = (statistics.repos_with_disabled_actions / statistics.total_repos) * 100;
    if (disabledRate > 20) {
      lines.push(
        `⚠️ ${disabledRate.toFixed(0)}% of repositories have Actions disabled, limiting automated security scanning.`
      );
    }

    if (statistics.self_merges > 0) {
      const rate = (statistics.self_merges / statistics.total_prs) * 100;
      lines.push(
        `🔀 ${rate.toFixed(1)}% of PRs were self-merged, indicating potential gaps in code review processes.`
      );
      const unreviewed = issues.filter((i) => i.type === 'unreviewed-security-pr').length;
      if (unreviewed > 0) {
        lines.push(
          `🚨 ${unreviewed} security-related PRs were merged without external review - this is a critical security risk!`
        );
      }
    }

    if (statistics.security_prs > 0) {
      lines.push(`🔒 ${statistics.security_prs} security-related PRs identified.`);
    }

    const reposWithIssues = new Set(issues.map((i) => i.repository));
    lines.push(
      `\n📊 Issues concentrated in ${reposWithIssues.size} of ${statistics.total_repos} repositories.`
    );

    return lines.join('\n');
  }

  private buildFallbackActions(
    issues: SecurityIssue[],
    statistics: Record<string, number>
  ): string[] {
    const actions: string[] = [];

    const criticalIssues = issues.filter((i) => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      actions.push(
        `[URGENT] Review and address ${criticalIssues.length} critical security issues immediately`
      );
      if (issues.some((i) => i.type === 'unreviewed-security-pr')) {
        actions.push(
          '[URGENT] Implement mandatory review requirements for security-related changes'
        );
      }
    }

    if (statistics.self_merges > 0) {
      actions.push('Enable branch protection rules requiring at least one approving review');
    }

    if (statistics.repos_with_disabled_actions > 0) {
      actions.push(
        `Enable GitHub Actions on ${statistics.repos_with_disabled_actions} repositories for automated security scanning`
      );
    }

    actions.push(
      'Consider implementing CODEOWNERS for critical paths',
      'Set up automated security scanning with CodeQL or Snyk',
      'Enable Dependabot for automated dependency updates'
    );

    return actions;
  }

  private fallbackExplain(issue: SecurityIssue): string {
    const map: Record<SecurityIssue['type'], (i: SecurityIssue) => string> = {
      'self-merge': (i) =>
        `This PR was merged by ${i.details.author} who was also its author, bypassing code review. ${i.severity === 'high' ? 'This is particularly concerning as it involves security-related changes.' : ''}`,
      'security-pr': (i) =>
        `This PR contains security-related changes (${i.details.title}). ${i.details.was_self_merged ? 'It was self-merged without external review.' : 'Ensure it was thoroughly reviewed.'}`,
      'disabled-actions': (i) =>
        `GitHub Actions is disabled on ${i.details.repo_name}, preventing automated security scanning and CI/CD workflows.`,
      'paused-workflow': (i) =>
        `The workflow "${i.details.workflow_name}" was automatically paused after 60 days of repository inactivity.`,
      'disabled-workflow': (i) =>
        `The workflow "${i.details.workflow_name}" has been manually disabled. Re-enable it if still needed.`,
      'unreviewed-security-pr': (i) =>
        `Critical: This security-related PR (${i.details.title}) was merged by its author without external review. Security changes should always be reviewed by security-knowledgeable team members to prevent introducing vulnerabilities.`,

      action_failure: (i) =>
        `The workflow "${i.details.workflow_name}" (run #${i.details.run_number}) failed on branch ${i.details.head_branch}. Failed workflows may indicate broken tests, build issues, or security scanning failures that need investigation.`,

      repeated_action_failure: (i) =>
        `Critical: The workflow "${i.details.workflow_name}" has failed ${i.details.failure_count} times recently. Repeated failures suggest a persistent issue that is preventing automated security scans, tests, or deployments from completing successfully.`,

      'security-pr-volume': (i) =>
        `High volume of security-related PRs detected (${i.details.security_pr_count} PRs). This may indicate an ongoing security incident or a need for additional security review resources.`,
      'contractor-repo-access': (i) =>
        `Contractor ${i.details.contractor_login} (${i.details.contractor_email}) has pull-request activity in ${i.details.full_name}, which is outside their permitted repository list. Review and revoke access if this is not authorised.`,
    };
    return map[issue.type]?.(issue) ?? issue.description;
  }
}
