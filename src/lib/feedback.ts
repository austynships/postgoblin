import { HttpError } from "./auth";
import { id } from "./crypto";
import { all, now, one, run } from "./db";

export const FEEDBACK_KINDS = ["idea", "bug", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_STATUSES = ["new", "read", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

const MAX_MESSAGE = 4000;
const MAX_PER_DAY = 20;
const DAY = 24 * 60 * 60 * 1000;

export async function sendFeedback(userId: string, input: { kind?: string; message?: string; page?: string }) {
  const kind = FEEDBACK_KINDS.includes(input.kind as FeedbackKind) ? (input.kind as FeedbackKind) : "other";
  const message = String(input.message ?? "").trim();
  if (!message) throw new HttpError(400, "Write a message first");
  if (message.length > MAX_MESSAGE) throw new HttpError(400, `Keep it under ${MAX_MESSAGE} characters`);
  const recent = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM feedback WHERE user_id = ? AND created_at > ?", [
    userId,
    now() - DAY,
  ]);
  if ((recent?.n ?? 0) >= MAX_PER_DAY) throw new HttpError(429, "That's a lot of feedback for one day. Try again tomorrow.");
  await run("INSERT INTO feedback (id, user_id, kind, message, page, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    id("fb_"),
    userId,
    kind,
    message,
    String(input.page ?? "").slice(0, 40) || null,
    now(),
  ]);
}

export type ReviewView = { rating: number; comment: string | null; allowQuote: boolean; updatedAt: number };

export async function getMyReview(userId: string): Promise<ReviewView | null> {
  const r = await one<{ rating: number; comment: string | null; allow_quote: boolean; updated_at: number }>(
    "SELECT rating, comment, allow_quote, updated_at FROM reviews WHERE user_id = ?",
    [userId],
  );
  return r ? { rating: r.rating, comment: r.comment, allowQuote: r.allow_quote, updatedAt: Number(r.updated_at) } : null;
}

/** One review per user; sending again replaces it. */
export async function saveReview(userId: string, input: { rating?: unknown; comment?: unknown; allowQuote?: unknown }) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "Pick 1 to 5 stars");
  const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, 2000) || null : null;
  const t = now();
  await run(
    `INSERT INTO reviews (user_id, rating, comment, allow_quote, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment,
       allow_quote = EXCLUDED.allow_quote, updated_at = EXCLUDED.updated_at`,
    [userId, rating, comment, input.allowQuote === true, t, t],
  );
  return getMyReview(userId);
}

// ---------- admin ----------

export async function listFeedback(opts: { status?: string; limit?: number }) {
  const status = FEEDBACK_STATUSES.includes(opts.status as FeedbackStatus) ? opts.status : null;
  const rows = await all<{
    id: string;
    kind: FeedbackKind;
    message: string;
    page: string | null;
    status: FeedbackStatus;
    created_at: number;
    user_id: string;
    email: string;
    name: string;
  }>(
    `SELECT f.id, f.kind, f.message, f.page, f.status, f.created_at, u.id AS user_id, u.email, u.name
     FROM feedback f JOIN users u ON u.id = f.user_id
     ${status ? "WHERE f.status = ?" : ""}
     ORDER BY f.created_at DESC LIMIT ?`,
    [...(status ? [status] : []), Math.min(opts.limit ?? 100, 500)],
  );
  const counts = await all<{ status: FeedbackStatus; n: number }>("SELECT status, COUNT(*)::int AS n FROM feedback GROUP BY status");
  return {
    counts: Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])) as Record<FeedbackStatus, number>,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      message: r.message,
      page: r.page,
      status: r.status,
      createdAt: Number(r.created_at),
      userId: r.user_id,
      email: r.email,
      name: r.name,
    })),
  };
}

export async function setFeedbackStatus(feedbackId: string, status: string) {
  if (!FEEDBACK_STATUSES.includes(status as FeedbackStatus)) throw new HttpError(400, "Invalid status");
  const row = await one<{ id: string }>("UPDATE feedback SET status = ? WHERE id = ? RETURNING id", [status, feedbackId]);
  if (!row) throw new HttpError(404, "Feedback not found");
}

export async function listReviews(limit = 200) {
  const rows = await all<{
    user_id: string;
    rating: number;
    comment: string | null;
    allow_quote: boolean;
    updated_at: number;
    email: string;
    name: string;
  }>(
    `SELECT r.user_id, r.rating, r.comment, r.allow_quote, r.updated_at, u.email, u.name
     FROM reviews r JOIN users u ON u.id = r.user_id ORDER BY r.updated_at DESC LIMIT ?`,
    [Math.min(limit, 500)],
  );
  const stats = await one<{ n: number; avg: number | null }>("SELECT COUNT(*)::int AS n, AVG(rating)::float AS avg FROM reviews");
  const dist = await all<{ rating: number; n: number }>("SELECT rating, COUNT(*)::int AS n FROM reviews GROUP BY rating");
  return {
    total: stats?.n ?? 0,
    average: stats?.avg ?? null,
    distribution: [5, 4, 3, 2, 1].map((r) => ({ rating: r, n: dist.find((d) => d.rating === r)?.n ?? 0 })),
    items: rows.map((r) => ({
      userId: r.user_id,
      rating: r.rating,
      comment: r.comment,
      allowQuote: r.allow_quote,
      updatedAt: Number(r.updated_at),
      email: r.email,
      name: r.name,
    })),
  };
}
