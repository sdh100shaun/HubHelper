/**
 * Terminal output for the `hubhelper copilot` commands.
 *
 * Output goes through an injected writer so it can be captured in tests and
 * kept off stdout when another format is being piped.
 *
 * @module reporters/copilot-console-reporter
 */

import chalk from 'chalk';
import type { AccessEntry } from '../services/copilot/access-control.js';
import type { InsightsNarrative, UserNarrative } from '../services/copilot/insights-service.js';
import type { CopilotUsageModel } from '../services/copilot/model.js';
import type { StoreStatus } from '../services/copilot/store/copilot-store.js';
import type { SyncSummary } from '../services/copilot/sync-service.js';
import type { CopilotUserProfile, ProfileComparison } from '../services/copilot/user-profile.js';
import { scopeSlug } from '../types/copilot.js';
import type { SecurityIssue } from '../types/index.js';
import { pctCell, type Row, type UsageView, usageRows } from './copilot-export.js';

const BARS = '▁▂▃▄▅▆▇█';

/** Unicode sparkline; days with no data are shown as a space. */
export function sparkline(values: Array<number | null>): string {
  const present = values.filter((v): v is number => v !== null);
  const max = Math.max(0, ...present);
  return values
    .map((v) => {
      if (v === null) return ' ';
      if (max === 0) return BARS[0];
      return BARS[Math.min(BARS.length - 1, Math.round((v / max) * (BARS.length - 1)))];
    })
    .join('');
}

function cellText(value: Row[string]): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Plain text table; numeric columns are right-aligned. */
export function formatTable(rows: Row[], maxWidth = 40): string {
  if (rows.length === 0) return chalk.gray('  (no data)');
  const columns = Object.keys(rows[0]);
  const numeric = columns.map((c) => rows.every((r) => r[c] === null || typeof r[c] === 'number'));
  const clip = (s: string) => (s.length > maxWidth ? `${s.slice(0, maxWidth - 1)}…` : s);
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => clip(cellText(r[c])).length))
  );
  const line = (cells: string[]) =>
    `  ${cells.map((cell, i) => (numeric[i] ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join('  ')}`;
  return [
    chalk.bold(line(columns)),
    chalk.gray(line(widths.map((w) => '─'.repeat(w)))),
    ...rows.map((r) => line(columns.map((c) => clip(cellText(r[c]))))),
  ].join('\n');
}

const SEVERITY_COLOUR: Record<string, (s: string) => string> = {
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.blue,
};

export class CopilotConsoleReporter {
  constructor(
    private readonly write: (line: string) => void = (line) => {
      process.stdout.write(`${line}\n`);
    }
  ) {}

  private heading(text: string): void {
    this.write('');
    this.write(chalk.bold.cyan(text));
    this.write(chalk.cyan('─'.repeat(Math.min(80, text.length + 4))));
  }

  printKpis(model: CopilotUsageModel): void {
    const k = model.kpis;
    this.heading(
      `Copilot usage · ${model.scope.kind} ${scopeSlug(model.scope)} · ${model.range.from} to ${model.range.to}`
    );
    const daily = model.daily.map((d) => (d.status === 'ok' ? d.activeUsers : null));
    this.write(
      `  Seats ${chalk.bold(k.seats)}   Active ${chalk.bold(k.activeUsers)} (${pctCell(k.activeRate) || 'n/a'})   ` +
        `Engaged ${chalk.bold(k.engagedUsers)}   Acceptance ${chalk.bold(pctCell(k.acceptanceRate) || 'n/a')}`
    );
    this.write(
      `  Interactions ${chalk.bold(k.interactions)}   Lines accepted ${chalk.bold(k.locAccepted)}   ` +
        `${model.spend.unit} ${chalk.bold(k.aiCreditsUsed.toFixed(1))}   Month-to-date net ${chalk.bold(model.spend.monthToDate.netAmount.toFixed(2))}`
    );
    this.write(`  Daily active users  ${chalk.green(sparkline(daily))}`);
    this.write(
      `  Cohorts: ${model.cohorts.power} power · ${model.cohorts.regular} regular · ${model.cohorts.casual} casual · ${model.cohorts.dormant} dormant`
    );
    this.printDataQuality(model);
  }

  printDataQuality(model: CopilotUsageModel): void {
    const q = model.dataQuality;
    const notes: string[] = [];
    if (q.suppressedDays.length > 0) {
      notes.push(`${q.suppressedDays.length} day(s) suppressed (fewer than five licensed users)`);
    }
    if (q.missingDays.length > 0) notes.push(`${q.missingDays.length} day(s) with no report`);
    if (q.flaggedDays.length > 0) {
      notes.push(`${q.flaggedDays.length} day(s) with telemetry or client-version gaps`);
    }
    if (notes.length > 0) this.write(chalk.yellow(`  Data quality: ${notes.join('; ')}`));
  }

