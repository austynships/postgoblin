import { handler, requireUser } from "@/lib/auth";
import { sendFeedback } from "@/lib/feedback";

/** A signed-in user sends an idea, bug report or other note to the PostGoblins team. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  await sendFeedback(user.id, await req.json());
  return Response.json({ ok: true });
});
