import { HttpError, requireUser, type User } from "./auth";
import { all, now, one } from "./db";
import { getProvider } from "./providers";

const ADMIN_DOMAIN = "@postgoblins.com";
const DAY = 24 * 60 * 60 * 1000;
/** Matches SESSION_TTL in auth.ts: a session's expiry minus this is when the user signed in. */
const SESSION_TTL = 30 * DAY;

/**
 * Admins are @postgoblins.com addresses that are also listed in ADMIN_EMAILS
 * (comma separated). Signup doesn't verify email addresses, so the domain alone
 * isn't proof; the allowlist is.
 */
export function isAdmin(user: Pick<User, "email"> | null | undefined) {
  if (!user) return false;
  const email = user.email.trim().toLowerCase();
  if (!email.endsWith(ADMIN_DOMAIN)) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email);
}

/** Non-admins get a plain 404 so the admin API doesn't advertise itself. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new HttpError(404, "Not found");
  return user;
}

const platformName = (p: string) => {
  try {
    return getProvider(p).name;
  } catch {
    return p;
  }
};

export async function getOverview() {
  const t = now();
  const users = await one<{ total: number; d7: number; d30: number; active7: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE created_at > ?)::int AS d7,
            COUNT(*) FILTER (WHERE created_at > ?)::int AS d30,
            (SELECT COUNT(DISTINCT user_id)::int FROM sessions WHERE expires_at - ? > ?) AS active7
     FROM users`,
    [t - 7 * DAY, t - 30 * DAY, SESSION_TTL, t - 7 * DAY],
  );
  const accounts = await all<{ provider: string; n: number; errors: number }>(
    `SELECT provider, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE status <> 'active')::int AS errors
     FROM accounts GROUP BY provider ORDER BY n DESC`,
  );
  const posts = await all<{ status: string; n: number }>("SELECT status, COUNT(*)::int AS n FROM posts GROUP BY status");
  const deliveries = await one<{ published24: number; published7: number; failed7: number }>(
    `SELECT COUNT(*) FILTER (WHERE t.status = 'published' AND p.published_at > ?)::int AS published24,
            COUNT(*) FILTER (WHERE t.status = 'published' AND p.published_at > ?)::int AS published7,
            COUNT(*) FILTER (WHERE t.status = 'failed' AND p.updated_at > ?)::int AS failed7
     FROM post_targets t JOIN posts p ON p.id = t.post_id`,
    [t - DAY, t - 7 * DAY, t - 7 * DAY],
  );
  // Health: anything due more than 5 minutes ago that hasn't gone out means the cron job isn't running.
  const queue = await one<{ due: number; overdue: number; oldest: number | null; upcoming: number }>(
    `SELECT COUNT(*) FILTER (WHERE p.scheduled_at <= ?)::int AS due,
            COUNT(*) FILTER (WHERE p.scheduled_at <= ?)::int AS overdue,
            MIN(p.scheduled_at) FILTER (WHERE p.scheduled_at <= ?) AS oldest,
            COUNT(*) FILTER (WHERE p.scheduled_at > ?)::int AS upcoming
     FROM post_targets t JOIN posts p ON p.id = t.post_id
     WHERE p.status IN ('scheduled','publishing') AND t.status IN ('pending','sending')`,
    [t, t - 5 * 60_000, t, t],
  );
  const last = await one<{ at: number | null }>("SELECT MAX(published_at) AS at FROM posts WHERE published_at IS NOT NULL");

  return {
    users: users!,
    accounts: accounts.map((a) => ({ ...a, platform: platformName(a.provider) })),
    posts: Object.fromEntries(posts.map((p) => [p.status, p.n])) as Record<string, number>,
    deliveries: deliveries!,
    queue: { ...queue!, oldest: queue?.oldest === null || queue?.oldest === undefined ? null : Number(queue.oldest) },
    lastPublishedAt: last?.at ? Number(last.at) : null,
  };
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt: number;
  lastSignInAt: number | null;
  accounts: number;
  accountErrors: number;
  posts: number;
  scheduled: number;
  published: number;
  failed: number;
  admin: boolean;
};

export async function listUsers(opts: { q?: string; id?: string; limit?: number; offset?: number }) {
  const q = (opts.q ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const where = opts.id ? "WHERE u.id = ?" : q ? "WHERE LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?" : "";
  const args = opts.id ? [opts.id] : q ? [like, like] : [];
  const total = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM users u ${where}`, args);
  const rows = await all<{
    id: string;
    name: string;
    email: string;
    timezone: string;
    created_at: number;
    session_expires: number | null;
    accounts: number;
    account_errors: number;
    posts: number;
    scheduled: number;
    published: number;
    failed: number;
  }>(
    `SELECT u.id, u.name, u.email, u.timezone, u.created_at,
            (SELECT MAX(expires_at) FROM sessions s WHERE s.user_id = u.id) AS session_expires,
            (SELECT COUNT(*)::int FROM accounts a WHERE a.user_id = u.id) AS accounts,
            (SELECT COUNT(*)::int FROM accounts a WHERE a.user_id = u.id AND a.status <> 'active') AS account_errors,
            (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id) AS posts,
            (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND p.status = 'scheduled') AS scheduled,
            (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND p.status IN ('published','partial')) AS published,
            (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND p.status IN ('failed','partial')) AS failed
     FROM users u ${where}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
  const users: AdminUserRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    timezone: r.timezone,
    createdAt: Number(r.created_at),
    lastSignInAt: r.session_expires ? Number(r.session_expires) - SESSION_TTL : null,
    accounts: r.accounts,
    accountErrors: r.account_errors,
    posts: r.posts,
    scheduled: r.scheduled,
    published: r.published,
    failed: r.failed,
    admin: isAdmin(r),
  }));
  return { total: total?.n ?? 0, users };
}

/** One user's accounts and recent posts. Never includes tokens or other secrets. */
export async function getUserDetail(userId: string) {
  const [user] = (await listUsers({ id: userId, limit: 1 })).users;
  if (!user) throw new HttpError(404, "User not found");

  const accounts = await all<{
    id: string;
    provider: string;
    name: string;
    username: string | null;
    status: string;
    last_error: string | null;
    created_at: number;
    expires_at: number | null;
  }>(
    "SELECT id, provider, name, username, status, last_error, created_at, expires_at FROM accounts WHERE user_id = ? ORDER BY created_at",
    [userId],
  );
  const posts = await all<{
    id: string;
    content: string;
    status: string;
    scheduled_at: number | null;
    published_at: number | null;
    created_by: string;
    created_at: number;
  }>(
    "SELECT id, content, status, scheduled_at, published_at, created_by, created_at FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 25",
    [userId],
  );
  const targets = posts.length
    ? await all<{ post_id: string; provider: string; account_name: string; status: string; error: string | null; remote_url: string | null }>(
        `SELECT t.post_id, a.provider, a.name AS account_name, t.status, t.error, t.remote_url
         FROM post_targets t JOIN accounts a ON a.id = t.account_id
         WHERE t.post_id IN (${posts.map(() => "?").join(",")})`,
        posts.map((p) => p.id),
      )
    : [];

  return {
    user,
    accounts: accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      platform: platformName(a.provider),
      name: a.name,
      username: a.username,
      status: a.status,
      lastError: a.last_error,
      connectedAt: Number(a.created_at),
      tokenExpiresAt: a.expires_at ? Number(a.expires_at) : null,
    })),
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      status: p.status,
      at: Number(p.scheduled_at ?? p.published_at ?? p.created_at),
      createdBy: p.created_by,
      targets: targets
        .filter((t) => t.post_id === p.id)
        .map((t) => ({ provider: t.provider, accountName: t.account_name, status: t.status, error: t.error, url: t.remote_url })),
    })),
  };
}

/** Failed deliveries across all users, newest first: the support inbox. */
export async function recentFailures(limit = 50) {
  const rows = await all<{
    post_id: string;
    content: string;
    updated_at: number;
    user_id: string;
    email: string;
    provider: string;
    account_name: string;
    error: string | null;
    attempts: number;
  }>(
    `SELECT p.id AS post_id, p.content, p.updated_at, u.id AS user_id, u.email, a.provider, a.name AS account_name, t.error, t.attempts
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     JOIN users u ON u.id = p.user_id
     JOIN accounts a ON a.id = t.account_id
     WHERE t.status = 'failed'
     ORDER BY p.updated_at DESC LIMIT ?`,
    [Math.min(limit, 200)],
  );
  return rows.map((r) => ({
    postId: r.post_id,
    content: r.content,
    at: Number(r.updated_at),
    userId: r.user_id,
    email: r.email,
    provider: r.provider,
    platform: platformName(r.provider),
    accountName: r.account_name,
    error: r.error,
    attempts: r.attempts,
  }));
}
