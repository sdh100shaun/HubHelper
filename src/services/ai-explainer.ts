/**
 * AIExplainerService
 *
 * Generates per-issue explanations and executive summaries using the
 * CopilotAIClient (Opus 4.7 by default for rich explanations).
 *
 * Explanations are cached on disk via ExplanationCache (24h TTL) to
 * avoid redundant API calls for unchanged issues.
 *
 * @module services/ai-explainer
 */

import type { AnalysisResult, SecurityIssue } from '../types/index.js';
import type { AIModel } from './copilot-ai-client.js';
import { CopilotAIClient } from './copilot-ai-client.js';
import { ExplanationCache } from './explanation-cache.js';

const DEFAULT_EXPLAIN_MODEL: AIModel = 'claude-opus-4-7';

export interface AIExplainerOptions {
  /** Model used for per-issue explanations and summaries. Defaults to claude-opus-4-7. */
  model?: AIModel;
  /** Custom cache directory (optional; defaults to ~/.hubhelper/cache/explanations). */
  cacheDir?: string;
}

export class AIExplainerService {
  private readonly client: CopilotAIClient;
  private readonly cache: ExplanationCache;

  constructor(options: AIExplainerOptions = {}) {
    this.client = new CopilotAIClient({ model: options.model ?? DEFAULT_EXPLAIN_MODEL });
    this.cache = new ExplanationCache(options.cacheDir);
  }

  /**
   * Return an AI-generated explanation for a single issue.
   * Returns null if the AI is unavailable.
   */
  async explainIssue(issue: SecurityIssue): Promise<string | null> {
    const cached = await this.cache.get(issue);
    if (cached !== null) {
      return cached;
    }

    const prompt = buildIssuePrompt(issue);
    const explanation = await this.client.complete(prompt);
    if (explanation) {
      await this.cache.set(issue, explanation).catch(() => {});
    }
    return explanation;
  }

  /**
   * Return an AI-generated executive summary for the full analysis result.
   * Returns null if the AI is unavailable.
   */
  async summarize(result: AnalysisResult): Promise<string | null> {
    const prompt = buildSummaryPrompt(result);
    return this.client.complete(prompt);
  }

  async dispose(): Promise<void> {
    await this.client.dispose();
  }
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

function buildIssuePrompt(issue: SecurityIssue): string {
  return `You are a GitHub security expert. Explain the following security issue to a developer in 2-3 clear, actionable sentences. Focus on the risk and recommended remediation. Do not repeat the raw data fields.

Issue type: ${issue.type}
Severity: ${issue.severity}
Repository: ${issue.repository}
Description: ${issue.description}
Details: ${JSON.stringify(issue.details, null, 2)}`;
}

function buildSummaryPrompt(result: AnalysisResult): string {
  const bySeverity = result.issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});

  const byType = result.issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.type] = (acc[i.type] ?? 0) + 1;
    return acc;
  }, {});

  return `You are a GitHub security analyst. Write a concise 3-5 sentence executive summary of the following security findings for a GitHub organization. Focus on the most critical risks and patterns. Be direct and avoid repeating raw numbers already shown in the report.

Statistics:
${JSON.stringify(result.statistics, null, 2)}

Issues by severity: ${JSON.stringify(bySeverity)}
Issues by type: ${JSON.stringify(byType)}
Total issues: ${result.issues.length}`;
}
