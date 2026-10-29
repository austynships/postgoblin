import { aiEnabled } from "@/lib/agent";
import { HttpError, handler, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { providerCatalog } from "@/lib/providers";
import { validTimeZone } from "@/lib/time";

export const GET = handler(async () => {
  const user = await requireUser();
  return Response.json({ user, providers: providerCatalog(), aiEnabled: aiEnabled() });
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  const { timezone, name } = await req.json();
  if (timezone !== undefined) {
    if (!validTimeZone(timezone)) throw new HttpError(400, "Unknown timezone");
    db.prepare("UPDATE users SET timezone = ? WHERE id = ?").run(timezone, user.id);
  }
  if (typeof name === "string" && name.trim()) {
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), user.id);
  }
  return Response.json({ ok: true });
});
