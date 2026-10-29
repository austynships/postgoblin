import { createApiKey, listApiKeys } from "@/lib/apikeys";
import { handler, requireUser } from "@/lib/auth";

export const GET = handler(async () => {
  const user = await requireUser();
  return Response.json({ keys: listApiKeys(user.id) });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { name } = await req.json().catch(() => ({}));
  return Response.json(createApiKey(user.id, String(name ?? "")));
});
