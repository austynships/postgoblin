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
  x: "#000000",
  bluesky: "#1185fe",
  mastodon: "#6364ff",
  linkedin: "#0a66c2",
  threads: "#000000",
  facebook: "#0866ff",
  discord: "#5865f2",
  telegram: "#229ed9",
};

export function ProviderIcon({ provider, size = 18 }: { provider: string; size?: number }) {
  const color = PROVIDER_COLORS[provider] ?? "#888";
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-bold leading-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: color,
        color: "#fff",
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
        <span className="grid h-full w-full place-items-center rounded-full bg-ink/10 text-sm font-semibold text-ink/80">
          {account.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="absolute -right-1 -bottom-1 rounded-full ring-2 ring-white">
        <ProviderIcon provider={account.provider} size={Math.max(14, size * 0.42)} />
      </span>
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-ink/10 text-ink/80",
  scheduled: "bg-sky-500/15 text-sky-700",
  publishing: "bg-amber-500/15 text-amber-700",
  sending: "bg-amber-500/15 text-amber-700",
  pending: "bg-sky-500/15 text-sky-700",
  published: "bg-goblin-500/15 text-goblin-800",
  partial: "bg-orange-500/15 text-orange-700",
  failed: "bg-red-500/15 text-red-700",
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`card w-full ${wide ? "max-w-5xl" : "max-w-lg"} shadow-2xl`}>{children}</div>
    </div>
  );
}

/** The goblin mascot (public/brand/icon.png). */
export function GoblinIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/icon.png" alt="" width={size} height={size} className={`shrink-0 ${className}`} />
  );
}

/** Full PostGoblins wordmark (public/brand/logo.png, 720×234). */
export function Logo({ height = 40, className = "" }: { height?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo.png"
      alt="PostGoblins"
      height={height}
      width={Math.round((height * 720) / 234)}
      className={className}
      style={{ height, width: "auto" }}
    />
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
