import { loadAccountContext, markAccount, updateAccountSecrets } from "./accounts";
import { db, now } from "./db";
import { getMedia } from "./media";
import { getProvider } from "./providers";
import { ProviderError } from "./providers/types";

const MAX_ATTEMPTS = 3;
const REFRESH_WINDOW = 7 * 24 * 60 * 60 * 1000;

type DueTarget = { id: string; post_id: string; account_id: string; attempts: number };

const g = globalThis as unknown as { __pgScheduler?: { timer: NodeJS.Timeout; running: boolean } };

async function publishTarget(target: DueTarget) {
  // Claim the row so overlapping ticks never double-post.
  const claimed = db
    .prepare("UPDATE post_targets SET status = 'sending' WHERE id = ? AND status = 'pending'")
    .run(target.id).changes;
  if (!claimed) return;
  db.prepare("UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ?").run(now(), target.post_id);

  const post = db.prepare("SELECT user_id, content, media FROM posts WHERE id = ?").get(target.post_id) as {
    user_id: string;
    content: string;
    media: string;
  };
  const attempts = target.attempts + 1;

  try {
    const account = loadAccountContext(target.account_id);
    if (!account) throw new ProviderError("Account was disconnected", false);
    const provider = getProvider(account.provider);

    if (provider.refresh && account.expiresAt && account.expiresAt - now() < REFRESH_WINDOW) {
      const refreshed = await provider.refresh(account);
      if (refreshed) {
        updateAccountSecrets(account.id, refreshed.secrets, refreshed.expiresAt);
        account.secrets = refreshed.secrets;
        account.expiresAt = refreshed.expiresAt ?? null;
      }
    }

    const media = getMedia(post.user_id, JSON.parse(post.media));
    const result = await provider.publish(account, { text: post.content, media });
    db.prepare(
      `UPDATE post_targets SET status = 'published', remote_id = ?, remote_url = ?, error = NULL, attempts = ?
       WHERE id = ?`,
    ).run(result.id, result.url ?? null, attempts, target.id);
    if (account.status !== "active") markAccount(account.id, "active");
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const retryable = !(err instanceof ProviderError) || err.retryable;
    const willRetry = retryable && attempts < MAX_ATTEMPTS;
    db.prepare(
      "UPDATE post_targets SET status = ?, error = ?, attempts = ?, next_attempt_at = ? WHERE id = ?",
    ).run(
      willRetry ? "pending" : "failed",
      message,
      attempts,
      willRetry ? now() + 60_000 * 4 ** (attempts - 1) : null,
      target.id,
    );
    if (/\b(401|403)\b|expired|revoked|reconnect/i.test(message)) markAccount(target.account_id, "error", message);
    console.error(`[scheduler] ${target.post_id} → ${target.account_id}: ${message}`);
  } finally {
    finalizePost(target.post_id);
  }
}

function finalizePost(postId: string) {
  const counts = db
    .prepare("SELECT status, COUNT(*) AS n FROM post_targets WHERE post_id = ? GROUP BY status")
    .all(postId) as { status: string; n: number }[];
  const c = Object.fromEntries(counts.map((r) => [r.status, r.n])) as Record<string, number>;
  let status: string;
  if ((c.pending ?? 0) + (c.sending ?? 0) > 0) status = "publishing";
  else if (!c.failed) status = "published";
  else if (!c.published) status = "failed";
  else status = "partial";
  db.prepare(
    "UPDATE posts SET status = ?, published_at = CASE WHEN ? IN ('published','partial') THEN ? ELSE published_at END, updated_at = ? WHERE id = ?",
  ).run(status, status, now(), now(), postId);
}

/** Publish everything that's due. Safe to call any time; concurrent calls are coalesced. */
export async function runDue() {
  const state = g.__pgScheduler;
  if (state?.running) return;
  if (state) state.running = true;
  try {
    const t = now();
    const due = db
      .prepare(
        `SELECT t.id, t.post_id, t.account_id, t.attempts FROM post_targets t
         JOIN posts p ON p.id = t.post_id
         WHERE p.status IN ('scheduled', 'publishing') AND p.scheduled_at <= ?
           AND t.status = 'pending' AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= ?)
         ORDER BY p.scheduled_at LIMIT 50`,
      )
      .all(t, t) as DueTarget[];
    await Promise.all(due.map(publishTarget));

    // Posts whose targets were all removed (e.g. account disconnected).
    db.prepare(
      `UPDATE posts SET status = 'failed', updated_at = ? WHERE status IN ('scheduled','publishing') AND scheduled_at <= ?
       AND NOT EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id = posts.id)`,
    ).run(t, t);
    db.prepare("DELETE FROM oauth_states WHERE created_at < ?").run(t - 60 * 60 * 1000);
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(t);
  } catch (err) {
    console.error("[scheduler] tick failed", err);
  } finally {
    if (state) state.running = false;
  }
}

export function startScheduler() {
  if (g.__pgScheduler) return;
  // Anything mid-send when the server stopped goes back in the queue.
  db.prepare("UPDATE post_targets SET status = 'pending' WHERE status = 'sending'").run();
  const seconds = Math.max(5, Number(process.env.SCHEDULER_INTERVAL ?? 20));
  g.__pgScheduler = { timer: setInterval(runDue, seconds * 1000), running: false };
  console.log(`[scheduler] started, checking every ${seconds}s`);
  void runDue();
}
