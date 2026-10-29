import { deleteAccount } from "@/lib/accounts";
import { handler, requireUser } from "@/lib/auth";

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  await deleteAccount(user.id, (await params).id);
  return Response.json({ ok: true });
});
