import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Postgres (Neon) over HTTP — works in serverless functions and locally.
 * Schema: db/schema.sql.
 *
 * Queries use `?` placeholders (converted to $1, $2, …). Timestamps are BIGINT
 * epoch milliseconds; Postgres returns int8 as strings, so they are converted
 * back to numbers here.
 */

let client: NeonQueryFunction<false, false> | null = null;

/**
 * Tolerates common copy-paste mistakes in hosting dashboards: surrounding
 * quotes or whitespace, a pasted `DATABASE_URL=` prefix, or a `psql '…'` wrapper.
 */
export function databaseUrl() {
  let raw = (process.env.DATABASE_URL ?? "").trim();
  raw = raw.replace(/^DATABASE_URL\s*=\s*/i, "").replace(/^psql\s+/i, "").trim();
  raw = raw.replace(/^['"]|['"]$/g, "").trim();
  if (!raw) throw new Error("DATABASE_URL is not set. See .env.example.");
  if (!/^postgres(ql)?:\/\//.test(raw)) {
    throw new Error("DATABASE_URL must start with postgresql:// — check the value in your hosting settings.");
  }
  return raw;
}

/** Host of the configured database (no credentials), for diagnostics. */
export function databaseHost() {
  try {
    return new URL(databaseUrl()).hostname;
  } catch {
    return null;
  }
}

function sql() {
  if (!client) client = neon(databaseUrl());
  return client;
}

/** Turns the driver's bare "fetch failed" into something actionable. */
function explain(err: unknown): never {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (/fetch failed/i.test(e?.message ?? "")) {
    const reason = e.cause?.code ?? e.cause?.message ?? "network error";
    throw new Error(`Can't reach the database at ${databaseHost() ?? "(unknown host)"} (${reason}). Check DATABASE_URL.`);
  }
  throw err;
}

function toPg(text: string) {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

// int8 columns (and COUNT aliases) that should come back as numbers.
const NUMERIC = /(_at|At)$|^(seq|n|attempts|size)$/;

function normalize<T>(rows: Record<string, unknown>[]): T[] {
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && NUMERIC.test(k) && /^-?\d+$/.test(v)) row[k] = Number(v);
    }
  }
  return rows as T[];
}

export async function all<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
  try {
    return normalize<T>((await sql().query(toPg(text), params)) as Record<string, unknown>[]);
  } catch (err) {
    explain(err);
  }
}

export async function one<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(text, params))[0];
}

export async function run(text: string, params: unknown[] = []): Promise<void> {
  try {
    await sql().query(toPg(text), params);
  } catch (err) {
    explain(err);
  }
}

/** Runs statements atomically in one non-interactive transaction. */
export async function tx(statements: [string, unknown[]][]): Promise<void> {
  if (!statements.length) return;
  const q = sql();
  try {
    await q.transaction(statements.map(([text, params]) => q.query(toPg(text), params)));
  } catch (err) {
    explain(err);
  }
}

export function now() {
  return Date.now();
}
