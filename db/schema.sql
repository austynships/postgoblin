-- PostGoblins schema (Postgres / Neon). Timestamps are epoch milliseconds.
-- Apply with: psql "$DATABASE_URL" -f db/schema.sql   (safe to re-run)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at BIGINT NOT NULL
);
-- off = posts publish as scheduled; agent = posts made by the AI agent / MCP wait for approval.
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_required TEXT NOT NULL DEFAULT 'off';

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
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
  expires_at BIGINT,
  status TEXT NOT NULL DEFAULT 'active',
  last_error TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE (user_id, provider, external_id)
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  pathname TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media TEXT NOT NULL DEFAULT '[]',
  options TEXT NOT NULL DEFAULT '{}', -- per-platform settings, e.g. {"youtube":{"title":…}}
  status TEXT NOT NULL,
  scheduled_at BIGINT,
  published_at BIGINT,
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
-- Added after launch; safe to re-run.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS options TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_posts_due ON posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts (user_id);

CREATE TABLE IF NOT EXISTS post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  remote_id TEXT,
  remote_url TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at BIGINT,
  claimed_at BIGINT,
  UNIQUE (post_id, account_id)
);

-- Latest engagement numbers per published target (refreshed by the cron job).
CREATE TABLE IF NOT EXISTS post_metrics (
  target_id TEXT PRIMARY KEY REFERENCES post_targets(id) ON DELETE CASCADE,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  fetched_at BIGINT NOT NULL,
  error TEXT
);

-- Approval requests. A post waiting for sign-off has status pending_approval and
-- one pending row here; the token is the private review link sent to the reviewer.
CREATE TABLE IF NOT EXISTS post_approvals (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | changes_requested | cancelled
  requested_by TEXT NOT NULL DEFAULT 'user',
  reviewer_name TEXT,
  note TEXT,
  decided_by TEXT, -- owner | link
  requested_at BIGINT NOT NULL,
  decided_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_post_approvals_post ON post_approvals (post_id, requested_at);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  verifier TEXT NOT NULL,
  extra TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
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
  created_at BIGINT NOT NULL,
  last_used_at BIGINT
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  seq BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
