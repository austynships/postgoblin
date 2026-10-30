import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { HttpError, handler, requireUser } from "@/lib/auth";
import { ALLOWED_TYPES, MAX_DIRECT_BYTES, directUploadPrefix, directUploadsEnabled } from "@/lib/media";

/**
 * Issues short-lived tokens so the browser can upload large files (video)
 * straight to Vercel Blob, bypassing the ~4.5MB function body limit.
 * Each user may only write under their own prefix.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  if (!directUploadsEnabled()) throw new HttpError(400, "Direct uploads need BLOB_READ_WRITE_TOKEN");
  const body = (await req.json()) as HandleUploadBody;
  const result = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      if (!pathname.startsWith(directUploadPrefix(user.id))) throw new HttpError(403, "Invalid upload path");
      return {
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_DIRECT_BYTES,
        addRandomSuffix: true,
      };
    },
  });
  return Response.json(result);
});
