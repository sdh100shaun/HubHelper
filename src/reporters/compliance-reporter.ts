/**
 * Compliance Reporter
 *
 * Generates compliance framework reports showing control mappings and status.
 * Supports NIST 800-53, CIS Controls, and other security frameworks.
 *
 * @module reporters/compliance-reporter
 */

import * as fs from 'node:fs';
import type { PolicyEngineResult } from '../policy/engine.js';
import type { SecurityIssue } from '../types/index.js';

interface FrameworkReport {
  framework: string;
  controls: FrameworkControl[];
  statistics: {
    total: number;
    compliant: number;
    nonCompliant: number;
    notApplicable: number;
  };
}

interface FrameworkControl {
  id: string;
  statement: string;
  mapped: string[];
  status: 'compliant' | 'non-compliant' | 'not-applicable';
  issues: SecurityIssue[];
}

export class ComplianceReporter {
  /**
   * Generate compliance report for all frameworks
   */
  generateReport(engineResult: PolicyEngineResult): Record<string, FrameworkReport> {
    const frameworks = this.extractFrameworks(engineResult);
    const reports: Record<string, FrameworkReport> = {};

    for (const framework of frameworks) {
      reports[framework] = this.generateFrameworkReport(engineResult, framework);
    }

    return reports;
  }

  /**
   * Generate report for a specific framework
   */
  generateFrameworkReport(engineResult: PolicyEngineResult, framework: string): FrameworkReport {
    const controls: FrameworkControl[] = [];
    let compliant = 0;
    let nonCompliant = 0;
    const notApplicable = 0;

    // Group issues by control ID
    const issuesByControl = new Map<string, SecurityIssue[]>();
    for (const issue of engineResult.issues) {
      const controlId = this.inferControlId(issue.type);
      if (!issuesByControl.has(controlId)) {
        issuesByControl.set(controlId, []);
      }
      issuesByControl.get(controlId)!.push(issue);
    }

    // Process each control
    for (const control of engineResult.policy.controls) {
      if (!control.mappings || !control.mappings[framework]) {
        continue; // Skip controls not mapped to this framework
      }

      const controlIssues = issuesByControl.get(control.id) || [];
      const status = controlIssues.length > 0 ? 'non-compliant' : 'compliant';

      if (status === 'compliant') {
        compliant++;
      } else {
        nonCompliant++;
      }

      controls.push({
        id: control.id,
        statement: control.statement,
        mapped: control.mappings[framework],
        status,
        issues: controlIssues,
      });
    }

    return {
      framework,
      controls,
      statistics: {
        total: controls.length,
        compliant,
        nonCompliant,
        notApplicable,
      },
    };
  }

