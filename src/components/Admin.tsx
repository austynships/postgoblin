"use client";

import { useEffect, useState } from "react";
import { Modal, ProviderIcon, StatusPill, fmtDateTime, request } from "./ui";

type Overview = {
  users: { total: number; d7: number; d30: number; active7: number };
  accounts: { provider: string; platform: string; n: number; errors: number }[];
  posts: Record<string, number>;
  deliveries: { published24: number; published7: number; failed7: number };
  queue: { due: number; overdue: number; oldest: number | null; upcoming: number };
  lastPublishedAt: number | null;
};
type Failure = {
  postId: string;
  content: string;
  at: number;
  userId: string;
  email: string;
  provider: string;
  platform: string;
  accountName: string;
  error: string | null;
  attempts: number;
};
type UserRow = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt: number;
  lastSignInAt: number | null;
  accounts: number;
  accountErrors: number;
  posts: number;
  scheduled: number;
  published: number;
  failed: number;
  admin: boolean;
};
type UserDetail = {
  user: UserRow;
  accounts: {
    id: string;
    provider: string;
    platform: string;
    name: string;
    username: string | null;
    status: string;
    lastError: string | null;
    connectedAt: number;
    tokenExpiresAt: number | null;
  }[];
  posts: {
    id: string;
    content: string;
    status: string;
    at: number;
    createdBy: string;
    targets: { provider: string; accountName: string; status: string; error: string | null; url: string | null }[];
  }[];
};

const num = new Intl.NumberFormat();
const date = (ms: number) => new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

function ago(ms: number) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const POST_STATUSES = ["draft", "pending_approval", "scheduled", "publishing", "published", "partial", "failed"];

