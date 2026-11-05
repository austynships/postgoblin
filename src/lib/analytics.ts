import { loadAccountContext } from "./accounts";
import { all, now, run } from "./db";
import { PLATFORM_IDS } from "./postOptions";
import { getProvider } from "./providers";
import { ProviderError } from "./providers/types";
import { ensureFreshToken } from "./scheduler";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Only posts this recent are refreshed; older numbers stay as last fetched. */
const TRACK_FOR = 90 * DAY;

/** Platforms whose providers can report post metrics. */
export const METRIC_PLATFORMS = PLATFORM_IDS.filter((p) => !!getProvider(p).metrics);

type StaleTarget = { id: string; account_id: string; remote_id: string; provider: string };

/**
 * Fetches fresh numbers for published posts whose metrics are missing or stale.
 * New posts (under 2 days) refresh hourly, older ones every 12 hours, unless
 * `maxAge` asks for fresher data (the "Refresh" button).
 */
export async function refreshMetrics(opts: { userId?: string; limit?: number; maxAge?: number } = {}) {
  const t = now();
  const platforms = METRIC_PLATFORMS;
  const args: unknown[] = [t - TRACK_FOR, ...platforms];
  let userFilter = "";
  if (opts.userId) {
    userFilter = "AND p.user_id = ?";
    args.push(opts.userId);
  }
  const ageClause =
    opts.maxAge !== undefined
      ? "m.fetched_at < ?"
      : "m.fetched_at < ?::bigint - CASE WHEN p.published_at > ?::bigint THEN 3600000::bigint ELSE 43200000::bigint END";
  args.push(t);
  if (opts.maxAge !== undefined) args[args.length - 1] = t - opts.maxAge;
  else args.push(t - 2 * DAY);
  args.push(Math.min(opts.limit ?? 15, 100));

  const stale = await all<StaleTarget>(
    `SELECT t.id, t.account_id, t.remote_id, a.provider
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN post_metrics m ON m.target_id = t.id
     WHERE t.status = 'published' AND t.remote_id IS NOT NULL AND t.remote_id <> ''
       AND p.published_at > ?
       AND a.provider IN (${platforms.map(() => "?").join(",")})
       ${userFilter}
       AND (m.fetched_at IS NULL OR ${ageClause})
     ORDER BY m.fetched_at ASC NULLS FIRST
     LIMIT ?`,
    args,
  );

  // One token refresh per account, then each post.
  const byAccount = new Map<string, StaleTarget[]>();
  for (const s of stale) byAccount.set(s.account_id, [...(byAccount.get(s.account_id) ?? []), s]);

  let refreshed = 0;
  const errors: string[] = [];
  for (const [accountId, targets] of byAccount) {
    const account = await loadAccountContext(accountId);
    if (!account) continue;
    const provider = getProvider(account.provider);
    let tokenError: string | null = null;
    try {
      await ensureFreshToken(account);
    } catch (err) {
      tokenError = (err as Error).message;
    }
    for (const target of targets) {
      try {
        if (tokenError) throw new ProviderError(tokenError);
        const m = await provider.metrics!(account, target.remote_id);
        await run(
          `INSERT INTO post_metrics (target_id, views, likes, comments, shares, fetched_at, error)
           VALUES (?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT (target_id) DO UPDATE SET views = EXCLUDED.views, likes = EXCLUDED.likes,
             comments = EXCLUDED.comments, shares = EXCLUDED.shares, fetched_at = EXCLUDED.fetched_at, error = NULL`,
          [target.id, clampInt(m.views), clampInt(m.likes), clampInt(m.comments), clampInt(m.shares), now()],
        );
        refreshed++;
      } catch (err) {
        // Keep the last good numbers; record the error and back off until the next window.
        const message = (err as Error).message.slice(0, 500);
        errors.push(`${provider.name}: ${message}`);
        await run(
          `INSERT INTO post_metrics (target_id, fetched_at, error) VALUES (?, ?, ?)
           ON CONFLICT (target_id) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, error = EXCLUDED.error`,
          [target.id, now(), message],
        );
      }
    }
  }
  return { refreshed, checked: stale.length, errors: errors.slice(0, 5) };
}

const clampInt = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.max(0, Math.min(2_000_000_000, Math.round(v))));

