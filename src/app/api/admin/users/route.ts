import { listUsers, requireAdmin } from "@/lib/admin";
import { handler } from "@/lib/auth";

/** Admin only: search users by email or name. */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const q = new URL(req.url).searchParams;
  return Response.json(
    await listUsers({ q: q.get("q") ?? "", limit: Number(q.get("limit")) || 50, offset: Number(q.get("offset")) || 0 }),
  );
});