/** Admin-only overview of every account on PostGoblins. Read-only. */
export default function Admin() {
  const [data, setData] = useState<{ overview: Overview; failures: Failure[] } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<{ total: number; users: UserRow[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [section, setSection] = useState<"users" | "failures">("users");

  const load = () =>
    request<{ overview: Overview; failures: Failure[] }>("/api/admin/overview")
      .then(setData)
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  // Search as you type, ignoring responses for older queries.
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      request<{ total: number; users: UserRow[] }>(`/api/admin/users?q=${encodeURIComponent(q)}&limit=100`)
        .then((r) => !stale && setUsers(r))
        .catch((e) => !stale && setError((e as Error).message));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  const o = data?.overview;
  const healthy = o ? o.queue.overdue === 0 : true;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Admin</h1>
          <p className="text-sm text-ink/60">Everyone on PostGoblins. Visible only to staff on the admin list.</p>
        </div>
        <button className="btn-ghost" onClick={() => { setData(null); load(); }}>Refresh</button>
      </div>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!o ? (
        !error && <p className="text-sm text-ink/50">Loading…</p>
      ) : (
        <>
          <div
            role="status"
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-sm ${
              healthy ? "bg-goblin-500/10 text-goblin-800" : "bg-red-500/10 text-red-700"
            }`}
          >
            <span className="font-semibold">{healthy ? "✓ Scheduler healthy" : "⚠ Scheduler falling behind"}</span>
            <span className="text-ink/70">
              {healthy
                ? `${num.format(o.queue.upcoming)} deliveries queued`
                : `${num.format(o.queue.overdue)} deliveries overdue${o.queue.oldest ? `, oldest due ${ago(o.queue.oldest)}` : ""}. Check the cron job.`}
              {o.lastPublishedAt ? ` · last post went out ${ago(o.lastPublishedAt)}` : ""}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Users" value={o.users.total} />
            <Stat label="New this week" value={o.users.d7} hint={`${num.format(o.users.d30)} in the last 30 days`} />
            <Stat label="Signed in this week" value={o.users.active7} />
            <Stat label="Connected accounts" value={o.accounts.reduce((s, a) => s + a.n, 0)} />
            <Stat label="Published, 24 h" value={o.deliveries.published24} hint={`${num.format(o.deliveries.published7)} in 7 days`} />
            <Stat label="Failed, 7 days" value={o.deliveries.failed7} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card overflow-hidden">
              <h2 className="px-5 pt-4 pb-2 font-semibold">Accounts by platform</h2>
              {o.accounts.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-ink/50">No accounts connected yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-ink/50">
                    <tr className="border-b border-ink/10">
                      <th className="px-5 py-2 text-left font-medium">Platform</th>
                      <th className="px-2 py-2 text-right font-medium">Connected</th>
                      <th className="px-5 py-2 text-right font-medium">Need attention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.accounts.map((a) => (
                      <tr key={a.provider} className="border-b border-ink/5 last:border-0">
                        <td className="px-5 py-2.5">
                          <span className="flex items-center gap-2">
                            <ProviderIcon provider={a.provider} size={18} /> {a.platform}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{num.format(a.n)}</td>
                        <td className={`px-5 py-2.5 text-right tabular-nums ${a.errors ? "text-red-700" : "text-ink/40"}`}>
                          {a.errors || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card overflow-hidden">
              <h2 className="px-5 pt-4 pb-2 font-semibold">Posts by status</h2>
              <table className="w-full text-sm">
                <tbody>
                  {POST_STATUSES.map((s) => (
                    <tr key={s} className="border-b border-ink/5 last:border-0">
                      <td className="px-5 py-2.5">
                        <StatusPill status={s} />
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{num.format(o.posts[s] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}

      <div className="flex gap-1 border-b border-ink/10">
        {(["users", "failures"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${
              section === s ? "border-goblin-500 text-ink" : "border-transparent text-ink/60 hover:text-ink"
            }`}
          >
            {s === "users" ? `Users${users ? ` (${num.format(users.total)})` : ""}` : `Recent failures${data ? ` (${data.failures.length})` : ""}`}
          </button>
        ))}
      </div>

      {section === "users" ? (
        <section className="space-y-3">
          <label className="sr-only" htmlFor="admin-search">Search users</label>
          <input
            id="admin-search"
            className="input max-w-md"
            placeholder="Search by email or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-ink/50">
                <tr className="border-b border-ink/10">
                  <th className="px-4 py-2 text-left font-medium">User</th>
                  <th className="px-2 py-2 text-left font-medium">Joined</th>
                  <th className="px-2 py-2 text-left font-medium">Last sign-in</th>
                  <th className="px-2 py-2 text-right font-medium">Accounts</th>
                  <th className="px-2 py-2 text-right font-medium">Scheduled</th>
                  <th className="px-2 py-2 text-right font-medium">Published</th>
                  <th className="px-4 py-2 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {!users ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-ink/50">Loading…</td>
                  </tr>
                ) : users.users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-ink/50">No users match.</td>
                  </tr>
                ) : (
                  users.users.map((u) => (
                    <tr
                      key={u.id}
                      className="cursor-pointer border-b border-ink/5 last:border-0 hover:bg-ink/[0.03]"
                      onClick={() => setOpen(u.id)}
                    >
                      <td className="max-w-[260px] px-4 py-2.5">
                        <button className="block w-full truncate text-left font-medium hover:underline" onClick={() => setOpen(u.id)}>
                          {u.name}
                          {u.admin && <span className="ml-2 rounded bg-goblin-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-goblin-800">ADMIN</span>}
                        </button>
                        <div className="truncate text-xs text-ink/55">{u.email}</div>
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-ink/70">{date(u.createdAt)}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-ink/70">{u.lastSignInAt ? ago(u.lastSignInAt) : "—"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {u.accounts}
                        {u.accountErrors > 0 && <span className="ml-1 text-red-700" title={`${u.accountErrors} need attention`}>!</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{u.scheduled}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{u.published}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${u.failed ? "text-red-700" : "text-ink/40"}`}>{u.failed || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {users && users.total > users.users.length && (
            <p className="text-xs text-ink/50">Showing the newest {users.users.length} of {num.format(users.total)}. Search to narrow it down.</p>
          )}
        </section>
      ) : (
        <section>
          {!data ? (
            <p className="text-sm text-ink/50">Loading…</p>
          ) : data.failures.length === 0 ? (
            <div className="card p-8 text-center text-sm text-ink/60">No failed deliveries. 🎉</div>
          ) : (
            <ul className="space-y-2">
              {data.failures.map((f, i) => (
                <li key={`${f.postId}-${i}`} className="card p-4 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/60">
                    <ProviderIcon provider={f.provider} size={16} />
                    <span className="text-ink/80">{f.platform} · {f.accountName}</span>
                    <span>·</span>
                    <button className="text-goblin-800 hover:underline" onClick={() => setOpen(f.userId)}>{f.email}</button>
                    <span>·</span>
                    <span>{fmtDateTime(f.at)}</span>
                    <span>· {f.attempts} attempt{f.attempts === 1 ? "" : "s"}</span>
                  </div>
                  <p className="text-xs break-words text-red-700">{f.error ?? "Unknown error"}</p>
                  <p className="mt-1 line-clamp-2 text-ink/70">{f.content || "(media only)"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {open && <UserPanel id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card p-4" title={hint}>
      <div className="text-xs text-ink/55">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{num.format(value)}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink/45">{hint}</div>}
    </div>
  );
}

function UserPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<UserDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request<UserDetail>(`/api/admin/users/${id}`).then(setD).catch((e) => setError((e as Error).message));
  }, [id]);

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-start justify-between gap-4 border-b border-ink/10 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{d?.user.name ?? "User"}</h2>
          {d && (
            <p className="truncate text-xs text-ink/55">
              {d.user.email} · joined {date(d.user.createdAt)} · {d.user.timezone}
              {d.user.lastSignInAt ? ` · signed in ${ago(d.user.lastSignInAt)}` : ""}
            </p>
          )}
        </div>
        <button className="text-ink/60 hover:text-ink" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="space-y-6 p-5">
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!d ? (
          !error && <p className="text-sm text-ink/50">Loading…</p>
        ) : (
          <>
            <section>
              <div className="label">Connected accounts ({d.accounts.length})</div>
              {d.accounts.length === 0 ? (
                <p className="text-sm text-ink/50">None yet.</p>
              ) : (
                <ul className="divide-y divide-ink/10 rounded-lg border border-ink/10">
                  {d.accounts.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                      <ProviderIcon provider={a.provider} size={20} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          {a.name}
                          <span className="text-ink/50">
                            {" "}· {a.platform}
                            {a.username ? ` · ${a.username}` : ""}
                          </span>
                        </div>
                        <div className="text-xs text-ink/50">
                          Connected {date(a.connectedAt)}
                          {a.tokenExpiresAt ? ` · token ${a.tokenExpiresAt < Date.now() ? "expired" : "expires"} ${date(a.tokenExpiresAt)}` : ""}
                        </div>
                        {a.lastError && <div className="mt-0.5 text-xs break-words text-red-700">{a.lastError}</div>}
                      </div>
                      <span className={`text-xs ${a.status === "active" ? "text-goblin-800" : "text-red-700"}`}>
                        {a.status === "active" ? "OK" : "Needs attention"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <div className="label">Recent posts ({d.posts.length}{d.user.posts > d.posts.length ? ` of ${d.user.posts}` : ""})</div>
              {d.posts.length === 0 ? (
                <p className="text-sm text-ink/50">None yet.</p>
              ) : (
                <ul className="space-y-2">
                  {d.posts.map((p) => (
                    <li key={p.id} className="rounded-lg border border-ink/10 p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink/55">
                        <StatusPill status={p.status} />
                        <span>{fmtDateTime(p.at)}</span>
                        {p.createdBy === "agent" && <span>· by agent</span>}
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap text-ink/85">{p.content || "(media only)"}</p>
                      {p.targets.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.targets.map((t, i) => (
                            <span
                              key={i}
                              className="flex items-center gap-1 rounded-full border border-ink/15 py-0.5 pr-2 pl-0.5 text-[11px]"
                              title={t.error ?? undefined}
                            >
                              <ProviderIcon provider={t.provider} size={14} />
                              {t.url ? (
                                <a href={t.url} target="_blank" rel="noreferrer" className="text-goblin-800 hover:underline">{t.status}</a>
                              ) : (
                                <span className={t.status === "failed" ? "text-red-700" : ""}>{t.status}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {p.targets
                        .filter((t) => t.error)
                        .map((t, i) => (
                          <p key={i} className="mt-1 text-xs break-words text-red-700">
                            {t.accountName}: {t.error}
                          </p>
                        ))}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
