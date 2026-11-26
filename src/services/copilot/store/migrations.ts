/**
 * Versioned schema migrations for the Copilot Insights database.
 *
 * Migrations are kept as TypeScript string constants (rather than .sql files)
 * so they ship inside `dist/` without a copy step. Each migration runs once,
 * in order, tracked by `PRAGMA user_version`. Never edit a released migration:
 * add a new one instead.
 *
 * @module services/copilot/store/migrations
 */

import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './database.js';

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

const INIT_SQL = `
CREATE TABLE scopes (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('org', 'enterprise')),
  slug TEXT NOT NULL,
  UNIQUE (kind, slug)
);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY,
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT
);

CREATE TABLE sync_days (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  report_kind TEXT NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'suppressed', 'unavailable', 'error')),
  row_count INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (scope_id, report_kind, day)
);

CREATE TABLE raw_reports (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  report_kind TEXT NOT NULL,
  day TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (scope_id, report_kind, day)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX idx_users_login ON users (login COLLATE NOCASE);

CREATE TABLE orgs (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  login TEXT NOT NULL,
  PRIMARY KEY (scope_id, login)
);

CREATE TABLE teams (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (scope_id, id)
);

CREATE TABLE cost_centres (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (scope_id, id)
);

CREATE TABLE cost_centre_members (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  cost_centre_id TEXT NOT NULL,
  member_type TEXT NOT NULL CHECK (member_type IN ('user', 'org')),
  member_ref TEXT NOT NULL,
  PRIMARY KEY (scope_id, cost_centre_id, member_type, member_ref)
);

CREATE TABLE scope_day_metrics (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (scope_id, day, metric)
);

CREATE TABLE scope_day_breakdown (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  dimension TEXT NOT NULL,
  key TEXT NOT NULL,
  sub_key TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (scope_id, day, dimension, key, sub_key, metric)
);

CREATE TABLE scope_day_flags (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  flags_json TEXT NOT NULL,
  PRIMARY KEY (scope_id, day)
);

CREATE TABLE user_day_metrics (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  org_login TEXT,
  interactions REAL NOT NULL DEFAULT 0,
  code_gen REAL NOT NULL DEFAULT 0,
  code_accept REAL NOT NULL DEFAULT 0,
  loc_suggested REAL NOT NULL DEFAULT 0,
  loc_accepted REAL NOT NULL DEFAULT 0,
  chat_turns REAL NOT NULL DEFAULT 0,
  agent_turns REAL NOT NULL DEFAULT 0,
  ai_credits_used REAL NOT NULL DEFAULT 0,
  flags_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (scope_id, day, user_id)
);
CREATE INDEX idx_user_day_user ON user_day_metrics (user_id, day);

CREATE TABLE user_day_breakdown (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  key TEXT NOT NULL,
  sub_key TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (scope_id, day, user_id, dimension, key, sub_key, metric)
);
CREATE INDEX idx_user_breakdown_dim ON user_day_breakdown (scope_id, dimension, key, day);
CREATE INDEX idx_user_breakdown_user ON user_day_breakdown (user_id, day);

CREATE TABLE user_team_day (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  PRIMARY KEY (scope_id, day, user_id, team_id)
);

CREATE TABLE seat_day (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  org_login TEXT NOT NULL DEFAULT '',
  assigning_team_slug TEXT,
  plan_type TEXT,
  created_at TEXT,
  last_activity_at TEXT,
  last_activity_editor TEXT,
  pending_cancellation_date TEXT,
  PRIMARY KEY (scope_id, day, user_id, org_login)
);
CREATE INDEX idx_seat_day_user ON seat_day (user_id, day);

CREATE TABLE org_settings_day (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  org_login TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  PRIMARY KEY (scope_id, day, org_login)
);

CREATE TABLE spend_day (
  id INTEGER PRIMARY KEY,
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  user_login TEXT,
  org_login TEXT,
  cost_centre_id TEXT,
  model TEXT NOT NULL,
  product TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  gross_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_spend_scope_day ON spend_day (scope_id, day);

CREATE TABLE agent_prs (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  org_login TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  requested_by TEXT,
  opened_at TEXT NOT NULL,
  merged_at TEXT,
  human_approved INTEGER NOT NULL DEFAULT 0,
  reviewers_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (scope_id, repo, number)
);

CREATE TABLE findings (
  id INTEGER PRIMARY KEY,
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  detected_at TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE ai_summaries (
  id INTEGER PRIMARY KEY,
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  subject_user_id INTEGER,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content TEXT NOT NULL
);

CREATE TABLE access_batch (
  id INTEGER PRIMARY KEY,
  viewed_at TEXT NOT NULL,
  viewer TEXT NOT NULL,
  scope_id INTEGER REFERENCES scopes(id) ON DELETE SET NULL,
  command TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  row_hash TEXT NOT NULL
);

CREATE TABLE access_log (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES access_batch(id) ON DELETE CASCADE,
  subject_user_id INTEGER,
  subject_login TEXT NOT NULL
);
CREATE INDEX idx_access_log_subject ON access_log (subject_user_id);

-- ---------------------------------------------------------------------------
-- Analysis views
-- ---------------------------------------------------------------------------

CREATE VIEW v_daily_adoption AS
SELECT scope_id, day,
       COUNT(*) AS users_reported,
       SUM(CASE WHEN interactions > 0 OR code_gen > 0 THEN 1 ELSE 0 END) AS active_users,
       SUM(CASE WHEN chat_turns > 0 OR agent_turns > 0 THEN 1 ELSE 0 END) AS engaged_users,
       SUM(interactions) AS interactions,
       SUM(code_gen) AS code_gen,
       SUM(code_accept) AS code_accept,
       SUM(loc_accepted) AS loc_accepted,
       SUM(ai_credits_used) AS ai_credits_used
FROM user_day_metrics
GROUP BY scope_id, day;

CREATE VIEW v_weekly_active AS
SELECT scope_id, strftime('%Y-W%W', day) AS week,
       COUNT(DISTINCT CASE WHEN interactions > 0 OR code_gen > 0 THEN user_id END) AS active_users
FROM user_day_metrics
GROUP BY scope_id, week;

CREATE VIEW v_feature_mix AS
SELECT scope_id, day, key AS feature, SUM(value) AS activity
FROM scope_day_breakdown
WHERE dimension = 'feature'
  AND metric IN ('user_initiated_interaction_count', 'code_generation_activity_count')
GROUP BY scope_id, day, key;

-- Team rollups: users in several teams count once per team. Never sum this
-- view back into an organisation total.
CREATE VIEW v_team_day AS
SELECT m.scope_id, m.day, t.team_id, tm.slug AS team_slug,
       COUNT(DISTINCT m.user_id) AS users_reported,
       COUNT(DISTINCT CASE WHEN m.interactions > 0 OR m.code_gen > 0 THEN m.user_id END)
         AS active_users,
       SUM(m.interactions) AS interactions,
       SUM(m.code_gen) AS code_gen,
       SUM(m.code_accept) AS code_accept,
       SUM(m.ai_credits_used) AS ai_credits_used
FROM user_day_metrics m
JOIN user_team_day t ON t.scope_id = m.scope_id AND t.day = m.day AND t.user_id = m.user_id
LEFT JOIN teams tm ON tm.scope_id = t.scope_id AND tm.id = t.team_id
GROUP BY m.scope_id, m.day, t.team_id;

CREATE VIEW v_cost_per_active_user AS
SELECT a.scope_id, a.day, a.active_users, a.ai_credits_used,
       CASE WHEN a.active_users > 0 THEN a.ai_credits_used * 1.0 / a.active_users END
         AS credits_per_active_user
FROM v_daily_adoption a;

CREATE VIEW v_idle_seats AS
SELECT s.scope_id, s.day, s.user_id, u.login, s.org_login, s.last_activity_at,
       CAST(julianday(s.day) - julianday(COALESCE(s.last_activity_at, s.created_at, s.day))
            AS INTEGER) AS idle_days
FROM seat_day s
LEFT JOIN users u ON u.id = s.user_id;

CREATE VIEW v_org_rollup AS
SELECT scope_id, day, COALESCE(org_login, '') AS org_login,
       COUNT(DISTINCT user_id) AS users_reported,
       COUNT(DISTINCT CASE WHEN interactions > 0 OR code_gen > 0 THEN user_id END) AS active_users,
       SUM(interactions) AS interactions,
       SUM(code_accept) AS code_accept,
       SUM(code_gen) AS code_gen,
       SUM(ai_credits_used) AS ai_credits_used
FROM user_day_metrics
GROUP BY scope_id, day, org_login;
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, description: 'Initial Copilot Insights schema', sql: INIT_SQL },
];

/** Tables and views holding per-user rows. Reading these needs a logged reason. */
export const USER_LEVEL_OBJECTS: readonly string[] = [
  'users',
  'user_day_metrics',
  'user_day_breakdown',
  'user_team_day',
  'seat_day',
  'spend_day',
  'agent_prs',
  'ai_summaries',
  'access_batch',
  'access_log',
  'raw_reports',
  'v_idle_seats',
  'v_team_day',
];

export function currentVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  return row?.user_version ?? 0;
}

/** Apply every pending migration. Returns the versions applied. */
export function migrate(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): number[] {
  const applied: number[] = [];
  const from = currentVersion(db);
  const latest = migrations.reduce((max, m) => Math.max(max, m.version), 0);
  if (from > latest) {
    throw new Error(
      `Copilot database schema version ${from} is newer than this HubHelper supports (${latest}). Upgrade HubHelper.`
    );
  }
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= from) continue;
    withTransaction(db, () => {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${Number(migration.version)}`);
    });
    applied.push(migration.version);
  }
  return applied;
}
