"use client";

import { useEffect } from "react";
import { ThemeToggle } from "./Theme";
import { GoblinIcon } from "./ui";

export type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  active?: boolean;
  onClick: () => void;
};

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const MORE_ICON = (
  <svg viewBox="0 0 24 24" width={22} height={22} {...stroke}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </svg>
);
export const BACK_ICON = (
  <svg viewBox="0 0 24 24" width={22} height={22} {...stroke}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

/** Phone-only bar fixed to the bottom of the screen, like a native app's tab bar. */
export function MobileTabBar({ items, onCreate }: { items: NavItem[]; onCreate?: () => void }) {
  // With a create button the middle slot holds it: two items, +, two items.
  const left = onCreate ? items.slice(0, 2) : items;
  const right = onCreate ? items.slice(2) : [];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
        {left.map((it) => (
          <TabButton key={it.id} item={it} />
        ))}
        {onCreate && (
          <div className="flex flex-1 items-center justify-center">
            <button
              onClick={onCreate}
              aria-label="New post"
              className="grid h-12 w-12 place-items-center rounded-full bg-goblin-500 text-2xl leading-none font-semibold text-black shadow-[0_2px_0_var(--color-outline)] ring-2 ring-[var(--color-outline)] transition active:translate-y-px"
            >
              +
            </button>
          </div>
        )}
        {right.map((it) => (
          <TabButton key={it.id} item={it} />
        ))}
      </div>
    </nav>
  );
}

function TabButton({ item }: { item: NavItem }) {
  return (
    <button
      onClick={item.onClick}
      aria-current={item.active ? "page" : undefined}
      className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] transition ${
        item.active ? "font-semibold text-goblin-800" : "text-ink/55 active:text-ink"
      }`}
    >
      <span className={`grid h-7 w-12 place-items-center rounded-full ${item.active ? "bg-goblin-100" : ""}`}>{item.icon}</span>
      <span className="max-w-full truncate px-0.5">{item.label}</span>
      {!!item.badge && (
        <span className="absolute top-1.5 left-1/2 ml-2.5 min-w-[18px] rounded-full bg-violet-600 px-1 text-center text-[10px] leading-[18px] font-semibold text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </button>
  );
}

/** Bottom sheet behind the "More" tab: the remaining pages plus account controls. */
export function MoreSheet({
  items,
  extra,
  user,
  onClose,
  onFeedback,
  onLogout,
}: {
  items: NavItem[];
  extra?: NavItem[];
  user: { name: string; email: string } | null;
  onClose: () => void;
  onFeedback: (mode: "feedback" | "review") => void;
  onLogout: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const row = (it: NavItem) => (
    <button
      key={it.id}
      onClick={() => {
        it.onClick();
        onClose();
      }}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] ${
        it.active ? "bg-goblin-100 font-semibold text-ink" : "text-ink/85 active:bg-ink/[0.05]"
      }`}
    >
      <span className="grid w-6 place-items-center text-ink/70">{it.icon}</span>
      <span className="flex-1">{it.label}</span>
      {!!it.badge && (
        <span className="rounded-full bg-goblin-500/20 px-2 text-xs font-semibold text-goblin-800">{it.badge}</span>
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More">
      <button className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-ink/10 bg-surface p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/20" aria-hidden />
        <div className="space-y-0.5">{items.map(row)}</div>
        {extra && extra.length > 0 && <div className="mt-1 space-y-0.5 border-t border-ink/10 pt-1">{extra.map(row)}</div>}
        <div className="mt-1 grid grid-cols-2 gap-2 border-t border-ink/10 pt-3">
          <button className="btn-ghost" onClick={() => { onClose(); onFeedback("feedback"); }}>Send feedback</button>
          <button className="btn-ghost" onClick={() => { onClose(); onFeedback("review"); }}>Rate us</button>
        </div>
        {user && (
          <div className="mt-3 flex items-center gap-3 border-t border-ink/10 px-1 pt-3">
            <GoblinIcon size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-ink/50">{user.email}</div>
            </div>
            <ThemeToggle />
          </div>
        )}
        <div className="mt-3 flex items-center justify-between px-1 text-xs">
          <button className="text-ink/70 underline-offset-2 active:underline" onClick={onLogout}>Sign out</button>
          <span className="flex gap-3 text-ink/40">
            <a href="/privacy" target="_blank">Privacy</a>
            <a href="/terms" target="_blank">Terms</a>
          </span>
        </div>
      </div>
    </div>
  );
}
