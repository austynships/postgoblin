import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

function open() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "postgoblins.db"));
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT,
      avatar TEXT,
      profile_url TEXT,
      secrets TEXT NOT NULL,
      expires_at INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      last_error TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, provider, external_id)
    );
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      media TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      scheduled_at INTEGER,
      published_at INTEGER,
      created_by TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_due ON posts(status, scheduled_at);
    CREATE TABLE IF NOT EXISTS post_targets (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      remote_id TEXT,
      remote_url TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER,
      UNIQUE(post_id, account_id)
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      verifier TEXT NOT NULL,
      extra TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mastodon_apps (
      instance TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      redirect_uri TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_messages (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

const g = globalThis as unknown as { __pgDb?: Database.Database };

/** Opened on first use (not at import), so build workers never touch the file. */
export const db = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const real = (g.__pgDb ??= open());
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export function now() {
  return Date.now();
}
