/**
 * Safeguards for viewing named individuals' Copilot data.
 *
 * Every route that shows per-user data with logins must obtain an
 * `AccessReason` (validated, never sent to the AI model) and record it with
 * `AccessLog` before output. The log is hash-chained so edits are detectable.
 *
 * @module services/copilot/access-control
 */

import { createHash } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import type { CopilotStore } from './store/copilot-store.js';
import { USER_LEVEL_OBJECTS } from './store/migrations.js';

export const REASON_CODES = [
  'enablement',
  'licence-review',
  'cost-review',
  'security-investigation',
  'data-subject-request',
  'other',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export interface AccessReason {
  code: ReasonCode;
  text: string;
}

export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 500;

const PLACEHOLDERS = new Set([
  'test',
  'testing',
  'n/a',
  'na',
  'none',
  'nothing',
  'asdf',
  'asdfgh',
  'qwerty',
  'reason',
  'because',
  'no reason',
  'todo',
  'tbd',
  'xxx',
  'just because',
  'just looking',
  'test reason',
  'testing testing',
]);

export class ReasonRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReasonRequiredError';
  }
}

export interface ReasonValidation {
  valid: boolean;
  sanitized?: string;
  error?: string;
}

/** Strip control characters and newlines, then check length and content. */
export function validateReason(raw: unknown): ReasonValidation {
  if (typeof raw !== 'string') return { valid: false, error: 'A reason is required' };
  let cleaned = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : ch;
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length < MIN_REASON_LENGTH) {
    return {
      valid: false,
      error: `Reason must be at least ${MIN_REASON_LENGTH} characters`,
    };
  }
  if (cleaned.length > MAX_REASON_LENGTH) {
    return { valid: false, error: `Reason must be at most ${MAX_REASON_LENGTH} characters` };
  }
  const lower = cleaned.toLowerCase();
  const distinct = new Set(lower.replace(/[\s\p{P}]/gu, '')).size;
  if (PLACEHOLDERS.has(lower.replace(/[.!]+$/, '')) || distinct <= 2 || !/\p{L}/u.test(lower)) {
    return { valid: false, error: 'Give a real reason for viewing this data' };
  }
  return { valid: true, sanitized: cleaned };
}

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === 'string' && (REASON_CODES as readonly string[]).includes(value);
}

export interface ResolveReasonOptions {
  reason?: string;
  reasonCode?: string;
  /** Whether stdin and stdout are a terminal (so a prompt can be shown). */
  interactive: boolean;
  prompt?: (question: string) => Promise<string>;
}

/**
 * Get a validated reason from the flag, or by prompting in a terminal.
 * Non-interactive runs without `--reason` fail rather than continue.
 */
export async function resolveReason(options: ResolveReasonOptions): Promise<AccessReason> {
  const code = options.reasonCode ?? 'other';
  if (!isReasonCode(code)) {
    throw new ReasonRequiredError(`--reason-code must be one of: ${REASON_CODES.join(', ')}`);
  }
  let raw = options.reason;
  if (raw === undefined) {
    if (!options.interactive || !options.prompt) {
      throw new ReasonRequiredError(
        'This command shows named individuals’ Copilot data. Pass --reason "<why>" ' +
          '(and optionally --reason-code). The reason is recorded in the access log.'
      );
    }
    raw = await options.prompt('Why do you need to view this data? (recorded in the access log) ');
  }
  const validation = validateReason(raw);
  if (!validation.valid) throw new ReasonRequiredError(validation.error!);
  return { code, text: validation.sanitized! };
}

// ── Command sanitising ──────────────────────────────────────────────────────

const SECRET_FLAGS = new Set(['--token', '-t']);
const DROPPED_FLAGS = new Set(['--reason']);

/** Command line to record: token values removed, reason text dropped (stored separately). */
export function sanitiseCommand(argv: readonly string[]): string {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), true]
      : [arg, false];
    if (SECRET_FLAGS.has(flag)) {
      out.push(`${flag}=<redacted>`);
      if (!inline) i++;
      continue;
    }
    if (DROPPED_FLAGS.has(flag)) {
      if (!inline) i++;
      continue;
    }
    out.push(arg.replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '<redacted>'));
  }
  return out.join(' ').slice(0, 1000);
}

