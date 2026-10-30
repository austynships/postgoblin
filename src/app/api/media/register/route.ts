import { HttpError, handler, requireUser } from "@/lib/auth";
import { registerDirectUpload } from "@/lib/media";

/** Called by the browser after a direct-to-Blob upload finishes. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { url, pathname, name } = await req.json();
  if (typeof url !== "string" || typeof pathname !== "string") throw new HttpError(400, "Missing upload details");
  return Response.json({ media: await registerDirectUpload(user.id, { url, pathname, name: String(name ?? "") }) });
});
