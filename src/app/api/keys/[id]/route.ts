import { revokeApiKey } from "@/lib/apikeys";
import { handler, requireUser } from "@/lib/auth";

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  revokeApiKey(user.id, (await params).id);
  return Response.json({ ok: true });
});
