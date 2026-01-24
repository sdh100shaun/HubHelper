import chalk from 'chalk';
import type { AnalysisResult, SecurityIssue } from '../types/index.js';

export class ConsoleReporter {
  printAnalysisResult(result: AnalysisResult, aiInsights?: string): void {
    console.log(`\n${chalk.bold.cyan('═'.repeat(80))}`);
    console.log(chalk.bold.cyan('  GitHub Organization Security Analysis'));
    console.log(`${chalk.bold.cyan('═'.repeat(80))}\n`);

    // Summary
    console.log(chalk.bold('📊 Summary:'));
    console.log(`${chalk.gray(result.summary)}\n`);

    // Statistics
    this.printStatistics(result);

    // AI Insights
    if (aiInsights) {
      console.log(`\n${chalk.bold('🤖 AI-Powered Insights:')}`);
      console.log(`${chalk.gray(aiInsights)}\n`);
    }

    // Issues by severity
    this.printIssuesBySeverity(result.issues);

    // Recommendations
    if (result.recommendations.length > 0) {
      console.log(`\n${chalk.bold('💡 Recommendations:')}`);
      result.recommendations.forEach((rec, idx) => {
        console.log(chalk.yellow(`  ${idx + 1}. ${rec}`));
      });
      console.log();
    }

    // Detailed issues
    if (result.issues.length > 0) {
      this.printDetailedIssues(result.issues);
    }

    console.log(`${chalk.bold.cyan('═'.repeat(80))}\n`);
  }

  private printStatistics(result: AnalysisResult): void {
    const { statistics } = result;

    console.log(chalk.bold('📈 Statistics:'));
    console.log(chalk.gray('  ├─ Total Repositories: ') + chalk.white(statistics.total_repos));
    console.log(chalk.gray('  ├─ Total Pull Requests: ') + chalk.white(statistics.total_prs));
    console.log(chalk.gray('  ├─ Self-Merges: ') + chalk.yellow(statistics.self_merges));
    console.log(chalk.gray('  ├─ Security PRs: ') + chalk.magenta(statistics.security_prs));
    console.log(
      chalk.gray('  ├─ Repos with Disabled Actions: ') +
        chalk.red(statistics.repos_with_disabled_actions)
    );
    console.log(chalk.gray('  ├─ Paused Workflows: ') + chalk.yellow(statistics.paused_workflows));
    console.log(
      chalk.gray('  └─ Disabled Workflows: ') + chalk.blue(statistics.disabled_workflows)
    );
  }

  private printIssuesBySeverity(issues: SecurityIssue[]): void {
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const high = issues.filter((i) => i.severity === 'high').length;
    const medium = issues.filter((i) => i.severity === 'medium').length;
    const low = issues.filter((i) => i.severity === 'low').length;

    console.log(`\n${chalk.bold('🚨 Issues by Severity:')}`);

    if (critical > 0) {
      console.log(chalk.red.bold(`  ├─ Critical: ${critical}`));
    }
    if (high > 0) {
      console.log(chalk.red(`  ├─ High: ${high}`));
    }
    if (medium > 0) {
      console.log(chalk.yellow(`  ├─ Medium: ${medium}`));
    }
    if (low > 0) {
      console.log(chalk.blue(`  └─ Low: ${low}`));
    }

    if (issues.length === 0) {
      console.log(chalk.green('  ✓ No issues detected!'));
    }
  }

  private printDetailedIssues(issues: SecurityIssue[]): void {
    console.log(`\n${chalk.bold('🔍 Detailed Issues:')}\n`);

    // Group by type
    const groupedIssues = this.groupIssuesByType(issues);

    for (const [type, typeIssues] of Object.entries(groupedIssues)) {
      const emoji = this.getEmojiForType(type as SecurityIssue['type']);
      console.log(
        chalk.bold(`${emoji} ${this.formatType(type)}:`) + chalk.gray(` (${typeIssues.length})`)
      );

      // Show up to 5 issues per type
      const displayIssues = typeIssues.slice(0, 5);
      displayIssues.forEach((issue, idx) => {
        const severityColor = this.getSeverityColor(issue.severity);
        const prefix = idx === displayIssues.length - 1 && typeIssues.length <= 5 ? '└─' : '├─';

        console.log(
          `${
            chalk.gray(`  ${prefix} `) + severityColor(`[${issue.severity.toUpperCase()}]`)
          } ${issue.description}`
        );
        console.log(chalk.gray(`     Repository: ${issue.details.repo_name || issue.repository}`));

        if (issue.details.url) {
          console.log(chalk.gray('     URL: ') + chalk.cyan(issue.details.url));
        }
      });

      if (typeIssues.length > 5) {
        console.log(chalk.gray(`  └─ ... and ${typeIssues.length - 5} more`));
      }

      console.log();
    }
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

  private getSeverityColor(severity: string) {
    switch (severity) {
      case 'critical':
        return chalk.red.bold;
      case 'high':
        return chalk.red;
      case 'medium':
        return chalk.yellow;
      case 'low':
        return chalk.blue;
      default:
        return chalk.white;
    }
  }

  private getEmojiForType(type: SecurityIssue['type']): string {
    switch (type) {
      case 'self-merge':
        return '🔀';
      case 'security-pr':
        return '🔒';
      case 'disabled-actions':
        return '⚙️';
      case 'unreviewed-security-pr':
        return '⚠️';
      case 'paused-workflow':
        return '⏸️';
      case 'disabled-workflow':
        return '🚫';
      default:
        return '📋';
    }
  }

  private formatType(type: string): string {
    return type
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  printError(error: Error): void {
    console.log(`\n${chalk.red.bold('❌ Error:')}`);
    console.log(chalk.red(error.message));
    if (error.stack) {
      console.log(chalk.gray(error.stack));
    }
    console.log();
  }

  printSuccess(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  printWarning(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  printInfo(message: string): void {
    console.log(chalk.blue(`ℹ ${message}`));
  }
}
