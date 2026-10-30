import { handler, requireUser } from "@/lib/auth";
import { retryFailed } from "@/lib/posts";
import { publishSoon } from "@/lib/scheduler";

// "Post now" publishes after the response (video uploads can take minutes).
export const maxDuration = 300;

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const post = await retryFailed(user.id, (await params).id);
  publishSoon();
  return Response.json({ post });
});
