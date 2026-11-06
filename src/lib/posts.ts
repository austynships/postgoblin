import { getAccountsByIds } from "./accounts";
import { HttpError, appUrl } from "./auth";
import { id, randomToken } from "./crypto";
import { all, now, one, run, tx } from "./db";
import { CHAR_LIMITS, countChars } from "./limits";
import { getMedia, publicMedia, type PublicMedia } from "./media";
import {
  COMMENT_LIMITS,
  MAX_THREAD_PARTS,
  YOUTUBE_THUMBNAIL_MAX_BYTES,
  partsFor,
  sanitizeOptions,
  supportsComments,
  textFor,
  youtubeProblems,
  type PlatformId,
  type PostOptions,
} from "./postOptions";
import { getProvider } from "./providers";

export type PostStatus = "draft" | "pending_approval" | "scheduled" | "publishing" | "published" | "partial" | "failed";

/** The latest approval request for a post (null when it was never sent for approval). */
export type ApprovalView = {
  status: "pending" | "approved" | "changes_requested" | "cancelled";
  /** Private review link; only shown while the request is pending. */
  link: string | null;
  requestedBy: "user" | "agent";
  reviewerName: string | null;
  note: string | null;
  decidedBy: "owner" | "link" | null;
  requestedAt: number;
  decidedAt: number | null;
};

type ApprovalRow = {
  id: string;
  post_id: string;
  token: string;
  status: ApprovalView["status"];
  requested_by: "user" | "agent";
  reviewer_name: string | null;
  note: string | null;
  decided_by: "owner" | "link" | null;
  requested_at: number;
  decided_at: number | null;
};

export const reviewLink = (token: string) => `${appUrl()}/review/${token}`;

function approvalView(r: ApprovalRow | undefined): ApprovalView | null {
  if (!r) return null;
  return {
    status: r.status,
    link: r.status === "pending" ? reviewLink(r.token) : null,
    requestedBy: r.requested_by,
    reviewerName: r.reviewer_name,
    note: r.note,
    decidedBy: r.decided_by,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
  };
}

export type PostView = {
  id: string;
  content: string;
  media: PublicMedia[];
  options: PostOptions;
  /** The YouTube custom thumbnail, when one is set. */
  thumbnail: PublicMedia | null;
  status: PostStatus;
  scheduledAt: number | null;
  publishedAt: number | null;
  createdBy: "user" | "agent";
  createdAt: number;
  updatedAt: number;
  approval: ApprovalView | null;
  targets: {
    accountId: string;
    provider: string;
    accountName: string;
    avatar: string | null;
    status: "pending" | "sending" | "published" | "failed";
    remoteUrl: string | null;
    error: string | null;
    attempts: number;
  }[];
};

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  media: string;
  options: string;
  status: PostStatus;
  scheduled_at: number | null;
  published_at: number | null;
  created_by: "user" | "agent";
  created_at: number;
  updated_at: number;
};

export type PostInput = {
  content: string;
  accountIds: string[];
  mediaIds?: string[];
  /** Per-platform settings (e.g. YouTube title, privacy, made for kids). */
  options?: PostOptions;
  /**
   * draft = save only, schedule = publish at scheduledAt, now = publish immediately,
   * review = wait for approval, then publish at scheduledAt (or right away if that has passed / is empty).
   */
  mode: "draft" | "schedule" | "now" | "review";
  scheduledAt?: number | null;
};

async function hydrate(userId: string, rows: PostRow[]): Promise<PostView[]> {
  if (!rows.length) return [];
  const targets = await all(
    `SELECT t.post_id, t.account_id, t.status, t.remote_url, t.error, t.attempts, a.provider, a.name, a.avatar
     FROM post_targets t JOIN accounts a ON a.id = t.account_id
     WHERE t.post_id IN (${rows.map(() => "?").join(",")})`,
    rows.map((r) => r.id),
  );
  const approvals = await all<ApprovalRow>(
    `SELECT * FROM post_approvals WHERE post_id IN (${rows.map(() => "?").join(",")}) ORDER BY requested_at ASC`,
    rows.map((r) => r.id),
  );
  const latest = new Map(approvals.map((a) => [a.post_id, a]));
  return Promise.all(
    rows.map(async (r) => {
      const mediaIds = JSON.parse(r.media) as string[];
      let media: PublicMedia[] = [];
      try {
        media = (await getMedia(userId, mediaIds)).map(publicMedia);
      } catch {}
      const options = sanitizeOptions(JSON.parse(r.options || "{}"));
      let thumbnail: PublicMedia | null = null;
      if (options.youtube?.thumbnailId) {
        try {
          thumbnail = publicMedia((await getMedia(userId, [options.youtube.thumbnailId]))[0]);
        } catch {}
      }
      return {
        id: r.id,
        content: r.content,
        media,
        options,
        thumbnail,
        status: r.status,
        scheduledAt: r.scheduled_at,
        publishedAt: r.published_at,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        approval: approvalView(latest.get(r.id)),
        targets: targets
          .filter((t) => t.post_id === r.id)
          .map((t) => ({
            accountId: t.account_id,
            provider: t.provider,
            accountName: t.name,
            avatar: t.avatar,
            status: t.status,
            remoteUrl: t.remote_url,
            error: t.error,
            attempts: t.attempts,
          })),
      };
    }),
  );
}

