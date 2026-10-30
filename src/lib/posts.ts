import { getAccountsByIds } from "./accounts";
import { HttpError } from "./auth";
import { id } from "./crypto";
import { all, now, one, run, tx } from "./db";
import { CHAR_LIMITS, countChars } from "./limits";
import { getMedia, publicMedia, type PublicMedia } from "./media";
import { getProvider } from "./providers";

export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";

export type PostView = {
  id: string;
  content: string;
  media: PublicMedia[];
  status: PostStatus;
  scheduledAt: number | null;
  publishedAt: number | null;
  createdBy: "user" | "agent";
  createdAt: number;
  updatedAt: number;
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
  /** draft = save only, schedule = publish at scheduledAt, now = publish immediately */
  mode: "draft" | "schedule" | "now";
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
  return Promise.all(
    rows.map(async (r) => {
      const mediaIds = JSON.parse(r.media) as string[];
      let media: PublicMedia[] = [];
      try {
        media = (await getMedia(userId, mediaIds)).map(publicMedia);
      } catch {}
      return {
        id: r.id,
        content: r.content,
        media,
        status: r.status,
        scheduledAt: r.scheduled_at,
        publishedAt: r.published_at,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
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
  if (!content && !mediaIds.length) throw new HttpError(400, "Post content is empty");
  if (input.mode !== "draft" && !input.accountIds.length) {
    throw new HttpError(400, "Choose at least one account to publish to");
  }
  const accounts = await getAccountsByIds(userId, input.accountIds);
  const media = await getMedia(userId, mediaIds);
  const problems: string[] = [];
  for (const a of accounts) {
    const p = getProvider(a.provider);
    const n = countChars(a.provider, content);
    if (n > CHAR_LIMITS[a.provider]) {
      problems.push(`${p.name} (${a.name}): ${n}/${CHAR_LIMITS[a.provider]} characters`);
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
  if (problems.length && input.mode !== "draft") {
    throw new HttpError(400, `Can't post to some platforms — ${problems.join("; ")}`);
  }
  return { content, mediaIds };
}

function statusFor(mode: PostInput["mode"]): PostStatus {
  return mode === "draft" ? "draft" : "scheduled";
}

function targetInserts(postId: string, accountIds: string[]): [string, unknown[]][] {
  return [...new Set(accountIds)].map((acc) => [
    "INSERT INTO post_targets (id, post_id, account_id) VALUES (?, ?, ?)",
    [id("tgt_"), postId, acc],
  ]);
}

export async function createPost(userId: string, input: PostInput, createdBy: "user" | "agent" = "user"): Promise<PostView> {
  const { content, mediaIds } = await validate(userId, input);
  const postId = id("post_");
  const t = now();
  const scheduledAt = input.mode === "now" ? t : (input.scheduledAt ?? null);
  await tx([
    [
      `INSERT INTO posts (id, user_id, content, media, status, scheduled_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, userId, content, JSON.stringify(mediaIds), statusFor(input.mode), scheduledAt, createdBy, t, t],
    ],
    ...targetInserts(postId, input.accountIds),
  ]);
  return getPost(userId, postId);
}

export async function updatePost(userId: string, postId: string, patch: Partial<PostInput>): Promise<PostView> {
  const existing = await getPost(userId, postId);
  if (existing.status === "publishing" || existing.status === "published" || existing.status === "partial") {
    throw new HttpError(409, `Post is ${existing.status} and can no longer be edited`);
  }
  const merged: PostInput = {
    content: patch.content ?? existing.content,
    accountIds: patch.accountIds ?? existing.targets.map((t) => t.accountId),
    mediaIds: patch.mediaIds ?? existing.media.map((m) => m.id),
    mode: patch.mode ?? (existing.status === "draft" ? "draft" : "schedule"),
    scheduledAt: patch.scheduledAt !== undefined ? patch.scheduledAt : existing.scheduledAt,
  };
  const { content, mediaIds } = await validate(userId, merged);
  const scheduledAt = merged.mode === "now" ? now() : (merged.scheduledAt ?? null);
  // Targets are reset: a failed post that is rescheduled gets fresh attempts.
  await tx([
    [
      "UPDATE posts SET content = ?, media = ?, status = ?, scheduled_at = ?, updated_at = ? WHERE id = ?",
      [content, JSON.stringify(mediaIds), statusFor(merged.mode), scheduledAt, now(), postId],
    ],
    ["DELETE FROM post_targets WHERE post_id = ?", [postId]],
    ...targetInserts(postId, merged.accountIds),
  ]);
  return getPost(userId, postId);
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
