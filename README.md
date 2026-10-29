# 👺 PostGoblins

Agentic social media scheduling. Users sign up, connect their **own** social accounts, and create, schedule and
publish posts — by hand, with an AI agent, or from any external AI agent over **MCP**.

## Features

- **Calendar** (week / month) and **Posts** list (upcoming, drafts, published, failed)
- **Composer** with multi-account targeting, per-platform character counters, image/video upload, live preview,
  schedule / post now / save draft, and one-click **AI assist** (rewrite, shorten, hashtags, generate)
- **Goblin agent**: a Claude-powered chat agent that reads your accounts and calendar and acts on them:
  plans campaigns, writes platform-native copy, picks open time slots, schedules, edits, deletes and retries posts
- **MCP server** at `/api/mcp` so Claude Code, Claude Desktop, Cursor or your own agents can drive PostGoblins
- **Background scheduler** with atomic claiming (no double posts), per-account delivery status, automatic retries with
  backoff (1 min, 4 min), token refresh, and crash recovery
- **Integrations**: X, Bluesky, Mastodon, LinkedIn, Threads, Facebook Pages, Discord, Telegram
- Multi-user email/password auth; social tokens are **encrypted at rest** (AES-256-GCM)

## Quick start

```bash
npm install
cp .env.example .env      # then fill in ENCRYPTION_KEY (and optionally the rest)
npm run dev               # http://localhost:3000
```

### Local HTTPS (needed for Threads)

Threads only accepts `https://` redirect URLs, so to connect Threads locally run the dev server over HTTPS:

```bash
npm run dev:https         # https://localhost:3000 (self-signed certificate, created on first run)
```

and set `APP_URL=https://localhost:3000` in `.env`. Register the `https://localhost:3000/api/oauth/callback/<platform>`
redirect URLs in each developer portal. The first run may ask Windows/macOS to trust the local certificate.
Threads image posts still need a public URL (tunnel or real hosting), because Threads downloads media from your server.

Data lives in **Postgres** (Neon recommended; schema in `db/schema.sql`), so `DATABASE_URL` is required even
locally. Uploads go to **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set, otherwise to `./uploads`.
Locally, an in-process scheduler publishes due posts every `SCHEDULER_INTERVAL` seconds.

## Deploying to Vercel

1. **Database.** Create a Neon Postgres database and run `db/schema.sql` against it (safe to re-run).
2. **Blob storage.** In the Vercel project: Storage → Create → Blob, and connect it to the project. This adds
   `BLOB_READ_WRITE_TOKEN` automatically.
3. **Environment variables** (Project → Settings → Environment Variables): `DATABASE_URL`, `ENCRYPTION_KEY`
   (the **same** value you use locally, or saved accounts can't be decrypted), `CRON_SECRET`,
   `APP_URL=https://<your-domain>`, plus `ANTHROPIC_API_KEY` and any platform keys you use.
4. **Redirect URLs.** Register `https://<your-domain>/api/oauth/callback/<platform>` in each developer portal.
5. **Scheduler.** Posts are published by `GET /api/cron/publish`, which must be called **every minute**:
   - **Vercel Pro:** change the schedule in `vercel.json` to `* * * * *`. Vercel sends the `CRON_SECRET` header itself.
   - **Vercel Hobby** (cron limited to once a day): create a free job at [cron-job.org](https://cron-job.org) that
     requests `https://<your-domain>/api/cron/publish` every minute with the header
     `Authorization: Bearer <CRON_SECRET>`. The daily Vercel cron in `vercel.json` stays as a safety net.

"Post now" and retries publish immediately after the request, without waiting for the cron.

## Configuration (`.env`)

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public base URL. OAuth redirect URIs are `{APP_URL}/api/oauth/callback/{provider}` |
| `ENCRYPTION_KEY` | 32+ random chars; encrypts stored tokens. **Don't lose or change it.** |
| `ANTHROPIC_API_KEY` | Enables the agent and AI assist. `ANTHROPIC_MODEL` (default `claude-opus-5-5`) and `ANTHROPIC_EFFORT` (default `medium`) are optional |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | X OAuth 2.0 app (confidential client) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn app with *OpenID Connect* + *Share on LinkedIn*; `LINKEDIN_VERSION` sets the API version header |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` | Meta app with the Threads use case |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Meta app with `pages_manage_posts`, `pages_show_list` |
| `FACEBOOK_CONFIG_ID` | Required for Meta business apps using *Facebook Login for Business*: the login configuration ID (Facebook Login for Business → Configurations) |
| `SCHEDULER_INTERVAL` | Seconds between scheduler ticks (default 20) |

**No server keys needed:** Bluesky (app password), Mastodon (the app registers itself on each server), Discord
(channel webhook) and Telegram (bot token + channel). Platforms without credentials show as "Server setup needed".

Notes:
- **Threads** fetches images by URL, so image posts need `APP_URL` to be publicly reachable.
- **LinkedIn** tokens last 60 days and, for most apps, can't be refreshed, so users reconnect when warned.
- **X** API posting requires a paid API tier.

## MCP server

Each user creates API keys under **Settings & MCP**. The endpoint is stateless Streamable HTTP:

```bash
claude mcp add --transport http postgoblins https://your-host/api/mcp --header "Authorization: Bearer pg_..."
```

Tools: `get_current_time`, `list_accounts`, `list_posts`, `get_post`, `create_post`, `update_post`, `delete_post`,
`retry_post`, `find_open_slots`, `list_media`. Read-only tools carry `readOnlyHint`, and `delete_post` carries
`destructiveHint`. Keys are stored hashed and can be revoked at any time.

## Architecture

```
src/
  instrumentation.ts        starts the scheduler with the server
  lib/
    db.ts                   SQLite schema (better-sqlite3)
    auth.ts, crypto.ts      sessions, password hashing, token encryption
    posts.ts                post CRUD + per-platform validation
    scheduler.ts            due-post publisher, retries, token refresh
    agent.ts                Claude tool-use agent + tools (shared with MCP)
    apikeys.ts              API keys for MCP
    providers/*.ts          one file per platform (connect, refresh, publish)
  app/api/...               REST routes, OAuth callback, /api/mcp
  components/...            React UI
```

To add a platform, implement the `Provider` interface in `src/lib/providers/types.ts` and register it in
`providers/index.ts`.
