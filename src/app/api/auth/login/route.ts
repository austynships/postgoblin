import { HttpError, createSession, handler } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { db } from "@/lib/db";

export const POST = handler(async (req: Request) => {
  const { email, password } = await req.json();
  const user = db
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get(String(email ?? "").trim().toLowerCase()) as { id: string; password_hash: string } | undefined;
  if (!user || !verifyPassword(String(password ?? ""), user.password_hash)) {
    throw new HttpError(401, "Wrong email or password");
  }
  await createSession(user.id);
  return Response.json({ ok: true });
});
