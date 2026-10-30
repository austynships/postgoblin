import { HttpError, handler, requireUser } from "@/lib/auth";
import { createPost, listPosts, type PostStatus } from "@/lib/posts";
import { publishSoon } from "@/lib/scheduler";

// "Post now" publishes after the response (video uploads can take minutes).
export const maxDuration = 300;

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const posts = await listPosts(user.id, {
    from: num("from"),
    to: num("to"),
    status: q.get("status")?.split(",").filter(Boolean) as PostStatus[] | undefined,
    limit: num("limit"),
  });
  return Response.json({ posts });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await req.json();
  if (!["draft", "schedule", "now"].includes(body.mode)) throw new HttpError(400, "Invalid mode");
  const post = await createPost(user.id, {
    content: String(body.content ?? ""),
    accountIds: body.accountIds ?? [],
    mediaIds: body.mediaIds ?? [],
    mode: body.mode,
    scheduledAt: body.scheduledAt ?? null,
  });
  if (body.mode === "now") publishSoon();
  return Response.json({ post });
});
