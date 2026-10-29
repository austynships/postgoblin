import { after } from "next/server";
import { loadAccountContext, markAccount, updateAccountSecrets } from "./accounts";
import { all, now, one, run } from "./db";
import { getMedia } from "./media";
import { getProvider } from "./providers";
import { ProviderError } from "./providers/types";

const MAX_ATTEMPTS = 3;
const REFRESH_WINDOW = 7 * 24 * 60 * 60 * 1000;
/** A target stuck in 'sending' this long (crashed or timed-out function) goes back in the queue. */
const STALE_CLAIM = 5 * 60 * 1000;

type DueTarget = { id: string; post_id: string; account_id: string; attempts: number };

const g = globalThis as unknown as { __pgScheduler?: { timer?: NodeJS.Timeout; running: boolean } };

async function publishTarget(target: DueTarget) {
  // Claim the row atomically so overlapping runs never double-post.
  const claimed = await one(
    "UPDATE post_targets SET status = 'sending', claimed_at = ? WHERE id = ? AND status = 'pending' RETURNING id",
    [now(), target.id],
  );
  if (!claimed) return;
  await run("UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ?", [now(), target.post_id]);

  const post = await one<{ user_id: string; content: string; media: string }>(
    "SELECT user_id, content, media FROM posts WHERE id = ?",
    [target.post_id],
  );
  const attempts = target.attempts + 1;

  try {
    if (!post) throw new ProviderError("Post was deleted", false);
    const account = await loadAccountContext(target.account_id);
    if (!account) throw new ProviderError("Account was disconnected", false);
    const provider = getProvider(account.provider);

    if (provider.refresh && account.expiresAt && account.expiresAt - now() < REFRESH_WINDOW) {
      const refreshed = await provider.refresh(account);
      if (refreshed) {
        await updateAccountSecrets(account.id, refreshed.secrets, refreshed.expiresAt);
        account.secrets = refreshed.secrets;
        account.expiresAt = refreshed.expiresAt ?? null;
      }
    }

    const media = await getMedia(post.user_id, JSON.parse(post.media));
    const result = await provider.publish(account, { text: post.content, media });
    await run(
      `UPDATE post_targets SET status = 'published', remote_id = ?, remote_url = ?, error = NULL, attempts = ?
       WHERE id = ?`,
      [result.id, result.url ?? null, attempts, target.id],
    );
    if (account.status !== "active") await markAccount(account.id, "active");
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const retryable = !(err instanceof ProviderError) || err.retryable;
    const willRetry = retryable && attempts < MAX_ATTEMPTS;
    await run("UPDATE post_targets SET status = ?, error = ?, attempts = ?, next_attempt_at = ? WHERE id = ?", [
      willRetry ? "pending" : "failed",
      message,
      attempts,
      willRetry ? now() + 60_000 * 4 ** (attempts - 1) : null,
      target.id,
    ]);
    if (/\b(401|403)\b|expired|revoked|reconnect/i.test(message)) {
      await markAccount(target.account_id, "error", message);
    }
    console.error(`[scheduler] ${target.post_id} → ${target.account_id}: ${message}`);
  } finally {
    await finalizePost(target.post_id);
  }
}

async function finalizePost(postId: string) {
  const counts = await all<{ status: string; n: number }>(
    "SELECT status, COUNT(*) AS n FROM post_targets WHERE post_id = ? GROUP BY status",
    [postId],
  );
  const c = Object.fromEntries(counts.map((r) => [r.status, r.n])) as Record<string, number>;
  let status: string;
  if ((c.pending ?? 0) + (c.sending ?? 0) > 0) status = "publishing";
  else if (!c.failed) status = "published";
  else if (!c.published) status = "failed";
  else status = "partial";
  const t = now();
  await run(
    `UPDATE posts SET status = ?, updated_at = ?,
       published_at = CASE WHEN ? IN ('published', 'partial') THEN ? ELSE published_at END
     WHERE id = ?`,
    [status, t, status, t, postId],
  );
}

/**
 * Publish everything that's due. Called by the cron endpoint (Vercel), the local
 * interval (development), and right after "post now". Concurrent calls in one
 * process are coalesced; across processes the row claim prevents double posts.
 */
export async function runDue() {
  const state = (g.__pgScheduler ??= { running: false });
  if (state.running) return { published: 0, skipped: true };
  state.running = true;
  try {
    const t = now();
    await run("UPDATE post_targets SET status = 'pending' WHERE status = 'sending' AND claimed_at < ?", [t - STALE_CLAIM]);
    const due = await all<DueTarget>(
      `SELECT t.id, t.post_id, t.account_id, t.attempts FROM post_targets t
       JOIN posts p ON p.id = t.post_id
       WHERE p.status IN ('scheduled', 'publishing') AND p.scheduled_at <= ?
         AND t.status = 'pending' AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= ?)
       ORDER BY p.scheduled_at LIMIT 25`,
      [t, t],
    );
    await Promise.all(due.map(publishTarget));

    // Posts whose targets were all removed (e.g. account disconnected).
    await run(
      `UPDATE posts SET status = 'failed', updated_at = ? WHERE status IN ('scheduled','publishing') AND scheduled_at <= ?
       AND NOT EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id = posts.id)`,
      [t, t],
    );
    await run("DELETE FROM oauth_states WHERE created_at < ?", [t - 60 * 60 * 1000]);
    await run("DELETE FROM sessions WHERE expires_at < ?", [t]);
    return { published: due.length, skipped: false };
  } catch (err) {
    console.error("[scheduler] run failed", err);
    throw err;
  } finally {
    state.running = false;
  }
}

/**
 * Publish due posts right after the current response is sent ("post now").
 * `after()` keeps a serverless function alive until the work finishes.
 */
export function publishSoon() {
  try {
    after(() => runDue().catch(() => {}));
  } catch {
    // Outside a request (e.g. scripts): just run it.
    void runDue().catch(() => {});
  }
}

/** Local development only: on Vercel the cron endpoint drives publishing. */
export function startLocalScheduler() {
  if (g.__pgScheduler?.timer || process.env.VERCEL) return;
  const seconds = Math.max(5, Number(process.env.SCHEDULER_INTERVAL ?? 20));
  g.__pgScheduler = { running: false, timer: setInterval(() => runDue().catch(() => {}), seconds * 1000) };
  console.log(`[scheduler] local scheduler checking every ${seconds}s`);
}
