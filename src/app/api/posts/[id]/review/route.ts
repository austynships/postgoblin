import { HttpError, handler, requireUser } from "@/lib/auth";
import { now } from "@/lib/db";
import { decideApproval } from "@/lib/posts";
import { publishSoon } from "@/lib/scheduler";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 300;

/** The owner approves (or sends back) a post that is waiting for approval. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { decision, note } = await req.json();
  if (decision !== "approve" && decision !== "changes") throw new HttpError(400, "Invalid decision");
  const post = await decideApproval(user.id, (await params).id, {
    approve: decision === "approve",
    by: "owner",
    name: user.name,
    note,
  });
  if (post.status === "scheduled" && (post.scheduledAt ?? 0) <= now()) publishSoon();
  return Response.json({ post });
});