type Row = {
  target_id: string;
  post_id: string;
  content: string;
  options: string;
  published_at: number;
  provider: string;
  account_name: string;
  remote_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  fetched_at: number | null;
  error: string | null;
};

export type Totals = { posts: number; views: number; likes: number; comments: number; shares: number; engagement: number };

const emptyTotals = (): Totals => ({ posts: 0, views: 0, likes: 0, comments: 0, shares: 0, engagement: 0 });

function add(t: Totals, r: Row) {
  t.posts++;
  t.views += r.views ?? 0;
  t.likes += r.likes ?? 0;
  t.comments += r.comments ?? 0;
  t.shares += r.shares ?? 0;
  t.engagement += (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0);
}

const dayKey = (ms: number, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(ms));

/** Everything the Analytics page (and the agent) shows, for the last `days` days. */
export async function getAnalytics(userId: string, timeZone: string, days: number) {
  const span = Math.min(Math.max(Math.round(days) || 30, 1), 365);
  const to = now();
  const from = to - span * DAY;
  const rows = await all<Row>(
    `SELECT t.id AS target_id, p.id AS post_id, p.content, p.options, p.published_at, a.provider, a.name AS account_name,
            t.remote_url, m.views, m.likes, m.comments, m.shares, m.fetched_at, m.error
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN post_metrics m ON m.target_id = t.id
     WHERE p.user_id = ? AND t.status = 'published' AND p.published_at >= ? AND p.published_at <= ?
     ORDER BY p.published_at DESC`,
    [userId, from, to],
  );

  const tracked = rows.filter((r) => METRIC_PLATFORMS.includes(r.provider as never));
  const totals = emptyTotals();
  for (const r of tracked) add(totals, r);

  const platforms = new Map<string, Totals & { tracked: boolean; pending: number }>();
  for (const r of rows) {
    const isTracked = METRIC_PLATFORMS.includes(r.provider as never);
    const p = platforms.get(r.provider) ?? { ...emptyTotals(), tracked: isTracked, pending: 0 };
    add(p, r);
    if (isTracked && r.fetched_at === null) p.pending++;
    platforms.set(r.provider, p);
  }

  // One bucket per calendar day in the user's timezone, oldest first, including empty days.
  const daily = new Map<string, { day: string; posts: number; engagement: number; views: number }>();
  for (let i = span - 1; i >= 0; i--) {
    const day = dayKey(to - i * DAY, timeZone);
    daily.set(day, { day, posts: 0, engagement: 0, views: 0 });
  }
  for (const r of rows) {
    const d = daily.get(dayKey(r.published_at, timeZone));
    if (!d) continue;
    d.posts++;
    d.engagement += (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0);
    d.views += r.views ?? 0;
  }

  const top = tracked
    .filter((r) => r.fetched_at !== null)
    .map((r) => ({
      targetId: r.target_id,
      postId: r.post_id,
      content: r.content,
      provider: r.provider,
      accountName: r.account_name,
      url: r.remote_url,
      publishedAt: r.published_at,
      views: r.views,
      likes: r.likes ?? 0,
      comments: r.comments ?? 0,
      shares: r.shares,
      engagement: (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0),
    }))
    .sort((a, b) => b.engagement - a.engagement || (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 10);

  const errors = tracked
    .filter((r) => r.error)
    .map((r) => ({ provider: r.provider, accountName: r.account_name, error: r.error! }));
  const fetched = tracked.map((r) => r.fetched_at ?? 0).filter(Boolean);

  return {
    days: span,
    from,
    to,
    totals,
    untrackedPosts: rows.length - tracked.length,
    platforms: [...platforms.entries()]
      .map(([provider, v]) => ({ provider, ...v }))
      .sort((a, b) => b.engagement - a.engagement || b.posts - a.posts),
    daily: [...daily.values()],
    top,
    pending: tracked.filter((r) => r.fetched_at === null).length,
    lastUpdated: fetched.length ? Math.max(...fetched) : null,
    // De-duplicated per account, newest first.
    errors: [...new Map(errors.map((e) => [`${e.provider}:${e.accountName}`, e])).values()].slice(0, 5),
  };
}

export type AnalyticsView = Awaited<ReturnType<typeof getAnalytics>>;
