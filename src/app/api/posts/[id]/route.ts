import { handler, requireUser } from "@/lib/auth";
import { deletePost, getPost, updatePost } from "@/lib/posts";
import { runDue } from "@/lib/scheduler";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  return Response.json({ post: getPost(user.id, (await params).id) });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const body = await req.json();
  const post = updatePost(user.id, (await params).id, {
    content: body.content,
    accountIds: body.accountIds,
    mediaIds: body.mediaIds,
    mode: body.mode,
    scheduledAt: body.scheduledAt,
  });
  if (body.mode === "now") void runDue();
  return Response.json({ post });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  deletePost(user.id, (await params).id);
  return Response.json({ ok: true });
});
