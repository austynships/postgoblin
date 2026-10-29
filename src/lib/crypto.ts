import crypto from "node:crypto";

function key() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error("ENCRYPTION_KEY must be set (32+ chars). See .env.example.");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encrypt(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt<T>(payload: string): T {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}

export function id(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("base64url");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return ["scrypt", salt.toString("base64"), hash.toString("base64")].join("$");
}

export function verifyPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  const expected = Buffer.from(hash, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