  printUsage(model: CopilotUsageModel, view: UsageView = 'feature'): void {
    this.printKpis(model);
    this.heading(`By ${view}`);
    this.write(formatTable(usageRows(model, view).slice(0, 25)));
    if (model.anomalies.length > 0) {
      this.heading('Unusual days');
      for (const a of model.anomalies.slice(0, 5)) {
        this.write(
          `  ${a.day}  ${a.metric} ${a.value} (usual ${a.mean.toFixed(1)}, ${a.zScore > 0 ? 'up' : 'down'})`
        );
      }
    }
  }

  printTable(title: string, rows: Row[]): void {
    this.heading(title);
    this.write(formatTable(rows));
  }

  printSpend(model: CopilotUsageModel, rows: Row[], view: string, budget?: number): void {
    const m = model.spend.monthToDate;
    this.heading(`Copilot spend · ${model.range.from} to ${model.range.to}`);
    this.write(
      `  Unit ${model.spend.unit}   Total ${model.spend.total.toFixed(1)}   Net ${model.spend.netAmount.toFixed(2)}`
    );
    this.write(
      `  ${m.month}: month-to-date net ${m.netAmount.toFixed(2)}, forecast ${m.forecastNetAmount.toFixed(2)}` +
        (budget
          ? ` against budget ${budget}${m.forecastNetAmount > budget ? chalk.red(' (over)') : ''}`
          : '')
    );
    this.write(`  Daily net  ${sparkline(model.spend.byDay.map((d) => d.netAmount))}`);
    this.heading(`By ${view}`);
    this.write(formatTable(rows.slice(0, 30)));
  }

  printFindings(issues: SecurityIssue[]): void {
    this.heading(`Governance findings (${issues.length})`);
    if (issues.length === 0) {
      this.write(chalk.green('  No findings.'));
      return;
    }
    for (const issue of issues.slice(0, 50)) {
      const colour = SEVERITY_COLOUR[issue.severity] ?? ((s: string) => s);
      const id = typeof issue.details.control_id === 'string' ? issue.details.control_id : '';
      this.write(`  ${colour(issue.severity.toUpperCase().padEnd(8))} ${id}  ${issue.description}`);
    }
    if (issues.length > 50) this.write(chalk.gray(`  …and ${issues.length - 50} more`));
  }

  printNarrative(n: InsightsNarrative): void {
    this.heading(n.source === 'ai' ? 'AI summary' : 'Summary (Copilot unavailable)');
    this.write(`  ${chalk.bold(n.headline)}`);
    for (const text of [n.adoption, n.engagement, n.spend]) this.write(`  ${text}`);
    if (n.risks.length > 0) {
      this.write(chalk.bold('  Risks'));
      for (const r of n.risks) this.write(`   • ${r}`);
    }
    if (n.recommendations.length > 0) {
      this.write(chalk.bold('  Recommendations'));
      n.recommendations.forEach((r, i) => {
        this.write(`   ${i + 1}. ${r}`);
      });
    }
  }

