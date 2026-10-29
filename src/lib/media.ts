import { put } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import { HttpError, appUrl } from "./auth";
import { id } from "./crypto";
import { all, now, run } from "./db";
import type { MediaFile } from "./providers/types";

/** Local fallback for development without BLOB_READ_WRITE_TOKEN. */
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_BYTES = 50 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

type MediaRow = { id: string; url: string; pathname: string; original_name: string; mime: string; size: number };

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

function toFile(row: MediaRow): MediaFile {
  const local = row.url.startsWith("/");
  return {
    id: row.id,
    url: local ? `${appUrl()}${row.url}` : row.url,
    localPath: local ? path.join(UPLOAD_DIR, path.basename(row.pathname)) : undefined,
    mime: row.mime,
    name: row.original_name,
    size: row.size,
  };
}

export async function saveUpload(userId: string, file: File) {
  const ext = EXT[file.type];
  if (!ext) throw new HttpError(400, `Unsupported file type ${file.type || "(unknown)"} — use JPG, PNG, GIF, WebP or MP4`);
  if (file.size > MAX_BYTES) throw new HttpError(400, "Files must be 50MB or smaller");
  const mediaId = id("med_");
  const fileName = `${mediaId}.${ext}`;

  let url: string;
  let pathname: string;
  if (useBlob()) {
    const blob = await put(`media/${fileName}`, file, { access: "public", contentType: file.type });
    url = blob.url;
    pathname = blob.pathname;
  } else {
    if (process.env.VERCEL) throw new HttpError(500, "Uploads need BLOB_READ_WRITE_TOKEN on Vercel");
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(await file.arrayBuffer()));
    url = `/api/media/${fileName}`;
    pathname = fileName;
  }

  const row: MediaRow = {
    id: mediaId,
    url,
    pathname,
    original_name: file.name.slice(0, 200) || fileName,
    mime: file.type,
    size: file.size,
  };
  await run(
    "INSERT INTO media (id, user_id, url, pathname, original_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [row.id, userId, row.url, row.pathname, row.original_name, row.mime, row.size, now()],
  );
  return publicMedia(toFile(row));
}

export async function getMedia(userId: string, ids: string[]): Promise<MediaFile[]> {
  if (!ids.length) return [];
  const rows = await all<MediaRow>(
    `SELECT * FROM media WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
    [userId, ...ids],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((i) => {
    const row = byId.get(i);
    if (!row) throw new HttpError(400, `Unknown media id ${i}`);
    return toFile(row);
  });
}

/** Looks up a local upload by file name (for /api/media/[file] in development). */
export async function localMediaMime(fileName: string) {
  const rows = await all<{ mime: string }>("SELECT mime FROM media WHERE pathname = ? AND url LIKE '/%'", [fileName]);
  return rows[0]?.mime;
}

/** What the browser / agent sees — no filesystem paths. */
export function publicMedia(m: MediaFile) {
  const url = m.localPath ? `/api/media/${path.basename(m.localPath)}` : m.url;
  return { id: m.id, url, mime: m.mime, name: m.name, size: m.size };
}

export type PublicMedia = ReturnType<typeof publicMedia>;
