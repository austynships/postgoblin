import { handler, requireUser } from "@/lib/auth";
import { retryFailed } from "@/lib/posts";
import { runDue } from "@/lib/scheduler";

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const post = retryFailed(user.id, (await params).id);
  void runDue();
  return Response.json({ post });
});
