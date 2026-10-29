"use client";

import type { AccountView } from "@/lib/accounts";
import type { PostView } from "@/lib/posts";
import type { ProviderInfo } from "@/lib/providers";

export type { AccountView, PostView, ProviderInfo };

export async function request<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: opts.body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth")) window.location.href = "/login";
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

const SHORT: Record<string, string> = {
  x: "𝕏",
  bluesky: "🦋",
  mastodon: "M",
  linkedin: "in",
  threads: "@",
  facebook: "f",
  discord: "D",
  telegram: "✈",
};

export const PROVIDER_COLORS: Record<string, string> = {
  x: "#e7e9ea",
  bluesky: "#1185fe",
  mastodon: "#6364ff",
  linkedin: "#0a66c2",
  threads: "#e7e9ea",
  facebook: "#0866ff",
  discord: "#5865f2",
  telegram: "#229ed9",
};

export function ProviderIcon({ provider, size = 18 }: { provider: string; size?: number }) {
  const color = PROVIDER_COLORS[provider] ?? "#888";
  const dark = provider === "x" || provider === "threads";
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-bold leading-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: color,
        color: dark ? "#000" : "#fff",
      }}
      aria-label={provider}
    >
      {SHORT[provider] ?? "?"}
    </span>
  );
}

export function Avatar({ account, size = 36 }: { account: { avatar: string | null; name: string; provider: string }; size?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {account.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={account.avatar}
          alt=""
          className="h-full w-full rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">
          {account.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="absolute -right-1 -bottom-1 rounded-full ring-2 ring-[#121513]">
        <ProviderIcon provider={account.provider} size={Math.max(14, size * 0.42)} />
      </span>
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-zinc-500/15 text-zinc-300",
  scheduled: "bg-sky-500/15 text-sky-300",
  publishing: "bg-amber-500/15 text-amber-300",
  sending: "bg-amber-500/15 text-amber-300",
  pending: "bg-sky-500/15 text-sky-300",
  published: "bg-goblin-500/15 text-goblin-300",
  partial: "bg-orange-500/15 text-orange-300",
  failed: "bg-red-500/15 text-red-300",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[status] ?? ""}`}>
      {status}
    </span>
  );
}

export function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`card w-full ${wide ? "max-w-5xl" : "max-w-lg"} shadow-2xl`}>{children}</div>
    </div>
  );
}

export function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function fmtDateTime(ms: number) {
  return new Date(ms).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function postTime(p: PostView) {
  return p.scheduledAt ?? p.publishedAt ?? p.createdAt;
}
