import chalk from 'chalk';
import type { SecurityIssue, StreamConfig, StreamEventResult } from '../types/index.js';

const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function severityMeetsThreshold(
  severity: string,
  minSeverity: StreamConfig['minSeverity']
): boolean {
  return (SEVERITY_ORDER[severity] ?? 0) >= (SEVERITY_ORDER[minSeverity] ?? 0);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function colorViolation(issue: SecurityIssue): string {
  const label = `VIOLATION ${issue.severity}`;
  switch (issue.severity) {
    case 'critical':
      return chalk.red.bold(label);
    case 'high':
      return chalk.red(label);
    case 'medium':
      return chalk.yellow(label);
    default:
      return chalk.blue(label);
  }
}

function eventDescription(result: StreamEventResult): string {
  const { event } = result;
  const payload = event.payload as Record<string, unknown>;

  if (event.type === 'PullRequestEvent') {
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    const num = payload.number;
    const title = typeof pr?.title === 'string' ? pr.title : '';
    return `PR #${num} "${truncate(title, 40)}"`;
  }

  if (event.type === 'WorkflowRunEvent') {
    const run = payload.workflow_run as Record<string, unknown> | undefined;
    const name = typeof run?.name === 'string' ? run.name : 'workflow';
    const branch = typeof run?.head_branch === 'string' ? run.head_branch : '';
    return `${truncate(name, 30)} / ${truncate(branch, 20)}`;
  }

  return event.type;
}

export class StreamReporter {
  private readonly minSeverity: StreamConfig['minSeverity'];
  private readonly showCompliant: boolean;

  constructor(config: Pick<StreamConfig, 'showCompliant' | 'minSeverity'>) {
    this.minSeverity = config.minSeverity;
    this.showCompliant = config.showCompliant;
  }

  printBanner(org: string, intervalSeconds: number, profile: string): void {
    console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.cyan('  HubHelper — Realtime Activity Stream'));
    console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(`  ${chalk.white('Organization:')} ${chalk.cyan(org)}`);
    console.log(`  ${chalk.white('Poll interval:')} ${chalk.cyan(`${intervalSeconds}s`)}`);
    console.log(`  ${chalk.white('Policy profile:')} ${chalk.cyan(profile)}`);
    console.log(
      `  ${chalk.white('Min severity:')} ${chalk.cyan(this.minSeverity)}  ` +
        `${chalk.white('Show compliant:')} ${chalk.cyan(String(this.showCompliant))}`
    );
    console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    console.log(chalk.gray('Watching for activity… (Ctrl-C to stop)\n'));
  }

  printEvent(result: StreamEventResult): void {
    const qualifying = result.violations.filter((v) =>
      severityMeetsThreshold(v.severity, this.minSeverity)
    );

    if (qualifying.length === 0 && !this.showCompliant) {
      return;
    }

    const time = chalk.gray(`[${formatTime(result.timestamp)}]`);
    const type = chalk.cyan(result.event.type.padEnd(22));
    const repo = chalk.white(truncate(result.event.repo.name, 28).padEnd(28));
    const desc = chalk.white(truncate(eventDescription(result), 44).padEnd(44));

    if (qualifying.length === 0) {
      console.log(`${time} ${type} ${repo} ${desc} ${chalk.green('OK')}`);
      return;
    }

    const firstViolation = qualifying[0];
    const firstLabel = `${colorViolation(firstViolation)}: ${truncate(firstViolation.description, 50)}`;
    console.log(`${time} ${type} ${repo} ${desc} ${firstLabel}`);

    for (let i = 1; i < qualifying.length; i++) {
      const v = qualifying[i];
      const indent = ' '.repeat(4 + 1 + 22 + 1 + 28 + 1 + 44 + 1);
      console.log(`${indent}${colorViolation(v)}: ${truncate(v.description, 50)}`);
    }
  }

  printShutdown(stats: { eventsProcessed: number; violationsFound: number; uptime: number }): void {
    const uptimeMin = Math.floor(stats.uptime / 60);
    const uptimeSec = stats.uptime % 60;
    console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold('  Stream stopped'));
    console.log(`  Events processed: ${chalk.cyan(String(stats.eventsProcessed))}`);
    console.log(`  Violations found: ${chalk.cyan(String(stats.violationsFound))}`);
    console.log(`  Uptime: ${chalk.cyan(`${uptimeMin}m ${uptimeSec}s`)}`);
    console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }

  printInlineError(message: string): void {
    console.error(chalk.red(`[ERROR] ${message}`));
  }
}
