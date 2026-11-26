/**
 * Self-contained HTML dashboard for Copilot Insights.
 *
 * - No external scripts, fonts or styles: the file works offline and can be
 *   attached or archived.
 * - Charts are inline SVG built here, with a hover/focus tooltip and a table
 *   view under each chart. Colours follow a CVD-validated categorical
 *   palette, defined separately for light and dark themes.
 * - Every value is HTML-escaped. Individual pages are included only when the
 *   caller passes profiles (which requires a logged reason), and each one
 *   carries the access stamp.
 *
 * @module reporters/copilot-html-reporter
 */

import type { InsightsNarrative, UserNarrative } from '../services/copilot/insights-service.js';
import type { BreakdownEntry, CopilotUsageModel } from '../services/copilot/model.js';
import type { CopilotUserProfile, UserDailyPoint } from '../services/copilot/user-profile.js';
import { type FeatureCategory, scopeSlug } from '../types/copilot.js';
import type { SecurityIssue } from '../types/index.js';
import { escapeHtml } from '../utils/html-sanitizer.js';
import { type AccessStamp, pctCell } from './copilot-export.js';

/** Fixed category order: colour follows the feature, never its rank. */
export const FEATURE_ORDER: readonly FeatureCategory[] = [
  'completions',
  'chat',
  'agent',
  'edits',
  'cli',
  'code-review',
  'coding-agent',
  'other',
];

export interface HtmlReportInput {
  model: CopilotUsageModel;
  findings?: SecurityIssue[];
  narrative?: InsightsNarrative;
  profiles?: Array<{ profile: CopilotUserProfile; narrative?: UserNarrative }>;
  access?: AccessStamp;
  anonymised?: boolean;
  /** Login whose individual page opens first (used by `copilot user --format html`). */
  openProfile?: string;
}

const e = (value: unknown): string =>
  escapeHtml(value === null || value === undefined ? '' : String(value));
const fmt = (n: number, places = 0) =>
  n.toLocaleString('en-GB', { maximumFractionDigits: places, minimumFractionDigits: 0 });

export function profileAnchor(login: string): string {
  return `user-${login.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}

// ── Charts ──────────────────────────────────────────────────────────────────

const W = 720;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * mag) return step * mag;
  return 10 * mag;
}

function axis(max: number, labelEvery: number, days: string[]): string {
  const innerH = H - PAD.top - PAD.bottom;
  const ticks = [0, max / 2, max]
    .map((t) => {
      const y = PAD.top + innerH - (t / max) * innerH;
      return `<line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y}" y2="${y}"/>
<text class="tick" x="${PAD.left - 6}" y="${y + 4}" text-anchor="end">${e(fmt(t, max < 10 ? 1 : 0))}</text>`;
    })
    .join('');
  const step = (W - PAD.left - PAD.right) / Math.max(1, days.length);
  const labels = days
    .map((d, i) =>
      i % labelEvery === 0
        ? `<text class="tick" x="${PAD.left + step * i + step / 2}" y="${H - 6}" text-anchor="middle">${e(d.slice(5))}</text>`
        : ''
    )
    .join('');
  return ticks + labels;
}

/**
 * Single-series line over days. Non-`ok` days break the line (gaps are not
 * zeros) and are shaded. Each day has a hit column with a tooltip.
 */
export function lineChart(
  title: string,
  points: Array<{ day: string; value: number; ok: boolean; note?: string }>
): string {
  const days = points.map((p) => p.day);
  const max = niceMax(Math.max(0, ...points.filter((p) => p.ok).map((p) => p.value)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / Math.max(1, points.length);
  const x = (i: number) => PAD.left + step * i + step / 2;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  let d = '';
  let pen = false;
  points.forEach((p, i) => {
    if (!p.ok) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    pen = true;
  });
  const gaps = points
    .map((p, i) =>
      p.ok
        ? ''
        : `<rect class="gap" x="${(x(i) - step / 2).toFixed(1)}" y="${PAD.top}" width="${step.toFixed(1)}" height="${innerH}"/>`
    )
    .join('');
  const hits = points
    .map(
      (p, i) =>
        `<g class="hit" tabindex="0" data-tip="${e(`${p.day}: ${p.ok ? fmt(p.value) : (p.note ?? 'no data')}`)}">