// ── Login hashing ───────────────────────────────────────────────────────────

/** Stable digest of a login, used in the hash chain and when purging. */
export function loginDigest(login: string): string {
  return `sha256:${createHash('sha256').update(login.toLowerCase()).digest('hex')}`;
}

/** Short pseudonym for anonymised reports and prompts. */
export function pseudonym(login: string): string {
  return `user-${createHash('sha256').update(login.toLowerCase()).digest('hex').slice(0, 8)}`;
}

// ── Access log ──────────────────────────────────────────────────────────────

export interface AccessSubject {
  userId?: number;
  login: string;
}

export interface AccessEntry {
  id: number;
  viewedAt: string;
  viewer: string;
  scope: string | null;
  command: string;
  reasonCode: string;
  reason: string;
  subjects: string[];
}

export interface AccessLogFilter {
  viewer?: string;
  subject?: string;
  since?: string;
  limit?: number;
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  brokenAtId?: number;
}

const GENESIS = 'genesis';

function subjectDigest(login: string): string {
  return login.startsWith('sha256:') ? login : loginDigest(login);
}

function batchHash(
  prev: string,
  fields: {
    viewedAt: string;
    viewer: string;
    scopeId: number | null;
    command: string;
    reasonCode: string;
    reason: string;
    subjects: string[];
  }
): string {
  const digests = fields.subjects.map(subjectDigest).sort();
  const payload = JSON.stringify([
    prev,
    fields.viewedAt,
    fields.viewer,
    fields.scopeId,
    fields.command,
    fields.reasonCode,
    fields.reason,
    digests,
  ]);
  return createHash('sha256').update(payload).digest('hex');
}

export class AccessLog {
  constructor(private readonly store: CopilotStore) {}

