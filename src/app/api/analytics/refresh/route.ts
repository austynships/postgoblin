import { refreshMetrics } from "@/lib/analytics";
import { handler, requireUser } from "@/lib/auth";

export const maxDuration = 60;

/** "Refresh now": fetch anything older than 5 minutes for this user. */
export const POST = handler(async () => {
  const user = await requireUser();
  return Response.json(await refreshMetrics({ userId: user.id, limit: 40, maxAge: 5 * 60 * 1000 }));
});
