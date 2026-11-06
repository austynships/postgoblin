import { requireAdmin } from "@/lib/admin";
import { handler } from "@/lib/auth";
import { setFeedbackStatus } from "@/lib/feedback";

type Ctx = { params: Promise<{ id: string }> };

/** Admin only: mark feedback new, read or done. */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { status } = await req.json();
  await setFeedbackStatus((await params).id, status);
  return Response.json({ ok: true });
});
