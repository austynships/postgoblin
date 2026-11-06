import { HttpError, handler } from "@/lib/auth";
import { now } from "@/lib/db";
import { decideApproval, getReview } from "@/lib/posts";
import { publishSoon } from "@/lib/scheduler";

type Ctx = { params: Promise<{ token: string }> };

export const maxDuration = 300;

/** Public: whoever holds the private review link can approve or request changes. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const review = await getReview((await params).token);
  if (!review) throw new HttpError(404, "This review link doesn't exist");
  if (!review.open) throw new HttpError(409, "This review link is closed");
  const { decision, name, note } = await req.json();
  if (decision !== "approve" && decision !== "changes") throw new HttpError(400, "Invalid decision");
  const post = await decideApproval(review.userId, review.post.id, {
    approve: decision === "approve",
    by: "link",
    name: typeof name === "string" ? name : null,
    note: typeof note === "string" ? note : null,
  });
  if (post.status === "scheduled" && (post.scheduledAt ?? 0) <= now()) publishSoon();
  return Response.json({ ok: true, status: post.status, scheduledAt: post.scheduledAt });
});
