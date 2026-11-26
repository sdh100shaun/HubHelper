/**
 * `hubhelper copilot …` commands.
 *
 * Dependencies are injected so every command can be tested without network
 * access. Raw output (JSON, CSV, Markdown, HTML) goes to stdout; progress,
 * warnings and errors go to stderr so piped output stays clean.
 *
 * Any output naming individuals requires a validated reason, recorded in the
 * access log before the output is produced.
 *
 * @module cli/copilot-command
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Command, Option } from 'commander';
import { PolicyEngine } from '../policy/engine.js';
import { CopilotConsoleReporter, formatTable } from '../reporters/copilot-console-reporter.js';
import {
  type AccessStamp,
  anonymiseModel,
  profileRows,
  type Row,
  type SpendView,
  seatRows,
  spendRows,
  toCsv,
  toJson,
  toMarkdown,
  type UsageView,
  type UserSort,
  usageRows,
  userRows,
} from '../reporters/copilot-export.js';
import { generateCopilotHtml } from '../reporters/copilot-html-reporter.js';
import {
  AccessLog,
  type AccessReason,
  type AccessSubject,
  assertReadOnlySql,
  loginDigest,
  REASON_CODES,
  resolveReason,
  sanitiseCommand,
  sqlReadsUserData,
} from '../services/copilot/access-control.js';
import { type CopilotApi, createCopilotApi } from '../services/copilot/api.js';
import {
  type DateRange,
  isValidDay,
  monthRange,
  resolveRange,
  toDay,
} from '../services/copilot/dates.js';
import { CopilotInsightsService } from '../services/copilot/insights-service.js';
import type { CopilotUsageModel } from '../services/copilot/model.js';
import { CopilotStore } from '../services/copilot/store/copilot-store.js';
import { defaultDatabasePath } from '../services/copilot/store/database.js';
import { CopilotSyncService } from '../services/copilot/sync-service.js';
import { CopilotUsageAggregator } from '../services/copilot/usage-aggregator.js';
import { CopilotUserProfileBuilder, compareProfiles } from '../services/copilot/user-profile.js';
import {
  type AuthConfig,
  createGitHubClient,
  resolveAuthFromEnv,
} from '../services/github-auth.js';
import { type CopilotScope, scopeSlug } from '../types/copilot.js';
import type { SecurityIssue } from '../types/index.js';
import { validateGitHubToken, validateOrganizationName } from '../utils/input-validator.js';
import { validateFilePath } from '../utils/path-validator.js';

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

export interface CopilotCliDeps {
  resolveAuth(token?: string): AuthConfig;
  createApi(auth: AuthConfig): CopilotApi;
  openStore(dbPath: string, readOnly?: boolean): CopilotStore;
  resolveViewer(auth: AuthConfig | null): Promise<string>;
  createInsights(model?: string): CopilotInsightsService;
  now(): Date;
  stdout(text: string): void;
  stderr(text: string): void;
  writeFile(filePath: string, content: string): void;
  isInteractive(): boolean;
  prompt(question: string): Promise<string>;
  confirm(question: string): Promise<boolean>;
  argv(): string[];
  env: NodeJS.ProcessEnv;
}

// ── Default dependencies ────────────────────────────────────────────────────

function defaultResolveAuth(token?: string): AuthConfig {
  if (token) {
    const v = validateGitHubToken(token);
    if (!v.valid) throw new CliError(v.error ?? 'Invalid token');
    return { mode: 'pat', token: v.sanitized as string };
  }
  const auth = resolveAuthFromEnv();
  if (auth.mode === 'pat') {
    const v = validateGitHubToken(auth.token);
    if (!v.valid) throw new CliError(v.error ?? 'Invalid token');
  }
  return auth;
}

async function defaultResolveViewer(auth: AuthConfig | null): Promise<string> {
  if (auth?.mode === 'app') return `app:${auth.appId}`;
  if (auth?.mode === 'pat') {
    try {
      const response = await createGitHubClient(auth).request('GET /user');
      const login = (response.data as { login?: unknown }).login;
      if (typeof login === 'string') return login;
    } catch {
      // fall back to the local account name
    }
  }
  return `local:${os.userInfo().username}`;
}

export function defaultDeps(): CopilotCliDeps {
  return {
    resolveAuth: defaultResolveAuth,
    createApi: (auth) => createCopilotApi(createGitHubClient(auth)),
    openStore: (dbPath, readOnly) => CopilotStore.open(dbPath, { readOnly }),
    resolveViewer: defaultResolveViewer,
    createInsights: (model) => new CopilotInsightsService({ model }),
    now: () => new Date(),
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (filePath, content) => {
      writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
    },
    isInteractive: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
    prompt: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    confirm: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
      } finally {
        rl.close();
      }
    },
    argv: () => process.argv.slice(2),
    env: process.env,
  };
}

// ── Option parsing ──────────────────────────────────────────────────────────

interface CommonOptions {
  org?: string;
  enterprise?: string;
  orgs?: string;
  token?: string;
  db?: string;
  offline?: boolean;
  days?: string;
  from?: string;
  to?: string;
  format?: string;
  output?: string;
  reason?: string;
  reasonCode?: string;
  anonymise?: boolean;
}

export function parseScope(options: CommonOptions, env: NodeJS.ProcessEnv): CopilotScope {
  if (options.org && options.enterprise) {
    throw new CliError('Use either --org or --enterprise, not both');
  }
  const enterprise = options.enterprise ?? (options.org ? undefined : env.GITHUB_ENTERPRISE);
  const name = (value: string, label: string) => {
    const v = validateOrganizationName(value);
    if (!v.valid) throw new CliError(`${label}: ${v.error}`);
    return v.sanitized as string;
  };
  if (enterprise) {
    const orgs = options.orgs
      ? options.orgs
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
          .map((o) => name(o, '--orgs'))
      : undefined;
    return { kind: 'enterprise', enterprise: name(enterprise, 'Enterprise'), orgs };
  }
  const org = options.org ?? env.GITHUB_ORG;
  if (!org) {
    throw new CliError(
      'Give --org <org> or --enterprise <slug> (or set GITHUB_ORG / GITHUB_ENTERPRISE)'
    );
  }
  if (options.orgs) throw new CliError('--orgs only applies with --enterprise');
  return { kind: 'org', org: name(org, 'Organisation') };
}

export function parseRange(options: CommonOptions, now: Date, defaultDays = 28): DateRange {
  let days = defaultDays;
  if (options.days !== undefined) {
    if (!/^\d+$/.test(options.days)) throw new CliError('--days must be a whole number');
    days = Number(options.days);
    if (days < 1 || days > 730) throw new CliError('--days must be between 1 and 730');
  }
  for (const [flag, value] of [
    ['--from', options.from],
    ['--to', options.to],
  ] as const) {
    if (value !== undefined && !isValidDay(value)) {
      throw new CliError(`${flag} must be a valid day in YYYY-MM-DD format`);
    }
  }
  try {
    return resolveRange({ days, from: options.from, to: options.to }, now);
  } catch (error) {
    throw new CliError((error as Error).message);
  }
}

export function resolveDbPath(dbOption: string | undefined, env: NodeJS.ProcessEnv): string {
  const chosen = dbOption ?? env.HUBHELPER_COPILOT_DB;
  if (!chosen) return defaultDatabasePath();
  if (chosen.includes('\0')) throw new CliError('Invalid --db path');
  const resolved = path.resolve(chosen);
  if (!/\.(db|sqlite|sqlite3)$/i.test(resolved)) {
    throw new CliError('--db must end in .db, .sqlite or .sqlite3');
  }
  return resolved;
}

function outputPath(output: string, extensions: string[]): string {
  try {
    return validateFilePath(output, { allowedExtensions: extensions, createDirIfMissing: true });
  } catch (error) {
    throw new CliError(`Invalid --output: ${(error as Error).message}`);
  }
}

const FORMATS = ['console', 'json', 'csv', 'md', 'html'] as const;
type Format = (typeof FORMATS)[number];

function parseFormat(value: string | undefined, allowed: readonly Format[] = FORMATS): Format {
  const format = (value ?? 'console') as Format;
  if (!allowed.includes(format)) {
    throw new CliError(`--format must be one of: ${allowed.join(', ')}`);
  }
  return format;
}

function addCommonOptions(
  cmd: Command,
  extras: { range?: boolean; format?: boolean } = {}
): Command {
  cmd
    .option('-o, --org <org>', 'GitHub organisation')
    .option('-e, --enterprise <slug>', 'GitHub enterprise')
    .option('--orgs <list>', 'With --enterprise: comma-separated member orgs to include')
    .option('-t, --token <token>', 'GitHub token (defaults to GITHUB_TOKEN or GitHub App env vars)')
    .option('--db <path>', 'SQLite database path (default ~/.hubhelper/copilot.db)')
    .option('--offline', 'Use stored data only; do not fetch missing days');
  if (extras.range !== false) {
    cmd
      .option('-d, --days <n>', 'Number of days ending yesterday', undefined)
      .option('--from <day>', 'First day (YYYY-MM-DD)')
      .option('--to <day>', 'Last day (YYYY-MM-DD, default yesterday)');
  }
  if (extras.format !== false) {
    cmd.option('-f, --format <format>', 'console, json, csv, md or html', 'console');
    cmd.option('--output <file>', 'Write output to a file instead of stdout');
  }
  return cmd;
}

function addReasonOptions(cmd: Command): Command {
  return cmd
    .option('--reason <text>', 'Why you need to see named individuals (recorded in the access log)')
    .addOption(
      new Option('--reason-code <code>', 'Reason category')
        .choices([...REASON_CODES])
        .default('other')
    );
}

// ── Command context ─────────────────────────────────────────────────────────

class Context {
  readonly reporter: CopilotConsoleReporter;
  private store: CopilotStore | null = null;
  private auth: AuthConfig | null | undefined;

  constructor(
    readonly deps: CopilotCliDeps,
    readonly options: CommonOptions
  ) {
    this.reporter = new CopilotConsoleReporter((line) => deps.stdout(`${line}\n`));
  }

  get scope(): CopilotScope {
    return parseScope(this.options, this.deps.env);
  }

  range(defaultDays = 28): DateRange {
    return parseRange(this.options, this.deps.now(), defaultDays);
  }

  openStore(readOnly = false): CopilotStore {
    if (!this.store) {
      this.store = this.deps.openStore(resolveDbPath(this.options.db, this.deps.env), readOnly);
    }
    return this.store;
  }

  authConfig(): AuthConfig {
    if (this.auth) return this.auth;
    try {
      this.auth = this.deps.resolveAuth(this.options.token);
    } catch (error) {
      throw new CliError(
        `${(error as Error).message}. Set GITHUB_TOKEN, or use --offline to read stored data.`
      );
    }
    return this.auth;
  }

  progress(message: string): void {
    this.deps.stderr(`… ${message}\n`);
  }

  /** Fetch missing days unless --offline. */
  async ensureSynced(range: DateRange): Promise<void> {
    if (this.options.offline) return;
    const store = this.openStore();
    const service = new CopilotSyncService(this.deps.createApi(this.authConfig()), store, () =>
      this.deps.now()
    );
    const summary = await service.sync(this.scope, {
      range,
      onProgress: (m) => this.progress(m),
    });
    for (const warning of summary.warnings) this.deps.stderr(`⚠ ${warning}\n`);
  }

  buildModel(range: DateRange): CopilotUsageModel {
    return new CopilotUsageAggregator(this.openStore(), () => this.deps.now()).build(
      this.scope,
      range
    );
  }

  async viewer(): Promise<string> {
    let auth: AuthConfig | null = null;
    try {
      auth = this.auth ?? this.deps.resolveAuth(this.options.token);
    } catch {
      auth = null;
    }
    return this.deps.resolveViewer(auth);
  }

  /** Obtain a reason (flag or prompt). Throws if none can be had. */
  async reason(): Promise<AccessReason> {
    try {
      return await resolveReason({
        reason: this.options.reason,
        reasonCode: this.options.reasonCode,
        interactive: this.deps.isInteractive(),
        prompt: (q) => this.deps.prompt(q),
      });
    } catch (error) {
      throw new CliError((error as Error).message);
    }
  }

  /** Record a view of individuals' data and return the stamp for the output. */
  async recordAccess(reason: AccessReason, subjects: AccessSubject[]): Promise<AccessStamp> {
    const store = this.openStore();
    const viewer = await this.viewer();
    const now = this.deps.now();
    new AccessLog(store).record({
      viewer,
      scopeId: store.getScopeId(this.scope) ?? null,
      command: sanitiseCommand(this.deps.argv()),
      reason,
      subjects,
      now,
    });
    return { viewer, viewedAt: now.toISOString(), reasonCode: reason.code };
  }

  emit(content: string, format: Format): void {
    if (this.options.output) {
      const ext = format === 'md' ? '.md' : `.${format === 'console' ? 'txt' : format}`;
      const file = outputPath(this.options.output, [ext]);
      this.deps.writeFile(file, content);
      this.deps.stderr(`✓ Written to ${file}\n`);
    } else {
      this.deps.stdout(content);
    }
  }

  emitRows(title: string, rows: Row[], format: Format, stamp?: AccessStamp, value?: unknown): void {
    if (format === 'json') this.emit(toJson(value ?? rows, stamp), format);
    else if (format === 'csv') this.emit(toCsv(rows, stamp), format);
    else if (format === 'md')
      this.emit(toMarkdown(title, [{ heading: title, rows }], stamp), format);
    else if (format === 'console') {
      if (this.options.output) this.emit(`${formatTable(rows)}\n`, format);
      else this.reporter.printTable(title, rows);
    } else throw new CliError(`--format ${format} is not supported for this command`);
  }

  close(): void {
    this.store?.close();
    this.store = null;
  }
}

