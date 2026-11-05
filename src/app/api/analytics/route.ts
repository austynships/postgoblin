import { getAnalytics } from "@/lib/analytics";
import { handler, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  return Response.json(await getAnalytics(user.id, user.timezone, days));
});
