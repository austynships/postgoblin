import { handler, requireUser } from "@/lib/auth";
import { getMyReview, saveReview } from "@/lib/feedback";

/** The signed-in user's own star rating (one per user). */
export const GET = handler(async () => {
  const user = await requireUser();
  return Response.json({ review: await getMyReview(user.id) });
});

export const PUT = handler(async (req: Request) => {
  const user = await requireUser();
  return Response.json({ review: await saveReview(user.id, await req.json()) });
});
