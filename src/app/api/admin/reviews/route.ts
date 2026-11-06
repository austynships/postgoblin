import { requireAdmin } from "@/lib/admin";
import { handler } from "@/lib/auth";
import { listReviews } from "@/lib/feedback";

/** Admin only: star ratings, average and distribution. */
export const GET = handler(async () => {
  await requireAdmin();
  return Response.json(await listReviews());
});
