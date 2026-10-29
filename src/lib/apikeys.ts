import crypto from "node:crypto";
import { HttpError, type User } from "./auth";
import { id, randomToken } from "./crypto";
import { db, now } from "./db";

const hash = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

export type ApiKeyView = { id: string; name: string; prefix: string; createdAt: number; lastUsedAt: number | null };

/** Creates a key. The plaintext is returned once and never stored. */
export function createApiKey(userId: string, name: string) {
  const key = `pg_${randomToken(32)}`;
  const keyId = id("key_");
  db.prepare(
    "INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(keyId, userId, name.trim().slice(0, 80) || "API key", hash(key), key.slice(0, 10), now());
  return { id: keyId, key };
}

export function listApiKeys(userId: string): ApiKeyView[] {
  return db
    .prepare(
      `SELECT id, name, prefix, created_at AS createdAt, last_used_at AS lastUsedAt
       FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(userId) as ApiKeyView[];
}

export function revokeApiKey(userId: string, keyId: string) {
  if (!db.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?").run(keyId, userId).changes) {
    throw new HttpError(404, "Key not found");
  }
}

/** Resolves `Authorization: Bearer pg_…` to a user. */
export function userFromApiKey(req: Request): User | null {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(pg_[\w-]+)$/i);
  if (!match) return null;
  const row = db
    .prepare(
      `SELECT k.id AS keyId, u.id, u.email, u.name, u.timezone FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = ?`,
    )
    .get(hash(match[1])) as (User & { keyId: string }) | undefined;
  if (!row) return null;
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), row.keyId);
  return { id: row.id, email: row.email, name: row.name, timezone: row.timezone };
}
