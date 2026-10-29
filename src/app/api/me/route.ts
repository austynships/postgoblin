import { aiEnabled } from "@/lib/agent";
import { HttpError, handler, requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
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
    await run("UPDATE users SET timezone = ? WHERE id = ?", [timezone, user.id]);
  }
  if (typeof name === "string" && name.trim()) {
    await run("UPDATE users SET name = ? WHERE id = ?", [name.trim(), user.id]);
  }
  return Response.json({ ok: true });
});
