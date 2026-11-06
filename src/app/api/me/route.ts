import { aiEnabled } from "@/lib/agent";
import { HttpError, handler, requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { directUploadsEnabled } from "@/lib/media";
import { agentNeedsApproval } from "@/lib/posts";
import { providerCatalog } from "@/lib/providers";
import { validTimeZone } from "@/lib/time";

export const GET = handler(async () => {
  const user = await requireUser();
  return Response.json({
    user,
    providers: providerCatalog(),
    aiEnabled: aiEnabled(),
    directUploads: directUploadsEnabled(),
    approveAgentPosts: await agentNeedsApproval(user.id),
  });
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  const { timezone, name, approveAgentPosts } = await req.json();
  if (timezone !== undefined) {
    if (!validTimeZone(timezone)) throw new HttpError(400, "Unknown timezone");
    await run("UPDATE users SET timezone = ? WHERE id = ?", [timezone, user.id]);
  }
  if (typeof name === "string" && name.trim()) {
    await run("UPDATE users SET name = ? WHERE id = ?", [name.trim(), user.id]);
  }
  if (typeof approveAgentPosts === "boolean") {
    await run("UPDATE users SET approval_required = ? WHERE id = ?", [approveAgentPosts ? "agent" : "off", user.id]);
  }
  return Response.json({ ok: true });
});
