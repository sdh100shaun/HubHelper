import { writeFileSync } from 'node:fs';
import type { AnalysisResult, SecurityIssue } from '../types/index.js';
import { escapeHtml, sanitizeSecurityIssue } from '../utils/html-sanitizer.js';

export class HTMLReporter {
  generateReport(result: AnalysisResult, aiInsights?: string): string {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self';
                   style-src 'unsafe-inline';
                   script-src 'none';
                   img-src 'self' data:;
                   object-src 'none';
                   base-uri 'self';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Security Analysis Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .subtitle { font-size: 1.1em; opacity: 0.9; }
        .content { padding: 40px; }
        .summary {
            background: #f7fafc;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-bottom: 30px;
            border-radius: 4px;
        }
        .statistics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-value { font-size: 2em; margin-bottom: 5px; font-weight: bold; }
        .stat-card p { opacity: 0.9; }
        .section {
            margin-bottom: 30px;
            background: #f7fafc;
            padding: 20px;
            border-radius: 8px;
        }
        .section h2 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 1.5em;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .severity-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .severity-critical { background: #ef4444; color: white; }
        .severity-high { background: #fc8181; color: white; }
        .severity-medium { background: #f6ad55; color: white; }
        .severity-low { background: #4299e1; color: white; }
        .issue {
            background: white;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 6px;
            border-left: 4px solid #cbd5e0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .issue h3 { margin-bottom: 8px; color: #2d3748; }
        .issue p { color: #718096; margin-bottom: 5px; }
        .issue a { color: #667eea; text-decoration: none; }
        .issue a:hover { text-decoration: underline; }
        .recommendations {
            background: #edf2f7;
            padding: 20px;
            border-radius: 8px;
        }
        .recommendations ul { list-style: none; }
        .recommendations li {
            padding: 10px;
            margin-bottom: 8px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #f6ad55;
        }
        .footer {
            text-align: center;
            color: #718096;
            padding: 20px;
            font-size: 0.9em;
        }
        .ai-insights {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 GitHub Security Analysis</h1>
            <p class="subtitle">Organization Activity & Security Monitoring Report</p>
        </div>

        <div class="content">
            <div class="summary">
                <h2>📊 Summary</h2>
                <p>${escapeHtml(result.summary)}</p>
            </div>

            <div class="statistics statistics-grid">
                <div class="stat-card">
                    <div class="stat-value">${result.statistics.total_repos}</div>
                    <p>Total Repositories</p>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${result.statistics.total_prs}</div>
                    <p>Total Pull Requests</p>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${result.statistics.self_merges}</div>
                    <p>Self-Merges</p>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${result.statistics.security_prs}</div>
                    <p>Security PRs</p>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${result.statistics.repos_with_disabled_actions}</div>
                    <p>Repos with Disabled Actions</p>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${result.statistics.paused_workflows}</div>
                    <p>Paused Workflows</p>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${result.statistics.disabled_workflows}</div>
                    <p>Disabled Workflows</p>
                </div>
            </div>

            ${this.generateIssuesSection(result.issues)}

            ${
              aiInsights
                ? `
            <div class="ai-insights">
                <h2>🤖 AI Insights</h2>
                ${escapeHtml(aiInsights)}
            </div>
            `
                : ''
            }

            ${this.generateRecommendationsSection(result.recommendations)}
        </div>

        <footer class="footer">
            Generated on ${new Date().toLocaleString()}
        </footer>
    </div>
</body>
</html>`;

    return html;
  }

  private generateIssuesSection(issues: SecurityIssue[]): string {
    if (issues.length === 0) {
      return '<div class="section"><h2>✅ No Issues Found</h2><p>Great job! No security issues were detected.</p></div>';
    }

    const groupedIssues = this.groupIssuesByType(issues);
    let html = '<div class="section"><h2>🔍 Detected Issues</h2>';

    for (const [type, typeIssues] of Object.entries(groupedIssues)) {
      html += `<h3>${this.formatType(type)} (${typeIssues.length})</h3>`;

      for (const issue of typeIssues) {
        const sanitized = sanitizeSecurityIssue(issue);
        html += `
          <div class="issue">
            <h3>
              <span class="severity-badge severity-${escapeHtml(sanitized.severity)}">${escapeHtml(sanitized.severity)}</span>
              ${sanitized.description}
            </h3>
            <p><strong>Repository:</strong> ${sanitized.repository}</p>
            ${sanitized.details.url ? `<p><strong>URL:</strong> <a href="${sanitized.details.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(sanitized.details.url)}</a></p>` : ''}
            ${issue.details.merged_at ? `<p><strong>Merged:</strong> ${escapeHtml(new Date(issue.details.merged_at).toLocaleString())}</p>` : ''}
          </div>
        `;
      }
    }

    html += '</div>';
    return html;
  }

  private generateRecommendationsSection(recommendations: string[]): string {
    if (recommendations.length === 0) return '';

    let html = '<div class="section recommendations"><h2>💡 Recommendations</h2><ul>';
    for (const rec of recommendations) {
      html += `<li>${escapeHtml(rec)}</li>`;
    }
    html += '</ul></div>';

    return html;
  }

  private groupIssuesByType(issues: SecurityIssue[]): Record<string, SecurityIssue[]> {
    return issues.reduce(
      (acc, issue) => {
        if (!acc[issue.type]) {
          acc[issue.type] = [];
        }
        acc[issue.type].push(issue);
        return acc;
      },
      {} as Record<string, SecurityIssue[]>
    );
  }

  private formatType(type: string): string {
    return type
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  saveToFile(result: AnalysisResult, filename: string, aiInsights?: string): void {
    const html = this.generateReport(result, aiInsights);
    writeFileSync(filename, html, 'utf-8');
  }
}
