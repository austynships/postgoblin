import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, localMediaMime } from "@/lib/media";

// Serves locally stored uploads (development without Vercel Blob).
// Public on purpose: Threads and other platforms fetch media by URL.
// File names are unguessable random ids.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = path.basename((await params).file);
  const mime = await localMediaMime(file);
  if (!mime) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, file));
    return new Response(data, {
      headers: { "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
