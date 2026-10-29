import { deleteConversation, getConversation } from "@/lib/agent";
import { handler, requireUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  return Response.json({ items: getConversation(user.id, (await params).id) });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  deleteConversation(user.id, (await params).id);
  return Response.json({ ok: true });
});
