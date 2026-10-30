import crypto from "node:crypto";
import { runDue } from "@/lib/scheduler";

/**
 * Publishes due posts. Call it every minute:
 * - Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
 * - External pingers (cron-job.org etc.) can use the same header, or `?secret=…`.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runDue();
    return Response.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
