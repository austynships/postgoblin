import { HttpError, handler, requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/media";

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
  return Response.json({ media: await saveUpload(user.id, file) });
});
