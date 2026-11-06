import { requireAdmin } from "@/lib/admin";
import { handler } from "@/lib/auth";
import { listFeedback } from "@/lib/feedback";

/** Admin only: feedback from users, newest first. ?status=new|read|done */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  return Response.json(await listFeedback({ status: new URL(req.url).searchParams.get("status") ?? undefined }));
});
