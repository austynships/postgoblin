import { chat } from "@/lib/agent";
import { HttpError, handler, requireUser } from "@/lib/auth";
import { validTimeZone } from "@/lib/time";

export const maxDuration = 300;

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { message, conversationId, timezone } = await req.json();
  if (!String(message ?? "").trim()) throw new HttpError(400, "Message is empty");
  const result = await chat(user, {
    message: String(message).slice(0, 20000),
    conversationId: conversationId || undefined,
    timezone: validTimeZone(timezone) ? timezone : user.timezone,
  });
  return Response.json(result);
});
