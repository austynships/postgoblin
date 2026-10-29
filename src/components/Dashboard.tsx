"use client";

import { useCallback, useEffect, useState } from "react";
import Accounts from "./Accounts";
import Agent from "./Agent";
import Calendar from "./Calendar";
import Composer, { type ComposerSeed } from "./Composer";
import PostsList from "./PostsList";
import Settings from "./Settings";
import { request, type AccountView, type ProviderInfo } from "./ui";

type Tab = "calendar" | "posts" | "agent" | "accounts" | "settings";
type Me = { user: { name: string; email: string; timezone: string }; providers: ProviderInfo[]; aiEnabled: boolean };

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "calendar", label: "Calendar", icon: "📅" },
  { id: "posts", label: "Posts", icon: "🗂️" },
  { id: "agent", label: "Agent", icon: "👺" },
  { id: "accounts", label: "Accounts", icon: "🔗" },
  { id: "settings", label: "Settings & MCP", icon: "⚙️" },
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
      <aside className="flex shrink-0 flex-row items-center gap-1 border-b border-white/8 bg-[#0e100f] p-2 md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0 md:p-4">
        <div className="mr-2 flex items-center gap-2 px-2 md:mr-0 md:mb-6">
          <span className="text-2xl">👺</span>
          <span className="hidden font-semibold sm:inline">PostGoblins</span>
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
                tab === t.id ? "bg-white/[0.07] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
        {me && (
          <div className="hidden border-t border-white/8 pt-4 md:block">
            <div className="truncate text-sm font-medium">{me.user.name}</div>
            <div className="truncate text-xs text-zinc-500">{me.user.email}</div>
            <button className="mt-2 text-xs text-zinc-400 hover:text-zinc-200" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        {notice && (
          <div
            className={`mb-4 flex items-start justify-between gap-4 rounded-lg px-4 py-3 text-sm ${
              notice.kind === "ok" ? "bg-goblin-500/10 text-goblin-300" : "bg-red-500/10 text-red-300"
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
