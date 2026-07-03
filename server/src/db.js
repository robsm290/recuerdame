import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Capa de datos con dos backends:
//  - PostgreSQL si existe DATABASE_URL (producción: Northflank, Railway, etc.)
//  - SQLite local si no (desarrollo: cero configuración)
// API unificada asíncrona con placeholders '?': all / get / run.

const databaseUrl = process.env.DATABASE_URL;

export let all, get, run;

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  start_time       TEXT NOT NULL DEFAULT '09:00',
  end_time         TEXT NOT NULL DEFAULT '19:00',
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  last_sent_at     BIGINT
);

CREATE TABLE IF NOT EXISTS tasks (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  priority     TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
  due_date     TEXT,
  completed    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint          TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  priority   TEXT NOT NULL,
  task_count INTEGER NOT NULL,
  delivered  INTEGER NOT NULL DEFAULT 0,
  sent_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, completed, priority);
CREATE INDEX IF NOT EXISTS idx_subs_user  ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, sent_at);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS alarm_sound TEXT NOT NULL DEFAULT 'classic';
`;

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  start_time       TEXT NOT NULL DEFAULT '09:00',
  end_time         TEXT NOT NULL DEFAULT '19:00',
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  last_sent_at     INTEGER
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  priority     TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
  due_date     TEXT,
  completed    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint          TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  priority   TEXT NOT NULL,
  task_count INTEGER NOT NULL,
  delivered  INTEGER NOT NULL DEFAULT 0,
  sent_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, completed, priority);
CREATE INDEX IF NOT EXISTS idx_subs_user  ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, sent_at);
`;

if (databaseUrl) {
  const { default: pg } = await import('pg');
  const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
  const useSsl = process.env.DATABASE_SSL !== 'false' && !isLocal;
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  // convierte placeholders '?' al formato $1, $2… de PostgreSQL
  const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };

  all = async (sql, params = []) => (await pool.query(toPg(sql), params)).rows;
  get = async (sql, params = []) => (await pool.query(toPg(sql), params)).rows[0];
  run = async (sql, params = []) => {
    const result = await pool.query(toPg(sql), params);
    return { changes: result.rowCount };
  };

  await pool.query(PG_SCHEMA);
  console.log('[db] PostgreSQL conectado');
} else {
  const { default: Database } = await import('better-sqlite3');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'recuerdame.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SQLITE_SCHEMA);
  for (const migration of [
    'ALTER TABLE tasks ADD COLUMN description TEXT',
    "ALTER TABLE settings ADD COLUMN alarm_sound TEXT NOT NULL DEFAULT 'classic'",
  ]) {
    try {
      db.exec(migration);
    } catch {
      // la columna ya existe
    }
  }

  all = async (sql, params = []) => db.prepare(sql).all(...params);
  get = async (sql, params = []) => db.prepare(sql).get(...params);
  run = async (sql, params = []) => {
    const info = db.prepare(sql).run(...params);
    return { changes: info.changes };
  };
  console.log('[db] SQLite local (server/data/recuerdame.db)');
}

export async function getMeta(key) {
  const row = await get('SELECT value FROM meta WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function setMeta(key, value) {
  await run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}
