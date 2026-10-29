import { handler, requireUser } from "@/lib/auth";
import { retryFailed } from "@/lib/posts";
import { publishSoon } from "@/lib/scheduler";

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const post = await retryFailed(user.id, (await params).id);
  publishSoon();
  return Response.json({ post });
});
