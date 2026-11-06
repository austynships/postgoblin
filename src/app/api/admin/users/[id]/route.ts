import { getUserDetail, requireAdmin } from "@/lib/admin";
import { handler } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Admin only: one user's accounts and recent posts (no secrets). */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  return Response.json(await getUserDetail((await params).id));
});
