import { listConversations } from "@/lib/agent";
import { handler, requireUser } from "@/lib/auth";

export const GET = handler(async () => {
  const user = await requireUser();
  return Response.json({ conversations: listConversations(user.id) });
});
