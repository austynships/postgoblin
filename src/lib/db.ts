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

function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
    client = neon(url);
  }
  return client;
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
  return normalize<T>((await sql().query(toPg(text), params)) as Record<string, unknown>[]);
}

export async function one<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(text, params))[0];
}

export async function run(text: string, params: unknown[] = []): Promise<void> {
  await sql().query(toPg(text), params);
}

/** Runs statements atomically in one non-interactive transaction. */
export async function tx(statements: [string, unknown[]][]): Promise<void> {
  if (!statements.length) return;
  const q = sql();
  await q.transaction(statements.map(([text, params]) => q.query(toPg(text), params)));
}

export function now() {
  return Date.now();
}
