import { getOverview, recentFailures, requireAdmin } from "@/lib/admin";
import { handler } from "@/lib/auth";

/** Admin only: platform-wide numbers, scheduler health and recent failed deliveries. */
export const GET = handler(async () => {
  await requireAdmin();
  const [overview, failures] = await Promise.all([getOverview(), recentFailures(50)]);
  return Response.json({ overview, failures });
});