export async function listPosts(
  userId: string,
  opts: { from?: number; to?: number; status?: PostStatus[]; limit?: number } = {},
): Promise<PostView[]> {
  const where = ["user_id = ?"];
  const args: unknown[] = [userId];
  if (opts.from !== undefined) {
    where.push("COALESCE(scheduled_at, published_at, created_at) >= ?");
    args.push(opts.from);
  }
  if (opts.to !== undefined) {
    where.push("COALESCE(scheduled_at, published_at, created_at) < ?");
    args.push(opts.to);
  }
  if (opts.status?.length) {
    where.push(`status IN (${opts.status.map(() => "?").join(",")})`);
    args.push(...opts.status);
  }
  const rows = await all<PostRow>(
    `SELECT * FROM posts WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(scheduled_at, published_at, created_at) ASC LIMIT ?`,
    [...args, Math.min(opts.limit ?? 500, 1000)],
  );
  return hydrate(userId, rows);
}

export async function getPost(userId: string, postId: string): Promise<PostView> {
  const row = await one<PostRow>("SELECT * FROM posts WHERE id = ? AND user_id = ?", [postId, userId]);
  if (!row) throw new HttpError(404, "Post not found");
  return (await hydrate(userId, [row]))[0];
}

/** Validates content against every selected platform. Throws with all problems listed. */
async function validate(userId: string, input: PostInput) {
  const content = input.content?.trim() ?? "";
  const mediaIds = input.mediaIds ?? [];
  const options = sanitizeOptions(input.options);
  if (!content && !mediaIds.length && !options.text) throw new HttpError(400, "Post content is empty");
  if (input.mode !== "draft" && !input.accountIds.length) {
    throw new HttpError(400, "Choose at least one account to publish to");
  }
  const accounts = await getAccountsByIds(userId, input.accountIds);
  const media = await getMedia(userId, mediaIds);
  const problems: string[] = [];
  for (const a of accounts) {
    const p = getProvider(a.provider);
    const parts = partsFor(a.provider, textFor(content, options, a.provider));
    const max = CHAR_LIMITS[a.provider];
    if (!parts.join("").trim() && !media.length) problems.push(`${p.name}: the post has no text`);
    if (parts.length > MAX_THREAD_PARTS) problems.push(`${p.name}: a thread can have at most ${MAX_THREAD_PARTS} parts`);
    parts.forEach((part, i) => {
      const n = countChars(a.provider, part);
      if (n > max) {
        const which = parts.length > 1 ? ` part ${i + 1}` : "";
        problems.push(`${p.name} (${a.name})${which}: ${n}/${max} characters`);
      }
    });
    if (options.firstComment && supportsComments(a.provider)) {
      const limit = COMMENT_LIMITS[a.provider as PlatformId] ?? max;
      const n = countChars(a.provider, options.firstComment);
      if (n > limit) problems.push(`${p.name}: first comment is ${n}/${limit} characters`);
    }
    if (media.length > p.maxMedia) problems.push(`${p.name}: at most ${p.maxMedia} media file${p.maxMedia > 1 ? "s" : ""}`);
    const videos = media.filter((m) => m.mime.startsWith("video/")).length;
    if (p.requiresMedia === "any" && media.length === 0) problems.push(`${p.name} needs at least one photo or video`);
    if (p.requiresMedia === "video" && (videos !== 1 || media.length !== 1)) problems.push(`${p.name} needs exactly one video`);
  }
  if (input.mode === "schedule") {
    if (!input.scheduledAt || Number.isNaN(input.scheduledAt)) throw new HttpError(400, "Pick a date and time");
    if (input.scheduledAt < now() - 60_000) throw new HttpError(400, "Scheduled time is in the past");
  }
  if (input.mode === "review" && input.scheduledAt) {
    if (Number.isNaN(input.scheduledAt)) throw new HttpError(400, "Invalid date and time");
    if (input.scheduledAt < now() - 60_000) throw new HttpError(400, "Scheduled time is in the past");
  }
  if (problems.length && input.mode !== "draft") {
    throw new HttpError(400, `Can't post to some platforms — ${problems.join("; ")}`);
  }
  const thumbId = options.youtube?.thumbnailId;
  if (thumbId) {
    const [thumb] = await getMedia(userId, [thumbId]);
    if (!thumb.mime.startsWith("image/")) throw new HttpError(400, "YouTube thumbnail must be an image");
    if (thumb.size > YOUTUBE_THUMBNAIL_MAX_BYTES) throw new HttpError(400, "YouTube thumbnail image is too large (max 20 MB)");
  }
  if (input.mode !== "draft" && accounts.some((a) => a.provider === "youtube")) {
    const yt = youtubeProblems(options);
    if (yt.length) throw new HttpError(400, yt.join("; "));
  }
  return { content, mediaIds, options };
}

