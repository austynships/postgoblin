import { databaseHost, one } from "@/lib/db";

/** Deployment check: is the database reachable and the config present? No secrets are returned. */
export const dynamic = "force-dynamic";

export async function GET() {
  const config = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    ENCRYPTION_KEY: (process.env.ENCRYPTION_KEY ?? "").length >= 32,
    CRON_SECRET: !!process.env.CRON_SECRET,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    APP_URL: process.env.APP_URL ?? null,
  };
  let database: { ok: boolean; host: string | null; error?: string };
  try {
    await one("SELECT 1 AS ok");
    database = { ok: true, host: databaseHost() };
  } catch (err) {
    database = { ok: false, host: databaseHost(), error: (err as Error).message };
  }
  return Response.json({ ok: database.ok, database, config }, { status: database.ok ? 200 : 503 });
}
