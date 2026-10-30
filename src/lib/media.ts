import { put } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import { HttpError, appUrl } from "./auth";
import { id } from "./crypto";
import { all, now, run } from "./db";
import type { MediaFile } from "./providers/types";

/** Local fallback for development without BLOB_READ_WRITE_TOKEN. */
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");
/** Uploads through our own function (server upload / local disk). Vercel caps request bodies at ~4.5MB. */
const MAX_BYTES = 50 * 1024 * 1024;
/** Direct browser → Blob uploads (needed for real video). */
export const MAX_DIRECT_BYTES = 250 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/quicktime"];
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

/** Blob path prefix a user may upload into directly from the browser. */
export const directUploadPrefix = (userId: string) => `media/u/${userId}/`;
export const directUploadsEnabled = () => useBlob();

/**
 * Records a file the browser uploaded straight to Vercel Blob. The URL is
 * checked against our Blob store and the user's own path prefix, and the
 * size and type are read from the stored object rather than trusted.
 */
export async function registerDirectUpload(userId: string, input: { url: string; pathname: string; name: string }) {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new HttpError(400, "Invalid upload URL");
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")) {
    throw new HttpError(400, "Upload is not from this app's storage");
  }
  const pathname = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (pathname !== input.pathname || !pathname.startsWith(directUploadPrefix(userId))) {
    throw new HttpError(403, "Upload does not belong to this account");
  }
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok) throw new HttpError(400, "Upload not found");
  const mime = (head.headers.get("content-type") ?? "").split(";")[0].trim();
  const size = Number(head.headers.get("content-length") ?? 0);
  if (!ALLOWED_TYPES.includes(mime)) throw new HttpError(400, `Unsupported file type ${mime || "(unknown)"}`);
  if (size > MAX_DIRECT_BYTES) throw new HttpError(400, "Files must be 250MB or smaller");

  const row: MediaRow = {
    id: id("med_"),
    url: url.toString(),
    pathname,
    original_name: (input.name || path.basename(pathname)).slice(0, 200),
    mime,
    size,
  };
  await run(
    "INSERT INTO media (id, user_id, url, pathname, original_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [row.id, userId, row.url, row.pathname, row.original_name, row.mime, row.size, now()],
  );
  return publicMedia(toFile(row));
}

/**
 * Instagram only accepts JPEG photos, fetched from a public URL. PNG/WebP/GIF
 * stills are converted once and stored next to the original.
 */
export async function jpegUrl(file: MediaFile): Promise<string> {
  if (file.mime === "image/jpeg") return file.url;
  if (!useBlob()) throw new HttpError(400, `${file.name} must be a JPEG to post to Instagram (or enable Blob storage for automatic conversion)`);
  const sharp = (await import("sharp")).default;
  const source = file.localPath
    ? await fs.readFile(file.localPath)
    : Buffer.from(await (await fetch(file.url)).arrayBuffer());
  const jpeg = await sharp(source).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  const blob = await put(`media/derived/${file.id}.jpg`, jpeg, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
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