function statusFor(mode: PostInput["mode"]): PostStatus {
  return mode === "draft" ? "draft" : mode === "review" ? "pending_approval" : "scheduled";
}

/** Whether this user wants posts made by the AI agent (in-app or MCP) held for approval. */
export async function agentNeedsApproval(userId: string) {
  const row = await one<{ approval_required: string }>("SELECT approval_required FROM users WHERE id = ?", [userId]);
  return row?.approval_required === "agent";
}

/** The agent can't publish on its own when approval is required: schedule/now become review. */
async function effectiveMode(userId: string, mode: PostInput["mode"], actor: "user" | "agent"): Promise<PostInput["mode"]> {
  if (actor === "agent" && (mode === "schedule" || mode === "now") && (await agentNeedsApproval(userId))) return "review";
  return mode;
}

function approvalInsert(postId: string, requestedBy: "user" | "agent"): [string, unknown[]] {
  return [
    "INSERT INTO post_approvals (id, post_id, token, requested_by, requested_at) VALUES (?, ?, ?, ?, ?)",
    [id("apr_"), postId, randomToken(24), requestedBy, now()],
  ];
}

function targetInserts(postId: string, accountIds: string[]): [string, unknown[]][] {
  return [...new Set(accountIds)].map((acc) => [
    "INSERT INTO post_targets (id, post_id, account_id) VALUES (?, ?, ?)",
    [id("tgt_"), postId, acc],
  ]);
}

