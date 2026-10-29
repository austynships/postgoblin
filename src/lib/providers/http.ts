import fs from "node:fs/promises";
import { ProviderError, type MediaFile } from "./types";

/** fetch() that throws a ProviderError with the API's message on non-2xx. */
export async function api<T = any>(url: string, init: RequestInit = {}, label = "API"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new ProviderError(`${label}: network error (${(err as Error).message})`, true);
  }
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const detail =
      body?.error?.message ??
      body?.error_description ??
      body?.detail ??
      body?.message ??
      body?.errors?.[0]?.message ??
      body?.description ??
      (typeof body?.error === "string" ? body.error : undefined) ??
      (typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300));
    // 4xx (other than rate limits / timeouts) won't succeed on retry.
    const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
    throw new ProviderError(`${label} ${res.status}: ${detail}`, retryable);
  }
  return body as T;
}

export function form(data: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined) params.set(k, v);
  return params;
}

export async function readMedia(file: MediaFile) {
  if (file.localPath) return new Blob([await fs.readFile(file.localPath)], { type: file.mime });
  const res = await fetch(file.url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new ProviderError(`Couldn't download media ${file.name} (${res.status})`);
  return new Blob([await res.arrayBuffer()], { type: file.mime });
}

export function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function requireEnv(name: string) {
  const v = env(name);
  if (!v) throw new ProviderError(`${name} is not configured on the server`, false);
  return v;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
