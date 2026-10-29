import { cookies } from "next/headers";
import { db, now } from "./db";
import { randomToken } from "./crypto";

export const SESSION_COOKIE = "pg_session";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;

export type User = { id: string; email: string; name: string; timezone: string };

export async function createSession(userId: string) {
  const token = randomToken();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    now() + SESSION_TTL,
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl().startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.timezone FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, now()) as User | undefined;
  return row ?? null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Not signed in");
  return user;
}

/** Wraps a route handler so thrown errors become JSON responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return Response.json({ error: (err as Error).message ?? "Server error" }, { status: 500 });
    }
  };
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