<rect x="${(x(i) - step / 2).toFixed(1)}" y="${PAD.top}" width="${step.toFixed(1)}" height="${innerH}"/>
<line class="cross" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${PAD.top}" y2="${PAD.top + innerH}"/>
${p.ok ? `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4"/>` : ''}</g>`
    )
    .join('');
  return `<figure class="chart"><figcaption>${e(title)}</figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(title)}">${axis(max, Math.ceil(points.length / 8), days)}${gaps}
<path class="line" d="${d}"/>${hits}</svg>
${tableView(
  ['day', 'value'],
  points.map((p) => [p.day, p.ok ? fmt(p.value) : (p.note ?? 'no data')])
)}</figure>`;
}

/** Stacked daily bars of feature categories, with legend and per-segment tooltips. */
export function featureMixChart(model: CopilotUsageModel): string {
  const used = FEATURE_ORDER.filter((c) => model.featureMix.some((d) => (d[c] ?? 0) > 0));
  if (used.length === 0)
    return '<p class="muted">No feature breakdown in the reports for this period.</p>';
  const totals = model.featureMix.map((d) => used.reduce((a, c) => a + (d[c] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / Math.max(1, model.featureMix.length);
  const barW = Math.max(2, step - 2);
  const bars = model.featureMix
    .map((d, i) => {
      let base = PAD.top + innerH;
      return used
        .map((c) => {
          const v = d[c] ?? 0;
          if (v <= 0) return '';
          const h = (v / max) * innerH;
          base -= h;
          const slot = FEATURE_ORDER.indexOf(c) + 1;
          return `<rect class="seg s${slot}" tabindex="0" x="${(PAD.left + step * i + 1).toFixed(1)}" y="${base.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" data-tip="${e(`${d.day} · ${c}: ${fmt(v)}`)}"/>`;
        })
        .join('');
    })
    .join('');
  const legend = used
    .map(
      (c) => `<span class="key"><i class="sw s${FEATURE_ORDER.indexOf(c) + 1}"></i>${e(c)}</span>`
    )
    .join('');
  return `<figure class="chart"><figcaption>Interactions by feature per day</figcaption>
<div class="legend">${legend}</div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Interactions by feature per day">${axis(
    max,
    Math.ceil(model.featureMix.length / 8),
    model.featureMix.map((d) => d.day)
  )}${bars}</svg>
${tableView(
  ['day', ...used],
  model.featureMix.map((d) => [d.day, ...used.map((c) => fmt(d[c] ?? 0))])
)}</figure>`;
}

/** Horizontal bars for the top entries of one breakdown. */
export function barList(title: string, entries: BreakdownEntry[], limit = 10): string {
  if (entries.length === 0)
    return `<section class="card"><h3>${e(title)}</h3><p class="muted">No data.</p></section>`;
  const top = entries.slice(0, limit);
  const value = (x: BreakdownEntry) => x.interactions + x.codeGen;
  const max = Math.max(1, ...top.map(value));
  const rows = top
    .map(
      (
        x
      ) => `<div class="bar-row" tabindex="0" data-tip="${e(`${x.key}: ${fmt(value(x))} interactions and generations, ${x.users} user(s), acceptance ${pctCell(x.acceptanceRate) || 'n/a'}`)}">
<span class="bar-label">${e(x.key)}</span><span class="bar-track"><span class="bar" style="width:${((value(x) / max) * 100).toFixed(1)}%"></span></span><span class="bar-value">${e(fmt(value(x)))}</span></div>`
    )
    .join('');
  return `<section class="card"><h3>${e(title)}</h3>${rows}
