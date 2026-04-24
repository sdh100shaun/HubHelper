/**
 * SARIF Reporter
 *
 * Generates SARIF 2.1.0 format output for GitHub Code Scanning integration.
 * Converts security issues into standardized Static Analysis Results Interchange Format.
 *
 * @see https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
 * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 *
 * @module reporters/sarif-reporter
 */

import * as fs from 'node:fs';
import type { PolicyEngineResult } from '../policy/engine.js';
import type { SecurityIssue } from '../types/index.js';

interface SarifLog {
  version: '2.1.0';
  $schema: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
  properties?: {
    policyProfile?: string;
    catalogVersion?: string;
    controlsEvaluated?: number;
  };
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: {
    text: string;
  };
  fullDescription?: {
    text: string;
  };
  help?: {
    text: string;
    markdown?: string;
  };
  defaultConfiguration: {
    level: 'note' | 'warning' | 'error';
  };
  properties?: {
    tags?: string[];
    'security-severity'?: string;
  };
}

interface SarifResult {
  ruleId: string;
  level: 'note' | 'warning' | 'error';
  message: {
    text: string;
  };
  locations?: SarifLocation[];
  properties?: {
    repository?: string;
    detectedAt?: string;
  };
}

interface SarifLocation {
  physicalLocation?: {
    artifactLocation: {
      uri: string;
    };
  };
  logicalLocations?: Array<{
    name: string;
    kind: string;
  }>;
}

export class SarifReporter {
  private readonly toolName = 'HubHelper';
  private readonly toolVersion = '1.0.0';
  private readonly informationUri = 'https://github.com/sdh100shaun/HubHelper';

  /**
   * Generate SARIF output from policy engine results
   */
  generateSarif(engineResult: PolicyEngineResult): SarifLog {
    const rules = this.generateRules(engineResult);
    const results = this.generateResults(engineResult.issues);

    return {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: this.toolName,
              version: this.toolVersion,
              informationUri: this.informationUri,
              rules,
            },
          },
          results,
          properties: {
            policyProfile: engineResult.policy.metadata.profileTitle,
            catalogVersion: engineResult.policy.metadata.catalogVersion,
            controlsEvaluated: engineResult.statistics.controlsEvaluated,
          },
        },
      ],
    };
  }

  /**
   * Generate SARIF rules from controls in policy
   */
  private generateRules(engineResult: PolicyEngineResult): SarifRule[] {
    const rules: SarifRule[] = [];
    const seenRules = new Set<string>();

    // Generate rule for each control that produced issues
    for (const control of engineResult.policy.controls) {
      if (seenRules.has(control.id)) continue;
      seenRules.add(control.id);

      const rule: SarifRule = {
        id: control.id,
        name: control.statement.split('.')[0].substring(0, 50), // First sentence, truncated
        shortDescription: {
          text: control.statement,
        },
        defaultConfiguration: {
          level: this.mapSeverityToLevel(control.severity),
        },
        properties: {
          tags: [control.family, control.evaluator.kind],
          'security-severity': this.mapSeverityToScore(control.severity),
        },
      };

      // Add framework mappings to help text
      if (control.mappings) {
        const mappingText = Object.entries(control.mappings)
          .map(([framework, controls]) => `${framework}: ${controls.join(', ')}`)
          .join('\n');

        rule.help = {
          text: `Control: ${control.statement}\n\nFramework Mappings:\n${mappingText}`,
          markdown: `## ${control.id}: ${control.statement}\n\n### Framework Mappings\n${Object.entries(
            control.mappings
          )
            .map(([framework, controls]) => `- **${framework}**: ${controls.join(', ')}`)
            .join('\n')}`,
        };
      }

      rules.push(rule);
    }

    return rules;
  }

  /**
   * Generate SARIF results from security issues
   */
  private generateResults(issues: SecurityIssue[]): SarifResult[] {
    return issues.map((issue) => this.convertIssueToResult(issue));
  }

  /**
   * Convert a security issue to SARIF result
   */
  private convertIssueToResult(issue: SecurityIssue): SarifResult {
    const result: SarifResult = {
      ruleId: this.inferRuleId(issue.type),
      level: this.mapSeverityToLevel(issue.severity),
      message: {
        text: issue.description,
      },
      properties: {
        repository: issue.repository,
        detectedAt: issue.detected_at,
      },
    };

    // Add location information
    const location = this.generateLocation(issue);
    if (location) {
      result.locations = [location];
    }

    return result;
  }

  /**
   * Generate location from issue details
   */
  private generateLocation(issue: SecurityIssue): SarifLocation | null {
    // For PR-related issues, point to the PR
    if (issue.details.pr_number && issue.details.url) {
      return {
        logicalLocations: [
          {
            name: `PR #${issue.details.pr_number}`,
            kind: 'pullRequest',
          },
        ],
      };
    }

    // For workflow-related issues, point to the workflow
    if (issue.details.workflow_name && issue.details.workflow_path) {
      return {
        physicalLocation: {
          artifactLocation: {
            uri: issue.details.workflow_path as string,
          },
        },
        logicalLocations: [
          {
            name: issue.details.workflow_name as string,
            kind: 'workflow',
          },
        ],
      };
    }

    // For repository-level issues
    if (issue.details.repo_name) {
      return {
        logicalLocations: [
          {
            name: issue.details.repo_name as string,
            kind: 'repository',
          },
        ],
      };
    }

    return null;
  }

  /**
   * Map control ID from issue type
   */
  private inferRuleId(issueType: string): string {
    const typeToControlId: Record<string, string> = {
      'self-merge': 'HH-GH-001',
      'unreviewed-security-pr': 'HH-GH-002',
      'security-pr': 'HH-GH-003',
      'disabled-actions': 'HH-GH-004',
      'paused-workflow': 'HH-GH-005',
      'disabled-workflow': 'HH-GH-006',
      repeated_action_failure: 'HH-GH-007',
      action_failure: 'HH-GH-008',
      'security-pr-volume': 'HH-GH-009',
    };

    return typeToControlId[issueType] || 'HH-GH-000';
  }

  /**
   * Map severity to SARIF level
   */
  private mapSeverityToLevel(severity: string): 'note' | 'warning' | 'error' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      default:
        return 'note';
    }
  }

  /**
   * Map severity to security severity score (0.0-10.0)
   * Used by GitHub Code Scanning for priority
   */
  private mapSeverityToScore(severity: string): string {
    switch (severity) {
      case 'critical':
        return '9.0';
      case 'high':
        return '7.0';
      case 'medium':
        return '5.0';
      case 'low':
        return '3.0';
      default:
        return '1.0';
    }
  }

  /**
   * Save SARIF report to file
   */
  saveToFile(engineResult: PolicyEngineResult, filePath: string): void {
    const sarif = this.generateSarif(engineResult);
    const json = JSON.stringify(sarif, null, 2);
    fs.writeFileSync(filePath, json, 'utf-8');
  }

  /**
   * Get SARIF as string
   */
  toString(engineResult: PolicyEngineResult): string {
    const sarif = this.generateSarif(engineResult);
    return JSON.stringify(sarif, null, 2);
  }
}
