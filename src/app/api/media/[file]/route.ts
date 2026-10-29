import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/media";

// Public on purpose: Threads and other platforms fetch media by URL.
// File names are unguessable random ids.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = path.basename((await params).file);
  const row = db.prepare("SELECT mime FROM media WHERE file_name = ?").get(file) as { mime: string } | undefined;
  if (!row) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, file));
    return new Response(data, {
      headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