${tableView(
  ['name', 'interactions', 'code generations', 'acceptance', 'users'],
  top.map((x) => [
    x.key,
    fmt(x.interactions),
    fmt(x.codeGen),
    pctCell(x.acceptanceRate),
    String(x.users),
  ])
)}</section>`;
}

/** Calendar heatmap (weeks × weekdays), one sequential hue. */
export function calendarHeatmap(daily: UserDailyPoint[]): string {
  if (daily.length === 0) return '';
  const values = daily.map((d) => d.interactions + d.codeGen);
  const max = Math.max(1, ...values);
  const first = new Date(`${daily[0].day}T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const cell = 14;
  const cells = daily
    .map((d, i) => {
      const pos = i + offset;
      const col = Math.floor(pos / 7);
      const row = pos % 7;
      const v = values[i];
      const level = v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999));
      const noData = d.status !== 'ok';
      const tip = noData
        ? `${d.day}: no data (${d.status})`
        : `${d.day}: ${fmt(v)}${d.flags.length > 0 ? ' (data may be incomplete)' : ''}`;
      return `<rect class="cal ${noData ? 'nodata' : `l${level}`}" tabindex="0" x="${col * (cell + 2) + 28}" y="${row * (cell + 2)}" width="${cell}" height="${cell}" rx="3" data-tip="${e(tip)}"/>`;
    })
    .join('');
  const weeks = Math.ceil((daily.length + offset) / 7);
  const labels = ['Mon', '', 'Wed', '', 'Fri', '', '']
    .map((l, r) => (l ? `<text class="tick" x="0" y="${r * (cell + 2) + 11}">${l}</text>` : ''))
    .join('');
  return `<figure class="chart"><figcaption>Daily activity</figcaption>
<svg viewBox="0 0 ${weeks * (cell + 2) + 30} ${7 * (cell + 2)}" width="${weeks * (cell + 2) + 30}" height="${7 * (cell + 2)}" class="calendar" role="img" aria-label="Daily activity calendar">${labels}${cells}</svg>
<div class="legend"><span class="key">Less</span>${[0, 1, 2, 3, 4, 5].map((l) => `<i class="sw cal l${l}"></i>`).join('')}<span class="key">More</span><span class="key"><i class="sw nodata-key"></i>No data</span></div></figure>`;
}

