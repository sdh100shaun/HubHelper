/**
 * Security PR Classifier Evaluator (HH-GH-003)
 *
 * Identifies security-related pull requests based on keywords, labels, and file patterns.
 * This is a classifier control that other controls depend on.
 *
 * @module evaluators/security-pr-classifier
 */

import { registerEvaluator } from '../policy/evaluator-registry.js';
import type { EvaluationContext, EvaluationResult, Severity } from '../policy/types.js';
import type { PullRequest, SecurityIssue } from '../types/index.js';
import { BaseEvaluator } from './base-evaluator.js';

interface SeverityKeywordMap {
  keywords: string[];
  severity: Severity;
}

interface ClassifiedPR {
  pr: PullRequest;
  severity: Severity;
  matchedKeywords: string[];
  matchedLabels: string[];
  matchedFiles: string[];
}

/**
 * Classifier for identifying security-related PRs
 */
@registerEvaluator('security-pr-classifier')
export class SecurityPRClassifier extends BaseEvaluator {
  readonly controlId = 'HH-GH-003';
  readonly kind = 'classifier' as const;

  async evaluate(
    context: EvaluationContext,
    parameters: Record<string, unknown>,
    severity: Severity
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Extract parameters
    const keywords = this.getStringArrayParam(parameters, 'keywords') || [];
    const labels = this.getStringArrayParam(parameters, 'labels') || [];
    const filePatterns = this.getStringArrayParam(parameters, 'file_patterns') || [];
    const keywordSeverityMap = (parameters.keyword_severity_map as SeverityKeywordMap[]) || [];
    const baseSeverity = this.getSeverityParam(parameters, 'base_severity') || severity;
    const fileLimit = this.getNumberParam(parameters, 'file_limit', false) || 10;

    // Classify PRs
    const classifiedPRs: ClassifiedPR[] = [];

    for (const pr of context.pullRequests) {
      const classification = this.classifyPR(
        pr,
        keywords,
        labels,
        filePatterns,
        keywordSeverityMap,
        baseSeverity
      );

      if (classification) {
        classifiedPRs.push(classification);
      }
    }

    // Convert to security issues
    const issues: SecurityIssue[] = classifiedPRs.map((classified) => ({
      type: 'security-pr',
      severity: classified.severity,
      repository: classified.pr.repository,
      description: `Security-related PR: ${classified.pr.title}`,
      details: {
        pr_number: classified.pr.number,
        title: classified.pr.title,
        url: classified.pr.url,
        author: classified.pr.author,
        merged_by: classified.pr.merged_by,
        merged_at: classified.pr.merged_at,
        was_self_merged: classified.pr.author === classified.pr.merged_by,
        labels: classified.pr.labels,
        files_changed: classified.pr.files_changed.slice(0, fileLimit),
        matched_keywords: classified.matchedKeywords,
        matched_labels: classified.matchedLabels,
        matched_files: classified.matchedFiles,
      },
      detected_at: new Date().toISOString(),
    }));

    return {
      controlId: this.controlId,
      issues,
      metadata: {
        itemsEvaluated: context.pullRequests.length,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Classify a single PR
   */
  private classifyPR(
    pr: PullRequest,
    keywords: string[],
    labels: string[],
    filePatterns: string[],
    keywordSeverityMap: SeverityKeywordMap[],
    baseSeverity: Severity
  ): ClassifiedPR | null {
    const text = pr.title.toLowerCase();
    const matchedKeywords: string[] = [];
    const matchedLabels: string[] = [];
    const matchedFiles: string[] = [];

    // Check keywords
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    // Check labels
    for (const prLabel of pr.labels) {
      for (const secLabel of labels) {
        if (prLabel.toLowerCase().includes(secLabel.toLowerCase())) {
          matchedLabels.push(prLabel);
          break;
        }
      }
    }

    // Check file patterns
    for (const file of pr.files_changed) {
      for (const pattern of filePatterns) {
        if (file.includes(pattern)) {
          matchedFiles.push(file);
          break;
        }
      }
    }

    // If no matches, not security-related
    if (matchedKeywords.length === 0 && matchedLabels.length === 0 && matchedFiles.length === 0) {
      return null;
    }

    // Determine severity based on keyword mapping
    let severity = baseSeverity;

    // Check keyword severity map (highest severity wins)
    const severityOrder: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    for (const mapping of keywordSeverityMap) {
      for (const keyword of mapping.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          if (severityOrder[mapping.severity] < severityOrder[severity]) {
            severity = mapping.severity;
          }
        }
      }
    }

    return {
      pr,
      severity,
      matchedKeywords,
      matchedLabels,
      matchedFiles,
    };
  }

  validateParameters(parameters: Record<string, unknown>): void {
    // Validate required parameters exist
    this.getStringArrayParam(parameters, 'keywords');
    this.getStringArrayParam(parameters, 'labels');
    this.getStringArrayParam(parameters, 'file_patterns');
    this.getSeverityParam(parameters, 'base_severity');

    // Validate keyword_severity_map structure
    const keywordSeverityMap = parameters.keyword_severity_map;
    if (keywordSeverityMap !== undefined) {
      if (!Array.isArray(keywordSeverityMap)) {
        throw new Error('keyword_severity_map must be an array');
      }

      for (const mapping of keywordSeverityMap as unknown[]) {
        if (
          typeof mapping !== 'object' ||
          mapping === null ||
          !('keywords' in mapping) ||
          !('severity' in mapping)
        ) {
          throw new Error('Each keyword_severity_map entry must have keywords and severity fields');
        }
      }
    }
  }
}
