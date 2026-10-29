import { handler, requireUser } from "@/lib/auth";
import { deletePost, getPost, updatePost } from "@/lib/posts";
import { publishSoon } from "@/lib/scheduler";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  return Response.json({ post: await getPost(user.id, (await params).id) });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const body = await req.json();
  const post = await updatePost(user.id, (await params).id, {
    content: body.content,
    accountIds: body.accountIds,
    mediaIds: body.mediaIds,
    mode: body.mode,
    scheduledAt: body.scheduledAt,
  });
  if (body.mode === "now") publishSoon();
  return Response.json({ post });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await deletePost(user.id, (await params).id);
  return Response.json({ ok: true });
});