function tableView(headers: string[], rows: string[][]): string {
  return `<details class="table-view"><summary>Show table</summary><div class="scroll"><table><thead><tr>${headers
    .map((h) => `<th>${e(h)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div></details>`;
}

function table(
  headers: string[],
  rows: string[][],
  options: { id?: string; raw?: boolean } = {}
): string {
  if (rows.length === 0) return '<p class="muted">None.</p>';
  return `<div class="scroll"><table${options.id ? ` id="${e(options.id)}"` : ''}><thead><tr>${headers
    .map((h) => `<th>${e(h)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${options.raw ? c : e(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function tile(label: string, value: string, note = ''): string {
  return `<div class="tile"><div class="tile-label">${e(label)}</div><div class="tile-value">${e(value)}</div>${note ? `<div class="tile-note">${e(note)}</div>` : ''}</div>`;
}

// ── Sections ────────────────────────────────────────────────────────────────

function funnel(model: CopilotUsageModel): string {
  const k = model.kpis;
  const steps = [
    ['Seats', k.seats],
    ['Active', k.activeUsers],
    ['Engaged (chat or agent)', k.engagedUsers],
    ['Power users', model.cohorts.power],
  ] as const;
  const max = Math.max(1, ...steps.map(([, v]) => v));
  return `<section class="card"><h3>Adoption funnel</h3>${steps
    .map(
      ([label, v], i) =>
        `<div class="bar-row" tabindex="0" data-tip="${e(`${label}: ${v}`)}"><span class="bar-label">${e(label)}</span><span class="bar-track"><span class="bar f${i}" style="width:${((v / max) * 100).toFixed(1)}%"></span></span><span class="bar-value">${e(fmt(v))}</span></div>`
    )
    .join('')}</section>`;
}

function userLink(login: string, linked: Set<string>): string {
  return linked.has(login.toLowerCase())
    ? `<a href="#${e(profileAnchor(login))}">${e(login)}</a>`
    : e(login);
}

function profileSection(
  item: { profile: CopilotUserProfile; narrative?: UserNarrative },
  access?: AccessStamp
): string {
  const p = item.profile;
  const t = p.totals;
  const a = p.activity;
  const features = FEATURE_ORDER.filter((c) => (p.featureTotals[c] ?? 0) > 0);
  const featureMax = Math.max(1, ...features.map((c) => p.featureTotals[c] ?? 0));
  return `<section class="profile" id="${e(profileAnchor(p.login))}">
<p><a href="#top">← Back to dashboard</a></p>
<h2>${e(p.login)}</h2>
<p class="muted">${e(p.range.from)} to ${e(p.range.to)} · Usage figures describe tool use, not productivity or performance.</p>
<div class="tiles">
${tile('Active days', fmt(a.activeDays), `${a.activeDaysPerWeek.toFixed(1)} per week`)}
${tile('Streak', fmt(a.currentStreak), `longest ${a.longestStreak}`)}
${tile('Interactions', fmt(t?.interactions ?? 0))}
${tile('Acceptance', pctCell(t?.acceptanceRate ?? null) || 'n/a')}
${tile('AI credits', fmt(p.spend.aiCreditsUsed, 1), p.spend.shareOfScope === null ? '' : `${pctCell(p.spend.shareOfScope)} of total`)}
${tile('Last active', a.lastActiveDay ?? 'never')}
</div>
<div class="grid2">
<section class="card"><h3>Seat</h3>${table(
    ['org', 'assigned by', 'plan', 'last activity', 'editor'],
    p.seat.current.map((s) => [
      s.org,
      s.assigningTeam ? `team:${s.assigningTeam}` : 'direct',
      s.planType ?? '',
      s.lastActivityAt?.slice(0, 10) ?? 'never',
      s.lastActivityEditor ?? '',
    ])
  )}<p>Billed org: ${e(p.seat.billedOrg ?? 'not reported by the API')}${p.teams.length > 0 ? ` · Teams: ${e(p.teams.join(', '))}` : ''}${p.seat.costCentres.length > 0 ? ` · Cost centres: ${e(p.seat.costCentres.join(', '))}` : ''}</p>
${p.seat.history.length > 0 ? `<p class="muted">History: ${e(p.seat.history.map((h) => `${h.day} ${h.event} ${h.org}`).join('; '))}</p>` : ''}</section>
<section class="card"><h3>Features</h3>${
    features
      .map(
        (c) =>
          `<div class="bar-row" tabindex="0" data-tip="${e(`${c}: ${fmt(p.featureTotals[c] ?? 0)} (first used ${p.featureFirstUsed[c] ?? '?'})`)}"><span class="bar-label"><i class="sw s${FEATURE_ORDER.indexOf(c) + 1}"></i>${e(c)}</span><span class="bar-track"><span class="bar s${FEATURE_ORDER.indexOf(c) + 1}" style="width:${(((p.featureTotals[c] ?? 0) / featureMax) * 100).toFixed(1)}%"></span></span><span class="bar-value">${e(fmt(p.featureTotals[c] ?? 0))}</span></div>`
      )
      .join('') || '<p class="muted">No feature data.</p>'
  }
${p.untriedFeatures.length > 0 ? `<p>Not yet tried, though most peers use: ${e(p.untriedFeatures.join(', '))}</p>` : ''}</section>
</div>
${calendarHeatmap(a.daily)}
${lineChart(
  'Interactions and code generations per day',
  a.daily.map((d) => ({
    day: d.day,
    value: d.interactions + d.codeGen,
    ok: d.status === 'ok',
    note: d.status,
  }))
)}
<div class="grid2">
${barList('IDEs', p.breakdowns.ide, 5)}
${barList('Languages', p.breakdowns.language, 8)}
${barList('Models', p.breakdowns.model, 5)}
${barList('Clients', p.breakdowns.client, 5)}
</div>
<section class="card"><h3>Compared with peers</h3>${table(
    ['group', 'size', 'activity percentile', 'acceptance percentile', 'spend percentile'],
    p.peers.map((x) => [
      x.group,
      String(x.size),
      String(x.activityPercentile),
      x.acceptancePercentile === null ? 'n/a' : String(x.acceptancePercentile),
      String(x.spendPercentile),
    ])
  )}<p class="muted">Groups smaller than five people are left out.</p></section>
<section class="card"><h3>Copilot coding agent</h3><p>${p.agentPrs.requested} PR(s) requested, ${p.agentPrs.merged} merged (${p.agentPrs.mergedWithoutHumanApproval} without human approval), ${p.agentPrs.reviewed} reviewed${p.agentPrs.medianHoursToMerge === null ? '' : `, median ${p.agentPrs.medianHoursToMerge.toFixed(1)} hours to merge`}.</p></section>
${item.narrative ? `<section class="card"><h3>${item.narrative.source === 'ai' ? 'AI summary' : 'Summary'}</h3><p>${e(item.narrative.summary)}</p><ul>${item.narrative.nextSteps.map((s) => `<li>${e(s)}</li>`).join('')}</ul></section>` : ''}
${p.dataQuality.flaggedDays.length > 0 ? `<p class="note">⚠ ${p.dataQuality.flaggedDays.length} day(s) may under-report usage because of telemetry or client-version gaps.</p>` : ''}
${access ? `<p class="stamp">Individual data viewed by ${e(access.viewer)} at ${e(access.viewedAt)} (reason: ${e(access.reasonCode)}).</p>` : ''}
</section>`;
}

// ── Page ────────────────────────────────────────────────────────────────────

export function generateCopilotHtml(input: HtmlReportInput): string {
  const { model } = input;
  const k = model.kpis;
  const linked = new Set((input.profiles ?? []).map((p) => p.profile.login.toLowerCase()));
  const findings = input.findings ?? [];
  const title = `Copilot Insights · ${scopeSlug(model.scope)}`;
  const q = model.dataQuality;
  const notes: string[] = [];
  if (q.suppressedDays.length > 0)
    notes.push(`${q.suppressedDays.length} day(s) suppressed (fewer than five licensed users)`);
  if (q.missingDays.length > 0) notes.push(`${q.missingDays.length} day(s) with no report`);
  if (q.flaggedDays.length > 0)
    notes.push(`${q.flaggedDays.length} day(s) with telemetry or client-version gaps`);

  const narrative = input.narrative
    ? `<section class="card"><h3>${input.narrative.source === 'ai' ? 'AI summary' : 'Summary'}</h3>
<p><strong>${e(input.narrative.headline)}</strong></p><p>${e(input.narrative.adoption)}</p><p>${e(input.narrative.engagement)}</p><p>${e(input.narrative.spend)}</p>
${input.narrative.risks.length > 0 ? `<h4>Risks</h4><ul>${input.narrative.risks.map((r) => `<li>${e(r)}</li>`).join('')}</ul>` : ''}
${input.narrative.recommendations.length > 0 ? `<h4>Recommendations</h4><ol>${input.narrative.recommendations.map((r) => `<li>${e(r)}</li>`).join('')}</ol>` : ''}</section>`
    : '';

  const enterprise =
    model.scope.kind === 'enterprise'
      ? `<h2>Organisations</h2><section class="card">${table(
          [
            'org',
            'seats',
            'active',
            'active rate',
            'interactions',
            'acceptance',
            'credits',
            'credits per active user',
          ],
          model.orgs.map((o) => [
            o.org,
            fmt(o.seats),
            fmt(o.activeUsers),
            pctCell(o.activeRate),
            fmt(o.interactions),
            pctCell(o.acceptanceRate),
            fmt(o.aiCreditsUsed, 1),
            o.creditsPerActiveUser === null ? '' : fmt(o.creditsPerActiveUser, 1),
          ])
        )}</section>
${model.spend.byCostCentre.length > 0 ? `<section class="card"><h3>Cost centres</h3>${table(['cost centre', 'credits'], [...model.spend.byCostCentre.map((c) => [c.name, fmt(c.aiCreditsUsed, 1)]), ['(none)', fmt(model.spend.unallocatedCredits, 1)]])}</section>` : ''}
${
  model.seats.multiOrgUsers.length > 0
    ? `<section class="card"><h3>People with seats in several organisations</h3>${table(
        ['login', 'orgs'],
        model.seats.multiOrgUsers.map((u) => [userLink(u.login, linked), e(u.orgs.join(', '))]),
        { raw: true }
      )}</section>`
    : ''
}`
      : '';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<title>${e(title)}</title>
<style>${STYLES}</style>
</head>
<body id="top"${input.openProfile ? ` data-open="${e(profileAnchor(input.openProfile))}"` : ''}>
<main>
<header>
<h1>${e(title)}</h1>
<p class="muted">${e(model.scope.kind)} · ${e(model.range.from)} to ${e(model.range.to)} · generated ${e(model.generatedAt.slice(0, 16).replace('T', ' '))} UTC${input.anonymised ? ' · logins pseudonymised' : ''}</p>
${notes.length > 0 ? `<p class="note">⚠ Data quality: ${e(notes.join('; '))}. Gaps are shown as gaps, not as zero usage.</p>` : ''}
</header>
<div class="tiles">
${tile('Seats', fmt(k.seats))}
${tile('Active users', fmt(k.activeUsers), k.activeRate === null ? '' : `${pctCell(k.activeRate)} of seats`)}
${tile('Engaged users', fmt(k.engagedUsers), 'used chat or agent mode')}
${tile('Acceptance rate', pctCell(k.acceptanceRate) || 'n/a')}
${tile('Lines accepted', fmt(k.locAccepted))}
${tile(model.spend.unit, fmt(k.aiCreditsUsed, 1), `forecast net ${fmt(model.spend.monthToDate.forecastNetAmount, 2)} for ${model.spend.monthToDate.month}`)}
</div>
${narrative}
<h2>Adoption</h2>
<div class="grid2">${funnel(model)}
<section class="card"><h3>Cohorts</h3>${table(
    ['cohort', 'people'],
    [
      ['power (top 10%)', fmt(model.cohorts.power)],
      ['regular', fmt(model.cohorts.regular)],
      ['casual (under 20% of days)', fmt(model.cohorts.casual)],
      ['dormant (no activity)', fmt(model.cohorts.dormant)],
    ]
  )}</section></div>
${lineChart(
  'Daily active users',
  model.daily.map((d) => ({
    day: d.day,
    value: d.activeUsers,
    ok: d.status === 'ok',
    note: d.status,
  }))
)}
<h2>How Copilot is used</h2>
${featureMixChart(model)}
<div class="grid2">
${barList('Features', model.breakdowns.feature)}
${barList('IDEs', model.breakdowns.ide)}
${barList('Languages', model.breakdowns.language)}
${barList('Models', model.breakdowns.model)}
${barList('Clients', model.breakdowns.client)}
</div>
${
  model.anomalies.length > 0
    ? `<section class="card"><h3>Unusual days</h3>${table(
        ['day', 'metric', 'value', 'usual'],
        model.anomalies.slice(0, 10).map((a) => [a.day, a.metric, fmt(a.value), fmt(a.mean, 1)])
      )}</section>`
    : ''
}
${enterprise}
<h2>Teams</h2>
<section class="card">${table(
    ['team', 'members', 'active', 'interactions', 'acceptance', 'credits'],
    model.teams.map((t) => [
      t.slug,
      fmt(t.members),
      fmt(t.activeUsers),
      fmt(t.interactions),
      pctCell(t.acceptanceRate),
      fmt(t.aiCreditsUsed, 1),
    ])
  )}<p class="muted">People in several teams count once in each team.</p></section>
<h2>People</h2>
<section class="card">${table(
    [
      'login',
      'cohort',
      'active days',
      'interactions',
      'acceptance',
      'agent turns',
      'credits',
      'last active',
    ],
    model.users
      .slice(0, 200)
      .map((u) => [
        userLink(u.login, linked),
        e(u.cohort),
        e(fmt(u.activeDays)),
        e(fmt(u.interactions)),
        e(pctCell(u.acceptanceRate)),
        e(fmt(u.agentTurns)),
        e(fmt(u.aiCreditsUsed, 1)),
        e(u.lastActiveDay ?? 'never'),
      ]),
    { raw: true }
  )}</section>
<h2>Seats</h2>
<section class="card">
<div class="filters"><label>Filter <input type="search" id="seat-filter" placeholder="login, org or team"></label>
<label><input type="checkbox" id="seat-idle"> Idle only</label></div>
${table(
  ['login', 'org', 'assigned by', 'last activity', 'editor', 'idle days'],
  model.seats.all.map((s) => [
    userLink(s.login, linked),
    e(s.org),
    e(s.assigningTeam ? `team:${s.assigningTeam}` : 'direct'),
    e(s.lastActivityAt?.slice(0, 10) ?? 'never'),
    e(s.lastActivityEditor ?? ''),
    e(s.idleDays === null ? 'never used' : String(s.idleDays)),
  ]),
  { id: 'seat-table', raw: true }
)}</section>
<h2>Spend</h2>
<div class="grid2">
<section class="card"><h3>By model (${e(model.spend.unit)})</h3>${table(
    ['model', 'quantity', 'net'],
    model.spend.byModel.map((m) => [m.model, fmt(m.quantity, 1), fmt(m.netAmount, 2)])
  )}</section>
<section class="card"><h3>${e(model.spend.monthToDate.month)}</h3><p>Month-to-date net ${e(fmt(model.spend.monthToDate.netAmount, 2))}; forecast ${e(fmt(model.spend.monthToDate.forecastNetAmount, 2))}.</p></section>
</div>
${
  model.spend.byDay.length > 0
    ? lineChart(
        'Net spend per day',
        model.spend.byDay.map((d) => ({ day: d.day, value: d.netAmount, ok: true }))
      )
    : ''
}
<h2>Copilot coding agent</h2>
<section class="card"><p>${fmt(model.agentPrs.opened)} PR(s) opened, ${fmt(model.agentPrs.merged)} merged${model.agentPrs.medianHoursToMerge === null ? '' : `, median ${model.agentPrs.medianHoursToMerge.toFixed(1)} hours to merge`}.</p>
${
  model.agentPrs.mergedWithoutHumanApproval.length > 0
    ? `<h4>Merged without a human approval</h4>${table(
        ['PR', 'title', 'requested by', 'merged'],
        model.agentPrs.mergedWithoutHumanApproval.map((p) => [
          e(`${p.repo}#${p.number}`),
          e(p.title),
          p.requestedBy ? userLink(p.requestedBy, linked) : '',
          e(p.mergedAt.slice(0, 10)),
        ]),
        { raw: true }
      )}`
    : ''
}</section>
<h2>Governance findings (${findings.length})</h2>
<section class="card">${table(
    ['severity', 'control', 'finding'],
    findings.map((f) => [f.severity, String(f.details.control_id ?? ''), f.description])
  )}</section>
${(input.profiles ?? []).map((p) => profileSection(p, input.access)).join('\n')}
${input.access ? `<p class="stamp">This report contains named individuals' data. Viewed by ${e(input.access.viewer)} at ${e(input.access.viewedAt)} (reason: ${e(input.access.reasonCode)}).</p>` : ''}
</main>
<div id="tip" role="tooltip" hidden></div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

// Categorical slots follow the validated reference palette (light and dark
// steps of the same eight hues, in a CVD-checked order). Text uses neutral
// inks that meet WCAG AAA on both surfaces.
const STYLES = `
:root{color-scheme:light;--bg:#f6f6f6;--surface:#ffffff;--surface-2:#efefef;--text:#191919;--text-2:#595959;--grid:#e3e3e3;--accent:#1757ac;--note-bg:#fff4d6;
--s1:#257de0;--s2:#f47230;--s3:#00b894;--s4:#f2a600;--s5:#ee7fac;--s6:#008a17;--s7:#6a4ce2;--s8:#ec4647;
--q1:#cce3fd;--q2:#84b9f3;--q3:#338ced;--q4:#1b64be;--q5:#0e3d7e}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--bg:#111111;--surface:#191919;--surface-2:#262626;--text:#efefef;--text-2:#b3b3b3;--grid:#333333;--accent:#84b9f3;--note-bg:#3a2f12;
--s1:#338ced;--s2:#e76624;--s3:#00a888;--s4:#d28e05;--s5:#e24d8b;--s6:#0aac23;--s7:#9887ef;--s8:#eb6263;
--q1:#0e3d7e;--q2:#1757ac;--q3:#2370cd;--q4:#519ced;--q5:#9dc8f7}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#111111;--surface:#191919;--surface-2:#262626;--text:#efefef;--text-2:#b3b3b3;--grid:#333333;--accent:#84b9f3;--note-bg:#3a2f12;
--s1:#338ced;--s2:#e76624;--s3:#00a888;--s4:#d28e05;--s5:#e24d8b;--s6:#0aac23;--s7:#9887ef;--s8:#eb6263;
--q1:#0e3d7e;--q2:#1757ac;--q3:#2370cd;--q4:#519ced;--q5:#9dc8f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:32px 0 12px}h3{font-size:16px;margin:0 0 10px}h4{margin:12px 0 6px}
a{color:var(--accent)}.muted{color:var(--text-2)}.note{background:var(--note-bg);padding:8px 12px;border-radius:6px}.stamp{color:var(--text-2);font-size:13px;border-top:1px solid var(--grid);padding-top:8px;margin-top:24px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.tile,.card,.chart{background:var(--surface);border-radius:8px;padding:14px 16px;margin:0 0 12px}.tile-label{color:var(--text-2);font-size:13px}.tile-value{font-size:24px;font-weight:600}.tile-note{color:var(--text-2);font-size:12px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
figure{margin:0}figcaption{font-weight:600;margin-bottom:6px}svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.tick{fill:var(--text-2);font-size:11px}
.line{fill:none;stroke:var(--s1);stroke-width:2;stroke-linejoin:round}.gap{fill:var(--surface-2)}
.hit rect{fill:transparent}.hit .cross{stroke:var(--text-2);stroke-width:1;opacity:0}.hit .dot{fill:var(--s1);stroke:var(--surface);stroke-width:2;opacity:0}
.hit:hover .cross,.hit:focus .cross,.hit:hover .dot,.hit:focus .dot{opacity:1}.hit:focus{outline:none}
.seg{stroke:var(--surface);stroke-width:1}
.s1{fill:var(--s1);background:var(--s1)}.s2{fill:var(--s2);background:var(--s2)}.s3{fill:var(--s3);background:var(--s3)}.s4{fill:var(--s4);background:var(--s4)}
.s5{fill:var(--s5);background:var(--s5)}.s6{fill:var(--s6);background:var(--s6)}.s7{fill:var(--s7);background:var(--s7)}.s8{fill:var(--s8);background:var(--s8)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:4px 0 8px;font-size:13px;align-items:center}.key{display:inline-flex;align-items:center;gap:6px}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle;margin-right:4px}
.bar-row{display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;gap:8px;align-items:center;padding:3px 0;font-size:14px}
.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar-track{background:var(--surface-2);border-radius:4px;height:12px;overflow:hidden}
.bar{display:block;height:100%;background:var(--s1);border-radius:0 4px 4px 0}.bar-value{font-variant-numeric:tabular-nums;min-width:48px;text-align:right}
.f0{background:var(--q2)}.f1{background:var(--q3)}.f2{background:var(--q4)}.f3{background:var(--q5)}
.cal{fill:var(--surface-2)}.cal.l0{fill:var(--surface-2);background:var(--surface-2)}.cal.l1{fill:var(--q1);background:var(--q1)}.cal.l2{fill:var(--q2);background:var(--q2)}.cal.l3{fill:var(--q3);background:var(--q3)}.cal.l4{fill:var(--q4);background:var(--q4)}.cal.l5{fill:var(--q5);background:var(--q5)}
svg.calendar{width:auto;max-width:100%;height:auto}.cal.nodata{fill:none;stroke:var(--text-2);stroke-dasharray:2 2}.nodata-key{border:1px dashed var(--text-2);background:transparent}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--grid);white-space:nowrap}th{color:var(--text-2);font-weight:600}
.table-view summary{cursor:pointer;color:var(--accent);font-size:13px;margin-top:6px}
.filters{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}input[type=search]{background:var(--surface-2);color:var(--text);border:1px solid var(--grid);border-radius:6px;padding:4px 8px}
.profile{display:none}.profile:target{display:block}main:has(.profile:target)>:not(.profile):not(.stamp){display:none}
#tip{position:fixed;pointer-events:none;background:var(--text);color:var(--surface);padding:6px 9px;border-radius:6px;font-size:13px;max-width:320px;z-index:10}
[tabindex]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (max-width:600px){.bar-row{grid-template-columns:minmax(70px,35%) 1fr auto}}
`;

const SCRIPT = `
(function(){
var open=document.body.getAttribute('data-open');if(open&&!location.hash){location.hash=open;}
var tip=document.getElementById('tip');
function show(el,x,y){tip.textContent=el.getAttribute('data-tip');tip.hidden=false;var w=tip.offsetWidth,h=tip.offsetHeight;
tip.style.left=Math.min(window.innerWidth-w-8,Math.max(8,x+12))+'px';tip.style.top=Math.max(8,y-h-12)+'px';}
function hide(){tip.hidden=true;}
document.addEventListener('mousemove',function(ev){var el=ev.target.closest&&ev.target.closest('[data-tip]');if(el){show(el,ev.clientX,ev.clientY);}else{hide();}});
document.addEventListener('focusin',function(ev){var el=ev.target.closest&&ev.target.closest('[data-tip]');if(el){var r=el.getBoundingClientRect();show(el,r.left+r.width/2,r.top);}});
document.addEventListener('focusout',hide);
var f=document.getElementById('seat-filter'),idle=document.getElementById('seat-idle'),t=document.getElementById('seat-table');
function apply(){if(!t)return;var q=(f&&f.value||'').toLowerCase();var rows=t.tBodies[0].rows;for(var i=0;i<rows.length;i++){var r=rows[i];
var idleDays=r.cells[5].textContent;var isIdle=idleDays==='never used'||Number(idleDays)>30;
r.hidden=(q&&r.textContent.toLowerCase().indexOf(q)<0)||(idle&&idle.checked&&!isIdle);}}
if(f)f.addEventListener('input',apply);if(idle)idle.addEventListener('change',apply);
})();
`;