export async function createPost(userId: string, input: PostInput, createdBy: "user" | "agent" = "user"): Promise<PostView> {
  input = { ...input, mode: await effectiveMode(userId, input.mode, createdBy) };
  const { content, mediaIds, options } = await validate(userId, input);
  const postId = id("post_");
  const t = now();
  const scheduledAt = input.mode === "now" ? t : (input.scheduledAt ?? null);
  await tx([
    [
      `INSERT INTO posts (id, user_id, content, media, options, status, scheduled_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, userId, content, JSON.stringify(mediaIds), JSON.stringify(options), statusFor(input.mode), scheduledAt, createdBy, t, t],
    ],
    ...targetInserts(postId, input.accountIds),
    ...(input.mode === "review" ? [approvalInsert(postId, createdBy)] : []),
  ]);
  return getPost(userId, postId);
}

const defaultMode = (status: PostStatus): PostInput["mode"] =>
  status === "draft" ? "draft" : status === "pending_approval" ? "review" : "schedule";

export async function updatePost(
  userId: string,
  postId: string,
  patch: Partial<PostInput>,
  actor: "user" | "agent" = "user",
): Promise<PostView> {
  const existing = await getPost(userId, postId);
  if (existing.status === "publishing" || existing.status === "published" || existing.status === "partial") {
    throw new HttpError(409, `Post is ${existing.status} and can no longer be edited`);
  }
  const merged: PostInput = {
    content: patch.content ?? existing.content,
    accountIds: patch.accountIds ?? existing.targets.map((t) => t.accountId),
    mediaIds: patch.mediaIds ?? existing.media.map((m) => m.id),
    options: patch.options ?? existing.options,
    mode: await effectiveMode(userId, patch.mode ?? defaultMode(existing.status), actor),
    scheduledAt: patch.scheduledAt !== undefined ? patch.scheduledAt : existing.scheduledAt,
  };
  // An edited post that was waiting keeps its review link; anything else closes the request.
  const wasPending = existing.status === "pending_approval";
  const approvalChanges: [string, unknown[]][] = [];
  if (merged.mode === "review") {
    if (!wasPending) approvalChanges.push(approvalInsert(postId, actor));
  } else if (wasPending) {
    // The owner scheduling it themselves counts as approving it.
    const approved = actor === "user" && merged.mode !== "draft";
    approvalChanges.push([
      `UPDATE post_approvals SET status = ?, decided_by = ?, decided_at = ? WHERE post_id = ? AND status = 'pending'`,
      [approved ? "approved" : "cancelled", approved ? "owner" : null, now(), postId],
    ]);
  }
  const { content, mediaIds, options } = await validate(userId, merged);
  const scheduledAt = merged.mode === "now" ? now() : (merged.scheduledAt ?? null);
  // Targets are reset: a failed post that is rescheduled gets fresh attempts.
  await tx([
    [
      "UPDATE posts SET content = ?, media = ?, options = ?, status = ?, scheduled_at = ?, updated_at = ? WHERE id = ?",
      [content, JSON.stringify(mediaIds), JSON.stringify(options), statusFor(merged.mode), scheduledAt, now(), postId],
    ],
    ["DELETE FROM post_targets WHERE post_id = ?", [postId]],
    ...targetInserts(postId, merged.accountIds),
    ...approvalChanges,
  ]);
  return getPost(userId, postId);
}

/**
 * Approve or send back a post that is waiting for approval. Approving schedules it
 * for its planned time, or for right now when no time was set or it has passed.
 */
export async function decideApproval(
  userId: string,
  postId: string,
  decision: { approve: boolean; by: "owner" | "link"; name?: string | null; note?: string | null },
): Promise<PostView> {
  const post = await getPost(userId, postId);
  if (post.status !== "pending_approval") {
    throw new HttpError(409, "This post isn't waiting for approval");
  }
  const name = decision.name?.trim().slice(0, 80) || null;
  const note = decision.note?.trim().slice(0, 2000) || null;
  const t = now();
  let scheduledAt: number | null = null;
  if (decision.approve) {
    scheduledAt = Math.max(post.scheduledAt ?? t, t);
    // Platforms and media may have changed since it was submitted; check again before it can publish.
    await validate(userId, {
      content: post.content,
      accountIds: post.targets.map((x) => x.accountId),
      mediaIds: post.media.map((m) => m.id),
      options: post.options,
      mode: "schedule",
      scheduledAt,
    });
  } else if (decision.by === "link" && !note) {
    throw new HttpError(400, "Say what should change");
  }
  // Conditional on the status so two reviewers clicking at once can't both win.
  const claimed = await one<{ id: string }>(
    "UPDATE posts SET status = ?, scheduled_at = COALESCE(?, scheduled_at), updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending_approval' RETURNING id",
    [decision.approve ? "scheduled" : "draft", scheduledAt, t, postId, userId],
  );
  if (!claimed) throw new HttpError(409, "This post is no longer waiting for approval");
  await run(
    `UPDATE post_approvals SET status = ?, decided_by = ?, reviewer_name = ?, note = ?, decided_at = ?
     WHERE post_id = ? AND status = 'pending'`,
    [decision.approve ? "approved" : "changes_requested", decision.by, name, note, t, postId],
  );
  return getPost(userId, postId);
}

/** What the public review page needs. Null when the link is unknown. */
export async function getReview(token: string) {
  const row = await one<ApprovalRow & { user_id: string; owner_name: string }>(
    `SELECT a.*, p.user_id, u.name AS owner_name FROM post_approvals a
     JOIN posts p ON p.id = a.post_id JOIN users u ON u.id = p.user_id WHERE a.token = ?`,
    [token],
  );
  if (!row) return null;
  // Only the newest request for a post is live; older links show as closed.
  const newest = await one<{ id: string }>(
    "SELECT id FROM post_approvals WHERE post_id = ? ORDER BY requested_at DESC LIMIT 1",
    [row.post_id],
  );
  const post = await getPost(row.user_id, row.post_id);
  return {
    userId: row.user_id,
    ownerName: row.owner_name,
    open: newest?.id === row.id && row.status === "pending" && post.status === "pending_approval",
    request: { ...approvalView(row)!, link: null },
    post,
  };
}

export async function deletePost(userId: string, postId: string) {
  const post = await getPost(userId, postId);
  if (post.status === "publishing") throw new HttpError(409, "Post is publishing right now — try again in a moment");
  await run("DELETE FROM posts WHERE id = ? AND user_id = ?", [postId, userId]);
}

/** Re-queue only the targets that failed (keeps successful ones). */
export async function retryFailed(userId: string, postId: string): Promise<PostView> {
  const post = await getPost(userId, postId);
  if (!post.targets.some((t) => t.status === "failed")) throw new HttpError(400, "Nothing to retry");
  await tx([
    [
      "UPDATE post_targets SET status = 'pending', attempts = 0, next_attempt_at = NULL, error = NULL WHERE post_id = ? AND status = 'failed'",
      [postId],
    ],
    ["UPDATE posts SET status = 'scheduled', scheduled_at = ?, updated_at = ? WHERE id = ?", [now(), now(), postId]],
  ]);
  return getPost(userId, postId);
}