function subjectsFromLogins(store: CopilotStore, logins: string[]): AccessSubject[] {
  return logins.map((login) => ({ login, userId: store.findUserId(login) }));
}

async function evaluatePolicy(
  model: CopilotUsageModel,
  profilePath: string
): Promise<SecurityIssue[]> {
  let resolved: string;
  try {
    resolved = validateFilePath(profilePath, {
      allowedExtensions: ['.yaml', '.yml'],
      createDirIfMissing: false,
    });
  } catch {
    throw new CliError('--profile must be a .yaml or .yml file inside the current directory');
  }
  const engine = new PolicyEngine();
  await engine.loadPolicy(resolved);
  const result = await engine.evaluate([], [], [], undefined, model);
  return result.issues;
}

// ── Command builder ─────────────────────────────────────────────────────────

/**
 * Build the `copilot` command. `run` wraps each action so errors print to
 * stderr and set a non-zero exit code instead of throwing.
 */
export function buildCopilotCommand(deps: CopilotCliDeps = defaultDeps()): Command {
  const copilot = new Command('copilot').description(
    'Deep view of GitHub Copilot usage for an organisation or enterprise'
  );

  const run =
    (fn: (ctx: Context, ...args: unknown[]) => Promise<void>) =>
    async (...args: unknown[]) => {
      const command = args[args.length - 1] as Command;
      const ctx = new Context(deps, command.opts() as CommonOptions);
      try {
        await fn(ctx, ...args.slice(0, -2));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '<redacted>')
            : String(error);
        deps.stderr(`✖ ${message}\n`);
        process.exitCode = 1;
      } finally {
        ctx.close();
      }
    };

  // sync
  addCommonOptions(copilot.command('sync'), { format: false })
    .description('Fetch Copilot reports, seats, spend and coding agent PRs into the local database')
    .option('--retention-days <n>', 'Delete per-user rows older than this many days', '400')
    .option('--no-spend', 'Skip spend')
    .option('--no-agent-prs', 'Skip Copilot coding agent PRs')
    .action(
      run(async (ctx) => {
        const opts = ctx.options as CommonOptions & {
          retentionDays: string;
          spend: boolean;
          agentPrs: boolean;
        };
        if (!/^\d+$/.test(opts.retentionDays) || Number(opts.retentionDays) < 30) {
          throw new CliError('--retention-days must be a whole number of at least 30');
        }
        const range = ctx.range();
        const service = new CopilotSyncService(
          ctx.deps.createApi(ctx.authConfig()),
          ctx.openStore(),
          () => ctx.deps.now()
        );
        const summary = await service.sync(ctx.scope, {
          range,
          includeSpend: opts.spend,
          includeAgentPrs: opts.agentPrs,
          retentionDays: Number(opts.retentionDays),
          onProgress: (m) => ctx.progress(m),
        });
        ctx.reporter.printSyncSummary(summary);
      })
    );

  // usage
  addReasonOptions(addCommonOptions(copilot.command('usage')))
    .description('Adoption, engagement and breakdowns for the scope')
    .addOption(
      new Option('--by <view>', 'Breakdown')
        .choices([
          'feature',
          'ide',
          'language',
          'model',
          'client',
          'day',
          'team',
          'org',
          'cost-centre',
        ])
        .default('feature')
    )
    .option('--team <slug>', 'Only this team (team view)')
    .option('--user <login>', "One person's usage (needs --reason)")
    .action(
      run(async (ctx) => {
        const opts = ctx.options as CommonOptions & { by: UsageView; team?: string; user?: string };
        const format = parseFormat(opts.format);
        const range = ctx.range();
        if (opts.user) {
          await showUser(ctx, opts.user, format, range, {});
          return;
        }
        await ctx.ensureSynced(range);
        const model = ctx.buildModel(range);
        let rows = usageRows(model, opts.by);
        if (opts.team && opts.by === 'team') rows = rows.filter((r) => r.team === opts.team);
        if (format === 'html') {
          ctx.emit(generateCopilotHtml({ model: anonymiseModel(model), anonymised: true }), format);
        } else if (format === 'console' && !opts.output) {
          ctx.reporter.printUsage(model, opts.by);
        } else if (format === 'json') {
          ctx.emit(toJson({ range, kpis: model.kpis, view: opts.by, rows }), format);
        } else {
          ctx.emitRows(`Copilot usage by ${opts.by}`, rows, format);
        }
      })
    );

  // seats
  addReasonOptions(addCommonOptions(copilot.command('seats'), { range: false }))
    .description('Seat assignments and idle seats (needs --reason, or --anonymise)')
    .option('--inactive-days <n>', 'Days without activity before a seat is idle', '30')
    .option('--idle', 'Only idle seats')
    .option('--anonymise', 'Replace logins with pseudonyms (no reason needed)')
    .action(
      run(async (ctx) => {
        const opts = ctx.options as CommonOptions & { inactiveDays: string; idle?: boolean };
        if (!/^\d+$/.test(opts.inactiveDays))
          throw new CliError('--inactive-days must be a whole number');
        const format = parseFormat(opts.format, ['console', 'json', 'csv', 'md']);
        const range = ctx.range();
        await ctx.ensureSynced(range);
        const model = ctx.buildModel(range);
        const rows = seatRows(model, {
          idleOnly: opts.idle,
          anonymise: opts.anonymise,
          inactiveDays: Number(opts.inactiveDays),
        });
        let stamp: AccessStamp | undefined;
        if (!opts.anonymise) {
          const reason = await ctx.reason();
          stamp = await ctx.recordAccess(
            reason,
            subjectsFromLogins(
              ctx.openStore(),
              rows.map((r) => String(r.login))
            )
          );
        }
        ctx.emitRows(
          `Copilot seats (${model.seats.snapshotDay ?? 'no snapshot'})`,
          rows,
          format,
          stamp
        );
      })
    );

  // spend
  addReasonOptions(addCommonOptions(copilot.command('spend'), { range: false }))
    .description('AI credit or premium request spend')
    .option('--month <YYYY-MM>', 'Month to report (default: current month)')
    .addOption(
      new Option('--by <view>', 'Group by')
        .choices(['model', 'day', 'user', 'org', 'cost-centre'])
        .default('model')
    )
    .option('--budget <amount>', 'Monthly budget to compare the forecast against')
    .option('--anonymise', 'With --by user: replace logins with pseudonyms')
    .action(
      run(async (ctx) => {
        const opts = ctx.options as CommonOptions & {
          month?: string;
          by: SpendView;
          budget?: string;
        };
        const format = parseFormat(opts.format, ['console', 'json', 'csv', 'md']);
        const now = ctx.deps.now();
        let range: DateRange;
        try {
          range = monthRange(opts.month ?? toDay(now).slice(0, 7));
        } catch (error) {
          throw new CliError((error as Error).message);
        }
        const yesterday = toDay(new Date(now.getTime() - 86_400_000));
        // The current month only has reports up to yesterday.
        if (range.to > yesterday) range = { ...range, to: yesterday };
        if (range.to < range.from) range = { ...range, to: range.from };
        const budget = opts.budget === undefined ? undefined : Number(opts.budget);
        if (budget !== undefined && (!Number.isFinite(budget) || budget < 0)) {
          throw new CliError('--budget must be a positive number');
        }
        await ctx.ensureSynced(range);
        const model = ctx.buildModel(range);
        const rows = spendRows(model, opts.by, opts.anonymise);
        let stamp: AccessStamp | undefined;
        if (opts.by === 'user' && !opts.anonymise) {
          stamp = await ctx.recordAccess(
            await ctx.reason(),
            subjectsFromLogins(
              ctx.openStore(),
              rows.map((r) => String(r.login))
            )
          );
        }
        if (format === 'console' && !opts.output)
          ctx.reporter.printSpend(model, rows, opts.by, budget);
        else {
          const { byUser: _byUser, ...summary } = model.spend;
          ctx.emitRows(`Copilot spend by ${opts.by}`, rows, format, stamp, { summary, rows });
        }
      })
    );

  // insights
  addCommonOptions(copilot.command('insights'), { format: false })
    .description('AI-written summary of adoption, engagement, spend and risks (no names sent)')
    .option('--model <id>', 'Copilot model to use')
    .option('--profile <file>', 'Policy profile for findings', 'policies/copilot.yaml')
    .option('--json', 'Print JSON')
    .action(
      run(async (ctx) => {
        const opts = ctx.options as CommonOptions & {
          model?: string;
          profile: string;
          json?: boolean;
        };
        const range = ctx.range(90);
        await ctx.ensureSynced(range);
        const model = ctx.buildModel(range);
        const insights = ctx.deps.createInsights(opts.model);
        try {
          const narrative = await insights.summarise(model);
          const findings = await evaluatePolicy(model, opts.profile);
          if (opts.json) {
            ctx.deps.stdout(
              toJson({
                range,
                kpis: model.kpis,
                narrative,
                findings: findings.map((f) => ({
                  ...f,
                  details: { control_id: f.details.control_id },
                })),
              })
            );
          } else {
            ctx.reporter.printKpis(model);
            ctx.reporter.printNarrative(narrative);
            ctx.reporter.info(
              `${findings.length} governance finding(s); run \`copilot report\` for details.`
            );
          }
        } finally {
          await insights.dispose();
        }
      })
    );

  // ask
  addReasonOptions(addCommonOptions(copilot.command('ask'), { format: false }))
    .argument('<question>', 'Question in plain English')
    .description('Ask a question about Copilot usage (questions about named people need --reason)')
    .option('--model <id>', 'Copilot model to use')
    .action(
      run(async (ctx, question) => {
        const opts = ctx.options as CommonOptions & { model?: string };
        if (typeof question !== 'string' || question.trim().length === 0) {
          throw new CliError('A question is required');
        }
        if (question.length > 2000)
          throw new CliError('Question is too long (max 2000 characters)');
        const range = ctx.range();
        await ctx.ensureSynced(range);
        const model = ctx.buildModel(range);
        const reason = opts.reason === undefined ? undefined : await ctx.reason();
        const builder = new CopilotUserProfileBuilder(ctx.openStore());
        const insights = ctx.deps.createInsights(opts.model);
        try {
          const result = await insights.ask(question, {
            usage: model,
            reasonGiven: reason !== undefined,
            accessUsers: async (logins) => {
              if (!reason) throw new CliError('A reason is required');
              const profiles = logins.map((l) => builder.build(ctx.scope, l, range, model));
              await ctx.recordAccess(
                reason,
                profiles.map((p) => ({ login: p.login, userId: p.userId }))
              );
              return profiles;
            },
          });
          ctx.deps.stdout(`${result.answer}\n`);
        } finally {
          await insights.dispose();
        }
      })
    );

  // user
  addReasonOptions(addCommonOptions(copilot.command('user')))
    .argument('<login>', 'GitHub login')
    .description("One person's Copilot usage profile (needs --reason)")
    .option('--compare <login>', 'Compare with another person')
    .option('--compare-period <from:to>', 'Compare with the same person in another period')
    .option('--summarise', 'Add an AI-written coaching summary')
    .option('--model <id>', 'Copilot model for --summarise')
    .action(
      run(async (ctx, login) => {
        const opts = ctx.options as CommonOptions & {
          compare?: string;
          comparePeriod?: string;
          summarise?: boolean;
          model?: string;
        };
        await showUser(ctx, String(login), parseFormat(opts.format), ctx.range(90), opts);
      })
    );

  // users
  addReasonOptions(addCommonOptions(copilot.command('users')))
    .description('Sortable list of people to drill into (needs --reason)')
    .addOption(
      new Option('--sort <field>', 'Sort by')
        .choices(['activity', 'acceptance', 'spend', 'last-active'])
        .default('activity')
    )
    .option('--team <slug>', 'Only this team')
    .option('--idle', 'Only people with no activity in the period')
    .option('--limit <n>', 'Maximum rows', '50')
    .action(
      run(async (ctx) => {
        const opts = ctx.options as CommonOptions & {
          sort: UserSort;
          team?: string;
          idle?: boolean;
          limit: string;
        };
        if (!/^\d+$/.test(opts.limit) || Number(opts.limit) < 1 || Number(opts.limit) > 5000) {
          throw new CliError('--limit must be between 1 and 5000');
        }
        const format = parseFormat(opts.format, ['console', 'json', 'csv', 'md']);
        const reason = await ctx.reason();
        const range = ctx.range();
        await ctx.ensureSynced(range);
        const model = ctx.buildModel(range);
        const rows = userRows(model, {
          sort: opts.sort,
          team: opts.team,
          idle: opts.idle,
          limit: Number(opts.limit),
        });
        const stamp = await ctx.recordAccess(
          reason,
          subjectsFromLogins(
            ctx.openStore(),
            rows.map((r) => String(r.login))
          )
        );
        ctx.emitRows('Copilot users', rows, format, stamp);
      })
    );

  // report
  addReasonOptions(addCommonOptions(copilot.command('report')))
    .description(
      'Full dashboard with governance findings (named data needs --reason, or use --anonymise)'
    )
    .option('--profile <file>', 'Policy profile', 'policies/copilot.yaml')
    .option('--anonymise', 'Replace every login with a pseudonym; no reason needed')
    .option('--users <logins>', 'Comma-separated people to include individual pages for')
    .option('--all-profiles', 'Include individual pages for everyone (up to 200)')
    .option('--summarise', 'Add AI-written summaries')
    .option('--model <id>', 'Copilot model for --summarise')
    .action(
      run(async (ctx) => {
        const opts = ctx.options as CommonOptions & {
          profile: string;
          users?: string;
          allProfiles?: boolean;
          summarise?: boolean;
          model?: string;
        };
        const format = parseFormat(
          opts.format === 'console' && opts.output?.endsWith('.html') ? 'html' : opts.format,
          ['console', 'html', 'json', 'md']
        );
        if (opts.anonymise && (opts.users || opts.allProfiles)) {
          throw new CliError('--anonymise cannot be combined with individual pages');
        }
        const range = ctx.range();
        await ctx.ensureSynced(range);
        const fullModel = ctx.buildModel(range);
        const findings = await evaluatePolicy(fullModel, opts.profile);
        ctx.openStore().saveFindings(
          ctx.openStore().getScopeId(ctx.scope)!,
          findings.map((f) => ({
            type: f.type,
            severity: f.severity,
            subject: f.repository,
            description: f.description,
          })),
          ctx.deps.now()
        );

        let stamp: AccessStamp | undefined;
        let profiles: Array<{ profile: ReturnType<CopilotUserProfileBuilder['build']> }> = [];
        const model = opts.anonymise ? anonymiseModel(fullModel) : fullModel;
        // Anonymised reports evaluate against the pseudonymised model so no login
        // appears in finding descriptions.
        const reportFindings = opts.anonymise
          ? await evaluatePolicy(model, opts.profile)
          : findings;
        if (!opts.anonymise) {
          const reason = await ctx.reason();
          const builder = new CopilotUserProfileBuilder(ctx.openStore());
          const logins = opts.allProfiles
            ? fullModel.users.slice(0, 200).map((u) => u.login)
            : (opts.users ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
          profiles = logins.map((l) => ({
            profile: builder.build(ctx.scope, l, range, fullModel),
          }));
          const named = new Set([
            ...fullModel.users.map((u) => u.login),
            ...fullModel.seats.all.map((s) => s.login),
          ]);
          stamp = await ctx.recordAccess(reason, subjectsFromLogins(ctx.openStore(), [...named]));
        }

        let narrative: Awaited<ReturnType<CopilotInsightsService['summarise']>> | undefined;
        const withNarratives: Array<{
          profile: (typeof profiles)[0]['profile'];
          narrative?: Awaited<ReturnType<CopilotInsightsService['summariseUser']>>;
        }> = [...profiles];
        if (opts.summarise) {
          const insights = ctx.deps.createInsights(opts.model);
          try {
            narrative = await insights.summarise(fullModel);
            for (const item of withNarratives)
              item.narrative = await insights.summariseUser(item.profile);
          } finally {
            await insights.dispose();
          }
        }

        if (format === 'html') {
          ctx.emit(
            generateCopilotHtml({
              model,
              findings: reportFindings,
              narrative,
              profiles: withNarratives,
              access: stamp,
              anonymised: opts.anonymise,
            }),
            format
          );
        } else if (format === 'json') {
          ctx.emit(
            toJson({ model, findings: reportFindings, narrative, profiles: withNarratives }, stamp),
            format
          );
        } else if (format === 'md') {
          ctx.emit(
            toMarkdown(
              `Copilot report · ${scopeSlug(model.scope)} · ${range.from} to ${range.to}`,
              [
                { heading: 'Daily', rows: usageRows(model, 'day') },
                { heading: 'Features', rows: usageRows(model, 'feature') },
                { heading: 'Teams', rows: usageRows(model, 'team') },
                { heading: 'Organisations', rows: usageRows(model, 'org') },
                {
                  heading: 'Findings',
                  rows: reportFindings.map((f) => ({
                    severity: f.severity,
                    control: String(f.details.control_id ?? ''),
                    finding: f.description,
                  })),
                },
                ...withNarratives.map((p) => ({
                  heading: p.profile.login,
                  rows: profileRows(p.profile),
                })),
              ],
              stamp
            ),
            format
          );
        } else {
          ctx.reporter.printUsage(model, 'feature');
          if (narrative) ctx.reporter.printNarrative(narrative);
          ctx.reporter.printFindings(reportFindings);
        }
      })
    );

  // sql
  addReasonOptions(
    copilot
      .command('sql')
      .argument('<query>', 'A single SELECT statement')
      .option('--db <path>', 'SQLite database path')
      .addOption(
        new Option('-f, --format <format>', 'Output format')
          .choices(['table', 'csv', 'json'])
          .default('table')
      )
  )
    .description('Run a read-only SQL query against the Copilot database')
    .action(
      run(async (ctx, query) => {
        const opts = ctx.options as CommonOptions & { format: 'table' | 'csv' | 'json' };
        const sql = String(query);
        try {
          assertReadOnlySql(sql);
        } catch (error) {
          throw new CliError((error as Error).message);
        }
        let stamp: AccessStamp | undefined;
        if (sqlReadsUserData(sql)) {
          const reason = await ctx.reason();
          // The access log needs a writable connection; the query itself runs read-only.
          const writable = ctx.deps.openStore(resolveDbPath(opts.db, ctx.deps.env));
          try {
            const viewer = await ctx.viewer();
            const now = ctx.deps.now();
            new AccessLog(writable).record({
              viewer,
              scopeId: null,
              command: sanitiseCommand(ctx.deps.argv()),
              reason,
              subjects: [{ login: '(sql query)' }],
              now,
            });
            stamp = { viewer, viewedAt: now.toISOString(), reasonCode: reason.code };
          } finally {
            writable.close();
          }
        }
        const store = ctx.openStore(true);
        let rows: Row[];
        try {
          rows = (store.db.prepare(sql).all() as Row[]).map((r) => ({ ...r }));
        } catch (error) {
          throw new CliError(`Query failed: ${(error as Error).message}`);
        }
        if (opts.format === 'json') ctx.deps.stdout(toJson(rows, stamp));
        else if (opts.format === 'csv') ctx.deps.stdout(toCsv(rows, stamp));
        else ctx.deps.stdout(`${formatTable(rows, 60)}\n`);
      })
    );

  // db
  const db = copilot.command('db').description('Manage the local Copilot database');
  db.command('status')
    .option('--db <path>', 'SQLite database path')
    .action(
      run(async (ctx) => {
        ctx.reporter.printStatus(ctx.openStore().status());
      })
    );
  db.command('vacuum')
    .option('--db <path>', 'SQLite database path')
    .action(
      run(async (ctx) => {
        ctx.openStore().vacuum();
        ctx.reporter.info('Database compacted');
      })
    );
  db.command('purge-user')
    .argument('<login>', 'Person whose data to delete')
    .option('--db <path>', 'SQLite database path')
    .option('--yes', 'Do not ask for confirmation')
    .description("Delete one person's Copilot data (for data-subject requests)")
    .action(
      run(async (ctx, login) => {
        const opts = ctx.options as CommonOptions & { yes?: boolean };
        const name = String(login);
        if (!opts.yes) {
          if (!ctx.deps.isInteractive())
            throw new CliError('Pass --yes to confirm in a non-interactive run');
          if (!(await ctx.deps.confirm(`Delete all stored Copilot data for ${name}?`))) {
            ctx.reporter.info('Nothing deleted');
            return;
          }
        }
        const removed = ctx.openStore().purgeUser(name, loginDigest(name));
        ctx.reporter.info(
          removed === 0
            ? `No stored data for ${name}`
            : `Deleted ${removed} row(s) for ${name}. Access-log entries are kept with the login hashed.`
        );
      })
    );
  addReasonOptions(
    db
      .command('export')
      .argument('<dir>', 'Directory (inside the current directory) to write CSV files to')
      .option('--db <path>', 'SQLite database path')
  )
    .description('Export every table as CSV (needs --reason: the export contains per-user rows)')
    .action(
      run(async (ctx, dir) => {
        const reason = await ctx.reason();
        let target: string;
        try {
          target = path.dirname(
            validateFilePath(path.join(String(dir), 'export.csv'), {
              allowedExtensions: ['.csv'],
              createDirIfMissing: false,
            })
          );
        } catch (error) {
          throw new CliError(`Invalid export directory: ${(error as Error).message}`);
        }
        const store = ctx.openStore();
        const viewer = await ctx.viewer();
        new AccessLog(store).record({
          viewer,
          scopeId: null,
          command: sanitiseCommand(ctx.deps.argv()),
          reason,
          subjects: [{ login: '(full export)' }],
          now: ctx.deps.now(),
        });
        mkdirSync(target, { recursive: true, mode: 0o700 });
        const tables = store.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
          )
          .all() as Array<{ name: string }>;
        for (const { name } of tables) {
          // Table names come from sqlite_master, not user input.
          const rows = (
            store.db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).all() as Row[]
          ).map((r) => ({ ...r }));
          ctx.deps.writeFile(path.join(target, `${name}.csv`), toCsv(rows));
        }
        ctx.reporter.info(`Exported ${tables.length} table(s) to ${target}`);
      })
    );
  db.command('access-log')
    .option('--db <path>', 'SQLite database path')
    .option('--viewer <login>', 'Only views by this person')
    .option('--subject <login>', 'Only views of this person')
    .option('--since <day>', 'Only views on or after this day')
    .option('--limit <n>', 'Maximum entries', '100')
    .option('--verify', 'Check the hash chain for edits')
    .addOption(
      new Option('-f, --format <format>', 'Output format')
        .choices(['console', 'csv', 'json'])
        .default('console')
    )
    .description('Show who viewed individuals’ data, when and why')
    .action(
      run(async (ctx) => {
        const opts = ctx.options as CommonOptions & {
          viewer?: string;
          subject?: string;
          since?: string;
          limit: string;
          verify?: boolean;
        };
        const log = new AccessLog(ctx.openStore());
        if (opts.verify) {
          const result = log.verify();
          if (result.ok) ctx.reporter.info(`Access log intact (${result.checked} entries checked)`);
          else throw new CliError(`Access log has been altered at entry ${result.brokenAtId}`);
          return;
        }
        if (opts.since && !isValidDay(opts.since)) throw new CliError('--since must be YYYY-MM-DD');
        if (!/^\d+$/.test(opts.limit)) throw new CliError('--limit must be a whole number');
        const entries = log.list({
          viewer: opts.viewer,
          subject: opts.subject,
          since: opts.since,
          limit: Number(opts.limit),
        });
        if (opts.format === 'json') ctx.deps.stdout(toJson(entries));
        else if (opts.format === 'csv') {
          ctx.deps.stdout(toCsv(entries.map((e) => ({ ...e, subjects: e.subjects.join(' ') }))));
        } else ctx.reporter.printAccessLog(entries);
      })
    );

  return copilot;
}