  printUserProfile(
    profile: CopilotUserProfile,
    recentViews: Array<{ viewedAt: string; viewer: string; reasonCode: string }>,
    narrative?: UserNarrative
  ): void {
    const a = profile.activity;
    const t = profile.totals;
    this.heading(`${profile.login} · ${profile.range.from} to ${profile.range.to}`);
    const seats = profile.seat.current
      .map((s) => `${s.org || '?'} (${s.assigningTeam ? `team:${s.assigningTeam}` : 'direct'})`)
      .join(', ');
    this.write(
      `  Seats: ${seats || 'none'}   Billed org: ${profile.seat.billedOrg ?? 'not reported'}`
    );
    if (profile.teams.length > 0) this.write(`  Teams: ${profile.teams.join(', ')}`);
    if (profile.seat.costCentres.length > 0) {
      this.write(`  Cost centres: ${profile.seat.costCentres.join(', ')}`);
    }
    this.write(
      `  Active ${chalk.bold(a.activeDays)} day(s) · ${a.activeDaysPerWeek.toFixed(1)}/week · streak ${a.currentStreak} (longest ${a.longestStreak})` +
        ` · last active ${a.lastActiveDay ?? 'never'}`
    );
    this.write(
      `  Activity  ${chalk.green(sparkline(a.daily.map((d) => d.interactions + d.codeGen)))}`
    );
    this.write(
      `  Interactions ${t?.interactions ?? 0} · code generations ${t?.codeGen ?? 0} · acceptance ${pctCell(t?.acceptanceRate ?? null) || 'n/a'}` +
        ` · chat ${t?.chatTurns ?? 0} · agent ${t?.agentTurns ?? 0} · ${profile.spend.aiCreditsUsed.toFixed(1)} credits`
    );
    const features = Object.entries(profile.featureTotals)
      .filter(([, v]) => (v ?? 0) > 0)
      .map(
        ([k, v]) =>
          `${k} ${v} (since ${profile.featureFirstUsed[k as keyof typeof profile.featureFirstUsed] ?? '?'})`
      );
    if (features.length > 0) this.write(`  Features: ${features.join(' · ')}`);
    if (profile.untriedFeatures.length > 0) {
      this.write(`  Not yet tried (most peers use): ${profile.untriedFeatures.join(', ')}`);
    }
    for (const dim of ['ide', 'language', 'model', 'client'] as const) {
      const top = profile.breakdowns[dim].slice(0, 5).map((e) => e.key);
      if (top.length > 0) this.write(`  ${dim}: ${top.join(', ')}`);
    }
    if (profile.agentPrs.requested + profile.agentPrs.reviewed > 0) {
      this.write(
        `  Coding agent PRs: ${profile.agentPrs.requested} requested, ${profile.agentPrs.merged} merged` +
          ` (${profile.agentPrs.mergedWithoutHumanApproval} without human approval), ${profile.agentPrs.reviewed} reviewed`
      );
    }
    if (profile.peers.length > 0) {
      this.write(chalk.bold('  Compared with peers (percentile)'));
      for (const p of profile.peers) {
        this.write(
          `   ${p.group.padEnd(24)} activity ${p.activityPercentile} · acceptance ${p.acceptancePercentile ?? 'n/a'} · spend ${p.spendPercentile} (n=${p.size})`
        );
      }
    }
    if (profile.seat.history.length > 0) {
      this.write(
        `  Seat history: ${profile.seat.history.map((e) => `${e.day} ${e.event} ${e.org}`).join('; ')}`
      );
    }
    if (profile.dataQuality.flaggedDays.length > 0) {
      this.write(
        chalk.yellow(
          `  ${profile.dataQuality.flaggedDays.length} day(s) may under-report usage (telemetry gaps)`
        )
      );
    }
    if (narrative) {
      this.write(chalk.bold(narrative.source === 'ai' ? '  AI summary' : '  Summary'));
      this.write(`   ${narrative.summary}`);
      for (const step of narrative.nextSteps) this.write(`   • ${step}`);
    }
    this.write(chalk.gray('  Usage figures describe tool use, not productivity or performance.'));
    if (recentViews.length > 0) {
      this.write(chalk.gray('  Recent views of this person’s data:'));
      for (const v of recentViews) {
        this.write(
          chalk.gray(
            `   ${v.viewedAt.slice(0, 16).replace('T', ' ')}  ${v.viewer}  (${v.reasonCode})`
          )
        );
      }
    }
  }

  printComparison(labelA: string, labelB: string, rows: ProfileComparison[]): void {
    this.printTable(
      `Comparison: ${labelA} vs ${labelB}`,
      rows.map((r) => ({
        metric: r.metric,
        [labelA]: r.a,
        [labelB]: r.b,
        change: r.change === null ? null : Number(r.change.toFixed(2)),
      }))
    );
  }

  printSyncSummary(summary: SyncSummary): void {
    this.heading('Sync complete');
    for (const [kind, counts] of Object.entries(summary.days)) {
      this.write(
        `  ${kind.padEnd(18)} ok ${counts.ok} · suppressed ${counts.suppressed} · unavailable ${counts.unavailable} · errors ${counts.error}`
      );
    }
    this.write(
      `  Seats ${summary.seats} · spend days ${summary.spendDays} · coding agent PRs ${summary.agentPrs}`
    );
    if (summary.orgsNotAssessed.length > 0) {
      this.write(chalk.yellow(`  Not assessed (no access): ${summary.orgsNotAssessed.join(', ')}`));
    }
    if (summary.retentionRemoved > 0) {
      this.write(`  Retention removed ${summary.retentionRemoved} old per-user row(s)`);
    }
    for (const w of summary.warnings) this.write(chalk.yellow(`  ${w}`));
  }

  printAccessLog(entries: AccessEntry[]): void {
    this.printTable(
      'Access log',
      entries.map((e) => ({
        id: e.id,
        viewed_at: e.viewedAt.slice(0, 19).replace('T', ' '),
        viewer: e.viewer,
        reason_code: e.reasonCode,
        reason: e.reason,
        subjects:
          e.subjects.length > 3
            ? `${e.subjects.slice(0, 3).join(' ')} +${e.subjects.length - 3}`
            : e.subjects.join(' '),
        command: e.command,
      }))
    );
  }

  printStatus(status: StoreStatus): void {
    this.heading('Copilot database');
    this.write(
      `  Path ${status.path} · schema v${status.schemaVersion}` +
        (status.sizeBytes === null ? '' : ` · ${(status.sizeBytes / 1024 / 1024).toFixed(1)} MB`)
    );
    for (const s of status.scopes) {
      this.write(`  ${s.kind} ${s.slug}: ${s.firstDay ?? '—'} to ${s.lastDay ?? '—'}`);
    }
    this.write(
      `  ${Object.entries(status.rowCounts)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')}`
    );
  }

  info(message: string): void {
    this.write(chalk.blue(`ℹ ${message}`));
  }

  warn(message: string): void {
    this.write(chalk.yellow(`⚠ ${message}`));
  }
}
