import fs from "node:fs/promises";
import path from "node:path";
import { HttpError, appUrl } from "./auth";
import { id } from "./crypto";
import { db, now } from "./db";
import type { MediaFile } from "./providers/types";

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

type MediaRow = { id: string; file_name: string; original_name: string; mime: string; size: number };

function toFile(row: MediaRow): MediaFile {
  return {
    id: row.id,
    path: path.join(UPLOAD_DIR, row.file_name),
    url: `${appUrl()}/api/media/${row.file_name}`,
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
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(await file.arrayBuffer()));
  const row: MediaRow = {
    id: mediaId,
    file_name: fileName,
    original_name: file.name.slice(0, 200) || fileName,
    mime: file.type,
    size: file.size,
  };
  db.prepare(
    "INSERT INTO media (id, user_id, file_name, original_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(row.id, userId, row.file_name, row.original_name, row.mime, row.size, now());
  return publicMedia(toFile(row));
}

export function getMedia(userId: string, ids: string[]): MediaFile[] {
  if (!ids.length) return [];
  const rows = db
    .prepare(`SELECT * FROM media WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
    .all(userId, ...ids) as MediaRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((i) => {
    const row = byId.get(i);
    if (!row) throw new HttpError(400, `Unknown media id ${i}`);
    return toFile(row);
  });
}

/** What the browser / agent sees — no filesystem paths. */
export function publicMedia(m: MediaFile) {
  return { id: m.id, url: `/api/media/${path.basename(m.path)}`, mime: m.mime, name: m.name, size: m.size };
}

export type PublicMedia = ReturnType<typeof publicMedia>;