/** Shared by `copilot user` and `copilot usage --user`. */
async function showUser(
  ctx: Context,
  login: string,
  format: Format,
  range: DateRange,
  opts: { compare?: string; comparePeriod?: string; summarise?: boolean; model?: string }
): Promise<void> {
  if (ctx.options.anonymise) throw new CliError('--anonymise cannot be used to view an individual');
  if (
    !/^[A-Za-z0-9-]{1,39}$/.test(login) ||
    (opts.compare && !/^[A-Za-z0-9-]{1,39}$/.test(opts.compare))
  ) {
    throw new CliError('Logins may contain only letters, digits and hyphens');
  }
  let compareRange: DateRange | undefined;
  if (opts.comparePeriod) {
    const [from, to] = opts.comparePeriod.split(':');
    if (!from || !to || !isValidDay(from) || !isValidDay(to) || from > to) {
      throw new CliError('--compare-period must be <from>:<to> with days in YYYY-MM-DD format');
    }
    compareRange = { from, to };
  }
  const reason = await ctx.reason();
  await ctx.ensureSynced(range);
  if (compareRange) await ctx.ensureSynced(compareRange);
  const store = ctx.openStore();
  const builder = new CopilotUserProfileBuilder(store);
  const model = ctx.buildModel(range);
  const profile = builder.build(ctx.scope, login, range, model);
  const other = opts.compare
    ? builder.build(ctx.scope, opts.compare, range, model)
    : compareRange
      ? builder.build(ctx.scope, login, compareRange)
      : undefined;
  const subjects: AccessSubject[] = [{ login: profile.login, userId: profile.userId }];
  if (other && other.userId !== profile.userId)
    subjects.push({ login: other.login, userId: other.userId });
  const stamp = await ctx.recordAccess(reason, subjects);
  const recentViews = new AccessLog(store).recentViewsOf(profile.login, 5);

  let narrative: Awaited<ReturnType<CopilotInsightsService['summariseUser']>> | undefined;
  if (opts.summarise) {
    const insights = ctx.deps.createInsights(opts.model);
    try {
      narrative = await insights.summariseUser(profile);
    } finally {
      await insights.dispose();
    }
  }
  const comparison = other ? compareProfiles(profile, other) : undefined;
  const labels = other
    ? opts.compare
      ? [profile.login, other.login]
      : [`${range.from}..${range.to}`, `${compareRange!.from}..${compareRange!.to}`]
    : [];

  switch (format) {
    case 'json':
      ctx.emit(toJson({ profile, narrative, comparison, recentViews }, stamp), format);
      return;
    case 'csv':
      ctx.emit(toCsv(profileRows(profile), stamp), format);
      return;
    case 'md':
      ctx.emit(
        toMarkdown(
          `Copilot usage · ${profile.login}`,
          [
            { heading: 'Profile', rows: profileRows(profile) },
            ...(comparison
              ? [
                  {
                    heading: `Comparison: ${labels[0]} vs ${labels[1]}`,
                    rows: comparison.map((c) => ({
                      metric: c.metric,
                      a: c.a,
                      b: c.b,
                      change: c.change,
                    })),
                  },
                ]
              : []),
          ],
          stamp
        ),
        format
      );
      return;
    case 'html':
      ctx.emit(
        generateCopilotHtml({
          model: {
            ...model,
            users: model.users.filter((u) => u.userId === profile.userId),
            seats: { ...model.seats, all: profile.seat.current, idle: [], multiOrgUsers: [] },
          },
          profiles: [{ profile, narrative }],
          access: stamp,
          openProfile: profile.login,
        }),
        format
      );
      return;
    default:
      ctx.reporter.printUserProfile(profile, recentViews, narrative);
      if (comparison) ctx.reporter.printComparison(labels[0], labels[1], comparison);
  }
}