  private all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.store.db.prepare(sql).all(...params) as T[];
  }

  /**
   * Record one view of one or more people's data. Must be called before the
   * data is shown. Returns the batch id.
   */
  record(input: {
    viewer: string;
    scopeId: number | null;
    command: string;
    reason: AccessReason;
    subjects: AccessSubject[];
    now?: Date;
  }): number {
    const db = this.store.db;
    const viewedAt = (input.now ?? new Date()).toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const prev =
        (
          db.prepare('SELECT row_hash FROM access_batch ORDER BY id DESC LIMIT 1').get() as
            | { row_hash: string }
            | undefined
        )?.row_hash ?? GENESIS;
      const unique = new Map<string, AccessSubject>();
      for (const s of input.subjects) unique.set(s.login.toLowerCase(), s);
      const subjects = [...unique.values()];
      const rowHash = batchHash(prev, {
        viewedAt,
        viewer: input.viewer,
        scopeId: input.scopeId,
        command: input.command,
        reasonCode: input.reason.code,
        reason: input.reason.text,
        subjects: subjects.map((s) => s.login),
      });
      const batch = db
        .prepare(
          `INSERT INTO access_batch
           (viewed_at, viewer, scope_id, command, reason_code, reason, prev_hash, row_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          viewedAt,
          input.viewer,
          input.scopeId,
          input.command,
          input.reason.code,
          input.reason.text,
          prev,
          rowHash
        );
      const batchId = Number(batch.lastInsertRowid);
      const subject = db.prepare(
        'INSERT INTO access_log (batch_id, subject_user_id, subject_login) VALUES (?, ?, ?)'
      );
      for (const s of subjects) subject.run(batchId, s.userId ?? null, s.login);
      db.exec('COMMIT');
      return batchId;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  list(filter: AccessLogFilter = {}): AccessEntry[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.viewer) {
      where.push('b.viewer = ? COLLATE NOCASE');
      params.push(filter.viewer);
    }
    if (filter.since) {
      where.push('b.viewed_at >= ?');
      params.push(filter.since);
    }
    if (filter.subject) {
      where.push(
        'b.id IN (SELECT batch_id FROM access_log WHERE subject_login = ? COLLATE NOCASE)'
      );
      params.push(filter.subject);
    }
    const rows = this.all<{
      id: number;
      viewed_at: string;
      viewer: string;
      slug: string | null;
      command: string;
      reason_code: string;
      reason: string;
      subjects: string | null;
    }>(
      `SELECT b.id, b.viewed_at, b.viewer, s.kind || ':' || s.slug AS slug, b.command,
              b.reason_code, b.reason,
              (SELECT GROUP_CONCAT(subject_login, ',') FROM access_log WHERE batch_id = b.id)
                AS subjects
       FROM access_batch b LEFT JOIN scopes s ON s.id = b.scope_id
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY b.id DESC LIMIT ?`,
      ...params,
      filter.limit ?? 100
    );
    return rows.map((r) => ({
      id: r.id,
      viewedAt: r.viewed_at,
      viewer: r.viewer,
      scope: r.slug,
      command: r.command,
      reasonCode: r.reason_code,
      reason: r.reason,
      subjects: r.subjects ? r.subjects.split(',') : [],
    }));
  }

  /** Most recent views of one person's data (viewer, date, reason code). */
  recentViewsOf(
    login: string,
    limit = 5
  ): Array<{ viewedAt: string; viewer: string; reasonCode: string }> {
    return this.all<{ viewed_at: string; viewer: string; reason_code: string }>(
      `SELECT b.viewed_at, b.viewer, b.reason_code FROM access_batch b
       WHERE b.id IN (SELECT batch_id FROM access_log WHERE subject_login = ? COLLATE NOCASE)
       ORDER BY b.id DESC LIMIT ?`,
      login,
      limit
    ).map((r) => ({ viewedAt: r.viewed_at, viewer: r.viewer, reasonCode: r.reason_code }));
  }

  /** Recompute the hash chain. Reports the first entry that no longer matches. */
  verify(): VerifyResult {
    const batches = this.all<{
      id: number;
      viewed_at: string;
      viewer: string;
      scope_id: number | null;
      command: string;
      reason_code: string;
      reason: string;
      prev_hash: string;
      row_hash: string;
    }>('SELECT * FROM access_batch ORDER BY id');
    let prev = GENESIS;
    for (const b of batches) {
      const subjects = this.all<{ subject_login: string }>(
        'SELECT subject_login FROM access_log WHERE batch_id = ?',
        b.id
      ).map((s) => s.subject_login);
      const expected = batchHash(prev, {
        viewedAt: b.viewed_at,
        viewer: b.viewer,
        scopeId: b.scope_id,
        command: b.command,
        reasonCode: b.reason_code,
        reason: b.reason,
        subjects,
      });
      if (b.prev_hash !== prev || b.row_hash !== expected) {
        return { ok: false, checked: batches.indexOf(b), brokenAtId: b.id };
      }
      prev = b.row_hash;
    }
    return { ok: true, checked: batches.length };
  }
}

// ── SQL guard for `copilot sql` ─────────────────────────────────────────────

/** Remove comments and string literals; unquote double-quoted identifiers. */
export function stripSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"((?:[^"]|"")*)"/g, (_m, id: string) => id.replace(/""/g, '"'))
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]/g, '$1');
}

/** Whether a query reads any table or view that holds per-user rows. */
export function sqlReadsUserData(sql: string): boolean {
  const identifiers = new Set(
    (
      stripSql(sql)
        .toLowerCase()
        .match(/[a-z_][a-z0-9_]*/g) ?? []
    ).map((t) => t)
  );
  return USER_LEVEL_OBJECTS.some((name) => identifiers.has(name));
}

const FORBIDDEN_SQL = /\b(attach|detach|pragma|load_extension)\b/i;

/**
 * Allow a single SELECT (or WITH … SELECT) statement only. The database is
 * also opened read-only, so this is a second line of defence.
 */
export function assertReadOnlySql(sql: string): void {
  const stripped = stripSql(sql).trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(stripped)) {
    throw new Error('Only SELECT queries are allowed');
  }
  if (stripped.includes(';')) throw new Error('Only one statement is allowed');
  if (FORBIDDEN_SQL.test(stripped)) {
    throw new Error('ATTACH, DETACH, PRAGMA and extensions are not allowed');
  }
}
