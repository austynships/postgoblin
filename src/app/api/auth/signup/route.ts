import { HttpError, createSession, handler } from "@/lib/auth";
import { hashPassword, id } from "@/lib/crypto";
import { now, one, run } from "@/lib/db";
import { validTimeZone } from "@/lib/time";

export const POST = handler(async (req: Request) => {
  const { name, email, password, timezone } = await req.json();
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new HttpError(400, "Enter a valid email");
  if (String(password ?? "").length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  if (await one("SELECT 1 FROM users WHERE email = ?", [cleanEmail])) {
    throw new HttpError(409, "An account with that email already exists");
  }
  const userId = id("usr_");
  await run("INSERT INTO users (id, email, name, password_hash, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    userId,
    cleanEmail,
    String(name ?? "").trim() || cleanEmail.split("@")[0],
    hashPassword(password),
    validTimeZone(timezone) ? timezone : "UTC",
    now(),
  ]);
  await createSession(userId);
  return Response.json({ ok: true });
});
