import { HttpError, createSession, handler } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { one } from "@/lib/db";

export const POST = handler(async (req: Request) => {
  const { email, password } = await req.json();
  const user = await one<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", [
    String(email ?? "").trim().toLowerCase(),
  ]);
  if (!user || !verifyPassword(String(password ?? ""), user.password_hash)) {
    throw new HttpError(401, "Wrong email or password");
  }
  await createSession(user.id);
  return Response.json({ ok: true });
});
