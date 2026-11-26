/**
 * Opens the Copilot Insights SQLite database using Node's built-in
 * `node:sqlite` module (release candidate from Node 24.15).
 *
 * The module is loaded lazily through `process.getBuiltinModule` so that its
 * ExperimentalWarning can be filtered for this module only, without hiding
 * any other process warnings.
 *
 * @module services/copilot/store/database
 */

import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

type SqliteModule = typeof import('node:sqlite');

let sqliteModule: SqliteModule | null = null;

function isSqliteWarning(warning: string | Error): boolean {
  const message = typeof warning === 'string' ? warning : warning.message;
  return message.includes('SQLite is an experimental feature');
}

/** Load `node:sqlite`, suppressing only its experimental warning. */
export function loadSqlite(): SqliteModule {
  if (sqliteModule) return sqliteModule;
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    if (isSqliteWarning(warning)) return;
    (original as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    sqliteModule = process.getBuiltinModule('node:sqlite') as SqliteModule;
  } finally {
    process.emitWarning = original;
  }
  return sqliteModule;
}

export interface OpenDatabaseOptions {
  readOnly?: boolean;
}

/** Default database location: `~/.hubhelper/copilot.db`. */
export function defaultDatabasePath(): string {
  return path.join(os.homedir(), '.hubhelper', 'copilot.db');
}

/**
 * Open (creating if needed) a database file. `:memory:` is accepted for tests.
 * New files are created with mode 0600 because they hold per-user data.
 */
export function openDatabase(filePath: string, options: OpenDatabaseOptions = {}): DatabaseSync {
  const { DatabaseSync: Database } = loadSqlite();
  const inMemory = filePath === ':memory:';
  if (!inMemory && !options.readOnly) {
    mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  }
  if (!inMemory && options.readOnly && !existsSync(filePath)) {
    throw new Error('Copilot database not found. Run `hubhelper copilot sync` first.');
  }
  const isNew = !inMemory && !existsSync(filePath);
  const db = new Database(filePath, {
    readOnly: options.readOnly === true,
    enableForeignKeyConstraints: true,
  });
  if (isNew) chmodSync(filePath, 0o600);
  if (!options.readOnly) {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

/** Run `fn` inside a transaction, rolling back on error. */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
