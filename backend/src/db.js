import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'admin.db');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = OFF');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mods (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'mod',
      disabled_at   INTEGER,
      created_at    INTEGER NOT NULL,
      invited_by    INTEGER REFERENCES mods(id)
    );

    CREATE TABLE IF NOT EXISTS invite_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      token       TEXT    NOT NULL UNIQUE,
      created_by  INTEGER NOT NULL REFERENCES mods(id),
      expires_at  INTEGER NOT NULL,
      used_by     INTEGER REFERENCES mods(id),
      used_at     INTEGER
    );

    CREATE TABLE IF NOT EXISTS ban_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id          TEXT    NOT NULL,
      mod_id           INTEGER NOT NULL REFERENCES mods(id),
      target_uid       INTEGER NOT NULL,
      target_name      TEXT    NOT NULL,
      trigger_content  TEXT,
      ban_hours        INTEGER NOT NULL,
      bilibili_ban_id  INTEGER,
      unsilenced_at    INTEGER,
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_tags (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      target_uid   INTEGER NOT NULL,
      target_name  TEXT    NOT NULL,
      tag          TEXT,
      note         TEXT,
      created_by   INTEGER NOT NULL REFERENCES mods(id),
      created_at   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ban_logs_target ON ban_logs(target_uid);
    CREATE INDEX IF NOT EXISTS idx_ban_logs_mod    ON ban_logs(mod_id);
    CREATE INDEX IF NOT EXISTS idx_user_tags_uid   ON user_tags(target_uid);
  `);

  const cols = db.prepare(`PRAGMA table_info(mods)`).all().map(c => c.name);
  if (!cols.includes('is_superadmin')) {
    db.exec(`ALTER TABLE mods ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0`);
    db.prepare(`UPDATE mods SET is_superadmin = 1 WHERE id = 1`).run();
  }

  ensureAdminAccount();
}

async function ensureAdminAccount() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM mods').get();
  if (count.c > 0) return;

  let password = process.env.ADMIN_INIT_PASSWORD;
  if (!password) {
    password = Math.random().toString(36).slice(2, 12);
    console.log(`\n🔑 首次启动，admin 初始密码: ${password}\n`);
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare(
    `INSERT INTO mods (username, password_hash, role, is_superadmin, created_at) VALUES (?, ?, 'admin', 1, ?)`
  ).run('admin', hash, Date.now());
}
