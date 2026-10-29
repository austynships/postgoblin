"use client";

import { useCallback, useEffect, useState } from "react";
import Accounts from "./Accounts";
import Agent from "./Agent";
import Calendar from "./Calendar";
import Composer, { type ComposerSeed } from "./Composer";
import PostsList from "./PostsList";
import Settings from "./Settings";
import { ThemeToggle } from "./Theme";
import { GoblinIcon, Logo, request, type AccountView, type ProviderInfo } from "./ui";

type Tab = "calendar" | "posts" | "agent" | "accounts" | "settings";
type Me = { user: { name: string; email: string; timezone: string }; providers: ProviderInfo[]; aiEnabled: boolean };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const NAV_ICONS: Record<Exclude<Tab, "agent">, React.ReactNode> = {
  calendar: (
    <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4" />
    </svg>
  ),
  posts: (
    <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  accounts: (
    <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const TABS: { id: Tab; label: string }[] = [
  { id: "calendar", label: "Calendar" },
  { id: "posts", label: "Posts" },
  { id: "agent", label: "Agent" },
  { id: "accounts", label: "Accounts" },
  { id: "settings", label: "Settings & MCP" },
];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("calendar");
  const [me, setMe] = useState<Me | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [composer, setComposer] = useState<ComposerSeed | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const loadAccounts = useCallback(async () => {
    setAccounts((await request<{ accounts: AccountView[] }>("/api/accounts")).accounts);
  }, []);

  useEffect(() => {
    request<Me>("/api/me").then(setMe);
    loadAccounts();
    // Results of an OAuth round-trip come back as query params.
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    if (q.get("connected")) setNotice({ kind: "ok", text: `Connected ${q.get("connected")}` });
    if (q.get("error")) setNotice({ kind: "error", text: q.get("error")! });
    if (q.size) window.history.replaceState(null, "", "/");
  }, [loadAccounts]);

  // Keep statuses fresh while posts are publishing in the background.
  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function logout() {
    await request("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-row items-center gap-1 border-b border-ink/10 bg-surface p-2 md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0 md:p-4">
        <div className="mr-2 flex items-center px-1 md:mr-0 md:mb-6">
          <GoblinIcon size={36} className="md:hidden" />
          <Logo height={54} className="hidden max-w-full md:block" />
        </div>
        <button className="btn-primary mr-2 md:mr-0 md:mb-4" onClick={() => setComposer({})}>
          <span className="text-base leading-none">+</span>
          <span className="hidden sm:inline">New post</span>
        </button>
        <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
                tab === t.id
                  ? "bg-goblin-100 font-semibold text-ink ring-1 ring-goblin-500/50"
                  : "text-ink/60 hover:bg-ink/[0.04] hover:text-ink"
              }`}
            >
              {t.id === "agent" ? <GoblinIcon size={20} /> : NAV_ICONS[t.id]}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
        {me && (
          <div className="hidden border-t border-ink/10 pt-4 md:block">
            <div className="truncate text-sm font-medium">{me.user.name}</div>
            <div className="truncate text-xs text-ink/50">{me.user.email}</div>
            <div className="mt-3 flex items-center justify-between">
              <button className="text-xs text-ink/60 hover:text-ink" onClick={logout}>
                Sign out
              </button>
              <ThemeToggle />
            </div>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        {notice && (
          <div
            className={`mb-4 flex items-start justify-between gap-4 rounded-lg px-4 py-3 text-sm ${
              notice.kind === "ok" ? "bg-goblin-500/10 text-goblin-800" : "bg-red-500/10 text-red-700"
            }`}
          >
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)}>✕</button>
          </div>
        )}

        {tab === "calendar" && (
          <Calendar version={version} accounts={accounts} onCompose={setComposer} />
        )}
        {tab === "posts" && (
          <PostsList version={version} onEdit={(post) => setComposer({ post })} onChanged={refresh} />
        )}
        {tab === "agent" && me && (
          <Agent aiEnabled={me.aiEnabled} hasAccounts={accounts.length > 0} onChanged={refresh} />
        )}
        {tab === "accounts" && me && (
          <Accounts
            providers={me.providers}
            accounts={accounts}
            onChanged={() => {
              loadAccounts();
              refresh();
            }}
          />
        )}
        {tab === "settings" && me && (
          <Settings timezone={me.user.timezone} onTimezoneSaved={() => request<Me>("/api/me").then(setMe)} />
        )}
      </main>

      {composer && me && (
        <Composer
          seed={composer}
          accounts={accounts}
          providers={me.providers}
          aiEnabled={me.aiEnabled}
          onClose={() => setComposer(null)}
          onSaved={(msg) => {
            setComposer(null);
            setNotice({ kind: "ok", text: msg });
            refresh();
          }}
          onGoToAccounts={() => {
            setComposer(null);
            setTab("accounts");
          }}
        />
      )}
    </div>
  );
}