  /**
   * Generate text summary of compliance report
   */
  generateTextSummary(reports: Record<string, FrameworkReport>): string {
    const lines: string[] = [];
    lines.push('Compliance Framework Report');
    lines.push('='.repeat(80));
    lines.push('');

    for (const [framework, report] of Object.entries(reports)) {
      lines.push(`Framework: ${framework}`);
      lines.push('-'.repeat(80));
      lines.push(
        `Total Controls: ${report.statistics.total} | Compliant: ${report.statistics.compliant} | Non-Compliant: ${report.statistics.nonCompliant}`
      );
      lines.push(
        `Compliance Rate: ${((report.statistics.compliant / report.statistics.total) * 100).toFixed(1)}%`
      );
      lines.push('');

      // Show non-compliant controls
      const nonCompliant = report.controls.filter((c) => c.status === 'non-compliant');
      if (nonCompliant.length > 0) {
        lines.push('Non-Compliant Controls:');
        for (const control of nonCompliant) {
          lines.push(`  • ${control.id}: ${control.statement}`);
          lines.push(`    Maps to: ${control.mapped.join(', ')}`);
          lines.push(`    Issues: ${control.issues.length}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate markdown report
   */
  generateMarkdown(reports: Record<string, FrameworkReport>): string {
    const lines: string[] = [];
    lines.push('# Compliance Framework Report\n');

    for (const [framework, report] of Object.entries(reports)) {
      lines.push(`## ${framework}\n`);
      lines.push('### Summary\n');
      lines.push(`- **Total Controls**: ${report.statistics.total}`);
      lines.push(`- **Compliant**: ${report.statistics.compliant}`);
      lines.push(`- **Non-Compliant**: ${report.statistics.nonCompliant}`);
      lines.push(
        `- **Compliance Rate**: ${((report.statistics.compliant / report.statistics.total) * 100).toFixed(1)}%\n`
      );

      lines.push('### Control Status\n');
      lines.push('| Control ID | Statement | Framework Mappings | Status | Issues |');
      lines.push('|------------|-----------|-------------------|--------|--------|');

      for (const control of report.controls) {
        const statusEmoji = control.status === 'compliant' ? '✅' : '❌';
        lines.push(
          `| ${control.id} | ${control.statement} | ${control.mapped.join(', ')} | ${statusEmoji} ${control.status} | ${control.issues.length} |`
        );
      }

      lines.push('\n');
    }

    return lines.join('\n');
  }

  /**
   * Generate HTML report
   */
  generateHTML(reports: Record<string, FrameworkReport>): string {
    const lines: string[] = [];
    lines.push('<!DOCTYPE html>');
    lines.push('<html lang="en">');
    lines.push('<head>');
    lines.push('  <meta charset="UTF-8">');
    lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
    lines.push('  <title>Compliance Framework Report</title>');
    lines.push('  <style>');
    lines.push(
      '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; background: #f5f5f5; }'
    );
    lines.push(
      '    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }'
    );
    lines.push(
      '    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }'
    );
    lines.push('    h2 { color: #34495e; margin-top: 30px; }');
    lines.push('    .statistics { display: flex; gap: 20px; margin: 20px 0; }');
    lines.push(
      '    .stat-card { flex: 1; padding: 15px; border-radius: 6px; background: #ecf0f1; }'
    );
    lines.push('    .stat-card.compliant { background: #d5f4e6; border-left: 4px solid #27ae60; }');
    lines.push(
      '    .stat-card.non-compliant { background: #fadbd8; border-left: 4px solid #e74c3c; }'
    );
    lines.push('    .stat-label { font-size: 12px; color: #7f8c8d; text-transform: uppercase; }');
    lines.push('    .stat-value { font-size: 28px; font-weight: bold; margin-top: 5px; }');
    lines.push('    table { width: 100%; border-collapse: collapse; margin: 20px 0; }');
    lines.push('    th { background: #34495e; color: white; padding: 12px; text-align: left; }');
    lines.push('    td { padding: 10px; border-bottom: 1px solid #ecf0f1; }');
    lines.push('    tr:hover { background: #f8f9fa; }');
    lines.push(
      '    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }'
    );
    lines.push('    .badge.compliant { background: #27ae60; color: white; }');
    lines.push('    .badge.non-compliant { background: #e74c3c; color: white; }');
    lines.push('  </style>');
    lines.push('</head>');
    lines.push('<body>');
    lines.push('  <div class="container">');
    lines.push('    <h1>🔒 Compliance Framework Report</h1>');

    for (const [framework, report] of Object.entries(reports)) {
      const complianceRate = (
        (report.statistics.compliant / report.statistics.total) *
        100
      ).toFixed(1);

      lines.push(`    <h2>${framework}</h2>`);
      lines.push('    <div class="statistics">');
      lines.push('      <div class="stat-card">');
      lines.push('        <div class="stat-label">Total Controls</div>');
      lines.push(`        <div class="stat-value">${report.statistics.total}</div>`);
      lines.push('      </div>');
      lines.push('      <div class="stat-card compliant">');
      lines.push('        <div class="stat-label">Compliant</div>');
      lines.push(`        <div class="stat-value">${report.statistics.compliant}</div>`);
      lines.push('      </div>');
      lines.push('      <div class="stat-card non-compliant">');
      lines.push('        <div class="stat-label">Non-Compliant</div>');
      lines.push(`        <div class="stat-value">${report.statistics.nonCompliant}</div>`);
      lines.push('      </div>');
      lines.push('      <div class="stat-card">');
      lines.push('        <div class="stat-label">Compliance Rate</div>');
      lines.push(`        <div class="stat-value">${complianceRate}%</div>`);
      lines.push('      </div>');
      lines.push('    </div>');

      lines.push('    <table>');
      lines.push('      <thead>');
      lines.push('        <tr>');
      lines.push('          <th>Control ID</th>');
      lines.push('          <th>Statement</th>');
      lines.push('          <th>Framework Mappings</th>');
      lines.push('          <th>Status</th>');
      lines.push('          <th>Issues</th>');
      lines.push('        </tr>');
      lines.push('      </thead>');
      lines.push('      <tbody>');

      for (const control of report.controls) {
        const statusClass = control.status === 'compliant' ? 'compliant' : 'non-compliant';
        const statusText = control.status === 'compliant' ? '✅ Compliant' : '❌ Non-Compliant';

        lines.push('        <tr>');
        lines.push(`          <td><strong>${control.id}</strong></td>`);
        lines.push(`          <td>${control.statement}</td>`);
        lines.push(`          <td>${control.mapped.join(', ')}</td>`);
        lines.push(`          <td><span class="badge ${statusClass}">${statusText}</span></td>`);
        lines.push(`          <td>${control.issues.length}</td>`);
        lines.push('        </tr>');
      }

      lines.push('      </tbody>');
      lines.push('    </table>');
    }

    lines.push('  </div>');
    lines.push('</body>');
    lines.push('</html>');

    return lines.join('\n');
  }

  /**
   * Save compliance report to file
   */
  saveToFile(
    engineResult: PolicyEngineResult,
    filePath: string,
    format: 'json' | 'text' | 'markdown' | 'html' = 'json'
  ): void {
    const reports = this.generateReport(engineResult);
    let content: string;

    switch (format) {
      case 'text':
        content = this.generateTextSummary(reports);
        break;
      case 'markdown':
        content = this.generateMarkdown(reports);
        break;
      case 'html':
        content = this.generateHTML(reports);
        break;
      default:
        content = JSON.stringify(reports, null, 2);
    }

    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * Extract all frameworks from policy controls
   */
  private extractFrameworks(engineResult: PolicyEngineResult): string[] {
    const frameworks = new Set<string>();

    for (const control of engineResult.policy.controls) {
      if (control.mappings) {
        for (const framework of Object.keys(control.mappings)) {
          frameworks.add(framework);
        }
      }
    }

    return Array.from(frameworks).sort();
  }

  /**
   * Map issue type to control ID
   */
  private inferControlId(issueType: string): string {
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
}
