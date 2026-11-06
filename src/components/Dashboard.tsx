"use client";

import { useCallback, useEffect, useState } from "react";
import Accounts from "./Accounts";
import Admin, { type AdminSection } from "./Admin";
import Agent from "./Agent";
import Analytics from "./Analytics";
import Calendar from "./Calendar";
import Composer, { type ComposerSeed } from "./Composer";
import FeedbackDialog, { type FeedbackMode } from "./FeedbackDialog";
import { BACK_ICON, MORE_ICON, MobileTabBar, MoreSheet, type NavItem } from "./MobileNav";
import PostsList from "./PostsList";
import Settings from "./Settings";
import { ThemeToggle } from "./Theme";
import { GoblinIcon, Logo, request, type AccountView, type ProviderInfo } from "./ui";

type Tab = "calendar" | "posts" | "analytics" | "agent" | "accounts" | "settings";
type Me = {
  user: { id: string; name: string; email: string; timezone: string };
  providers: ProviderInfo[];
  aiEnabled: boolean;
  directUploads: boolean;
  approveAgentPosts: boolean;
  isAdmin: boolean;
};

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
  analytics: (
    <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
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

const SHIELD = (
  <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const ADMIN_TABS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  {
    id: "overview",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
  },
  {
    id: "users",
    label: "Users",
    icon: (
      <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" />
      </svg>
    ),
  },
  {
    id: "revenue",
    label: "Revenue",
    icon: (
      <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
        <path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.8 7 7s2.2 3.2 5 4 5 1.8 5 4.3-2.2 3.7-5 3.7-5-1.2-5-3.2" />
      </svg>
    ),
  },
  {
    id: "plans",
    label: "Plans",
    icon: (
      <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
        <path d="M12 2l10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: "reviews",
    label: "Reviews",
    icon: (
      <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
        <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z" />
      </svg>
    ),
  },
  {
    id: "feedback",
    label: "Feedback",
    icon: (
      <svg viewBox="0 0 24 24" width={18} height={18} {...stroke}>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />
      </svg>
    ),
  },
];

const navClass = (active: boolean) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
    active ? "bg-goblin-100 font-semibold text-ink ring-1 ring-goblin-500/50 ring-inset" : "text-ink/60 hover:bg-ink/[0.04] hover:text-ink"
  }`;

const TABS: { id: Tab; label: string }[] = [
  { id: "calendar", label: "Calendar" },
  { id: "posts", label: "Posts" },
  { id: "analytics", label: "Analytics" },
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
  const [awaiting, setAwaiting] = useState(0);
  /** Staff switch the whole sidebar to the admin area and back. */
  const [mode, setMode] = useState<"app" | "admin">("app");
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const [newFeedback, setNewFeedback] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackMode | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const loadAccounts = useCallback(async () => {
    setAccounts((await request<{ accounts: AccountView[] }>("/api/accounts")).accounts);
  }, []);

  useEffect(() => {
    request<Me>("/api/me").then(setMe);
    loadAccounts();
    // Results of an OAuth round-trip come back as query params.
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab");
    if (t === "admin") setMode("admin");
    else if (TABS.some((x) => x.id === t)) setTab(t as Tab);
    if (q.get("connected")) setNotice({ kind: "ok", text: `Connected ${q.get("connected")}` });
    if (q.get("error")) setNotice({ kind: "error", text: q.get("error")! });
    if (q.size) window.history.replaceState(null, "", "/");
  }, [loadAccounts]);

  // Only staff on the admin list can open the Admin tab (e.g. via ?tab=admin).
  useEffect(() => {
    if (mode === "admin" && me && !me.isAdmin) setMode("app");
  }, [mode, me]);

  // Count of new feedback for the badge in the admin menu.
  const loadFeedbackCount = useCallback(() => {
    request<{ counts: { new: number } }>("/api/admin/feedback?status=new")
      .then((r) => setNewFeedback(r.counts.new))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (me?.isAdmin) loadFeedbackCount();
  }, [me?.isAdmin, mode, loadFeedbackCount]);

  // Badge on Posts for anything waiting for approval.
  useEffect(() => {
    request<{ posts: unknown[] }>("/api/posts?status=pending_approval&limit=100")
      .then((r) => setAwaiting(r.posts.length))
      .catch(() => {});
  }, [version]);

  // Keep statuses fresh while posts are publishing in the background.
  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function logout() {
    await request("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  // ---- Phone navigation: a bottom tab bar with the most used pages, the rest under "More". ----
  const appItem = (id: Tab, label: string, icon: React.ReactNode, badge?: number): NavItem => ({
    id,
    label,
    icon,
    badge,
    active: mode === "app" && tab === id,
    onClick: () => {
      setMode("app");
      setTab(id);
    },
  });
  const adminItem = (id: AdminSection, badge?: number): NavItem => {
    const t = ADMIN_TABS.find((x) => x.id === id)!;
    return { id, label: t.label, icon: t.icon, badge, active: mode === "admin" && adminSection === id, onClick: () => setAdminSection(id) };
  };
  const appMore: NavItem[] = [
    appItem("analytics", "Analytics", NAV_ICONS.analytics),
    appItem("accounts", "Accounts", NAV_ICONS.accounts),
    appItem("settings", "Settings & MCP", NAV_ICONS.settings),
  ];
  const adminEntry: NavItem[] = me?.isAdmin
    ? [{ id: "admin", label: "Admin", icon: SHIELD, badge: newFeedback, onClick: () => setMode("admin") }]
    : [];
  const adminMore: NavItem[] = [adminItem("reviews"), adminItem("revenue"), adminItem("plans")];
  const moreItems = mode === "admin" ? adminMore : appMore;
  const moreActive = moreItems.some((i) => i.active);
  const moreButton: NavItem = {
    id: "more",
    label: "More",
    icon: MORE_ICON,
    active: moreActive || moreOpen,
    badge: mode === "app" && me?.isAdmin ? newFeedback : undefined,
    onClick: () => setMoreOpen(true),
  };
  const tabBar: NavItem[] =
    mode === "admin"
      ? [
          { id: "back", label: "App", icon: BACK_ICON, onClick: () => setMode("app") },
          adminItem("overview"),
          adminItem("users"),
          adminItem("feedback", newFeedback),
          moreButton,
        ]
      : [
          appItem("calendar", "Calendar", NAV_ICONS.calendar),
          appItem("posts", "Posts", NAV_ICONS.posts, awaiting),
          appItem("agent", "Agent", <GoblinIcon size={22} />),
          moreButton,
        ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Phone header: just the brand. Navigation lives in the bottom tab bar. */}
      <header className="flex items-center justify-between border-b border-ink/10 bg-surface px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex h-14 items-center">
          <Logo height={34} />
        </div>
        {mode === "admin" && (
          <span className="rounded-full bg-goblin-500/15 px-2.5 py-0.5 text-xs font-semibold text-goblin-800">Admin</span>
        )}
      </header>

      {/* On desktop the sidebar is pinned to the window height, so it looks the same on every tab however long the page is. */}
      <aside className="hidden shrink-0 flex-col gap-1 border-r border-ink/10 bg-surface p-4 md:sticky md:top-0 md:flex md:h-screen md:w-56 md:overflow-y-auto">
        <div className="mr-2 flex items-center px-1 md:mr-0 md:mb-6">
          <GoblinIcon size={36} className="md:hidden" />
          <Logo height={54} className="hidden max-w-full md:block" />
        </div>
        {mode === "admin" ? (
          <button className="btn-ghost mr-2 md:mr-0 md:mb-4" onClick={() => setMode("app")}>
            <span className="text-base leading-none" aria-hidden>←</span>
            <span className="hidden sm:inline">Back to app</span>
          </button>
        ) : (
          <button className="btn-primary mr-2 md:mr-0 md:mb-4" onClick={() => setComposer({})}>
            <span className="text-base leading-none">+</span>
            <span className="hidden sm:inline">New post</span>
          </button>
        )}
        {mode === "admin" ? (
          <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col" aria-label="Admin">
            <div className="hidden px-3 pb-1 text-[11px] font-semibold tracking-wider text-ink/45 uppercase md:block">Admin</div>
            {ADMIN_TABS.map((t) => (
              <button key={t.id} onClick={() => setAdminSection(t.id)} className={navClass(adminSection === t.id)}>
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
                {t.id === "feedback" && newFeedback > 0 && (
                  <span className="ml-auto rounded-full bg-goblin-500/20 px-1.5 text-[11px] font-semibold text-goblin-800" title={`${newFeedback} new`}>
                    {newFeedback}
                  </span>
                )}
              </button>
            ))}
          </nav>
        ) : (
          <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col">
            {me?.isAdmin && (
              <>
                <button onClick={() => setMode("admin")} className={navClass(false)}>
                  {SHIELD}
                  <span className="hidden sm:inline">Admin</span>
                  {newFeedback > 0 && (
                    <span className="ml-auto rounded-full bg-goblin-500/20 px-1.5 text-[11px] font-semibold text-goblin-800" title={`${newFeedback} new feedback`}>
                      {newFeedback}
                    </span>
                  )}
                </button>
                <span className="mx-1 w-px shrink-0 bg-ink/10 md:mx-0 md:my-1.5 md:h-px md:w-auto" aria-hidden />
              </>
            )}
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={navClass(tab === t.id)}
              >
                {t.id === "agent" ? <GoblinIcon size={20} /> : NAV_ICONS[t.id]}
                <span className="hidden sm:inline">{t.label}</span>
                {t.id === "posts" && awaiting > 0 && (
                  <span
                    className="ml-auto rounded-full bg-violet-500/15 px-1.5 text-[11px] font-semibold text-violet-700"
                    title={`${awaiting} waiting for approval`}
                  >
                    {awaiting}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
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
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <button className="text-ink/60 hover:text-ink" onClick={() => setFeedback("feedback")}>Send feedback</button>
              <button className="text-ink/60 hover:text-ink" onClick={() => setFeedback("review")}>Rate us</button>
            </div>
            <div className="mt-2 flex gap-3 text-[11px] text-ink/40">
              <a className="hover:text-ink" href="/privacy" target="_blank">Privacy</a>
              <a className="hover:text-ink" href="/terms" target="_blank">Terms</a>
            </div>
          </div>
        )}
      </aside>

      {/* Bottom padding on phones keeps content clear of the tab bar. */}
      <main className="min-w-0 flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-8">
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

        {mode === "admin" && me?.isAdmin ? (
          <Admin section={adminSection} onFeedbackChanged={loadFeedbackCount} />
        ) : (
          <>
            {tab === "calendar" && (
              <Calendar version={version} accounts={accounts} onCompose={setComposer} />
            )}
            {tab === "posts" && (
              <PostsList version={version} onEdit={(post) => setComposer({ post })} onChanged={refresh} />
            )}
            {tab === "analytics" && me && <Analytics providers={me.providers} onCompose={() => setComposer({})} />}
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
              <Settings
                timezone={me.user.timezone}
                approveAgentPosts={me.approveAgentPosts}
                onTimezoneSaved={() => request<Me>("/api/me").then(setMe)}
                onFeedback={setFeedback}
              />
            )}
          </>
        )}
      </main>

      <MobileTabBar items={tabBar} onCreate={mode === "app" ? () => setComposer({}) : undefined} />
      {moreOpen && (
        <MoreSheet
          items={moreItems}
          extra={mode === "app" ? adminEntry : [{ id: "back", label: "Back to app", icon: BACK_ICON, onClick: () => setMode("app") }]}
          user={me?.user ?? null}
          onClose={() => setMoreOpen(false)}
          onFeedback={setFeedback}
          onLogout={logout}
        />
      )}

      {feedback && (
        <FeedbackDialog
          mode={feedback}
          page={mode === "admin" ? `admin/${adminSection}` : tab}
          onClose={() => setFeedback(null)}
          onSent={(msg) => {
            setFeedback(null);
            setNotice({ kind: "ok", text: msg });
            if (me?.isAdmin) loadFeedbackCount();
          }}
        />
      )}

      {composer && me && (
        <Composer
          seed={composer}
          accounts={accounts}
          providers={me.providers}
          aiEnabled={me.aiEnabled}
          directUploads={me.directUploads}
          userId={me.user.id}
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
