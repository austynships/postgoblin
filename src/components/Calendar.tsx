"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComposerSeed } from "./Composer";
import { GoblinIcon, ProviderIcon, StatusPill, fmtTime, postTime, request, type AccountView, type PostView } from "./ui";

type View = "week" | "month";

const DAY = 86400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday
  return s;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export default function Calendar({
  version,
  accounts,
  onCompose,
}: {
  version: number;
  accounts: AccountView[];
  onCompose: (seed: ComposerSeed) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [posts, setPosts] = useState<PostView[]>([]);

  const days = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const s = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, i) => addDays(s, i));
  }, [view, anchor]);

  const from = days[0].getTime();
  const to = addDays(days[days.length - 1], 1).getTime();

  useEffect(() => {
    request<{ posts: PostView[] }>(`/api/posts?from=${from}&to=${to}`).then((r) => setPosts(r.posts));
  }, [from, to, version]);

  const byDay = (d: Date) =>
    posts.filter((p) => sameDay(new Date(postTime(p)), d)).sort((a, b) => postTime(a) - postTime(b));

  const shift = (dir: number) =>
    setAnchor((a) =>
      view === "week" ? addDays(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1),
    );

  const title =
    view === "month"
      ? anchor.toLocaleDateString([], { month: "long", year: "numeric" })
      : `${days[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`;

  const today = new Date();
  const upcoming = posts.filter((p) => p.status === "scheduled").length;

  /** Default time for a new post on a day: next round hour today, else 9:00. */
  const seedFor = (d: Date): ComposerSeed => {
    if (sameDay(d, today)) {
      const t = new Date();
      t.setHours(t.getHours() + 1, 0, 0, 0);
      return { at: t.getTime() };
    }
    const t = new Date(d);
    t.setHours(9, 0, 0, 0);
    return { at: t.getTime() };
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{title}</h1>
          <p className="text-sm text-ink/50">
            {upcoming} scheduled in view · {accounts.length} connected account{accounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink/15 p-0.5">
            {(["week", "month"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm capitalize ${view === v ? "bg-goblin-100" : "text-ink/60"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button className="btn-ghost" onClick={() => shift(-1)} aria-label="Previous">‹</button>
          <button className="btn-ghost" onClick={() => setAnchor(new Date())}>Today</button>
          <button className="btn-ghost" onClick={() => shift(1)} aria-label="Next">›</button>
        </div>
      </div>

      {view === "week" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {days.map((d) => {
            const isToday = sameDay(d, today);
            const past = d < startOfDay(today);
            return (
              <div key={d.toISOString()} className={`card flex min-h-[220px] flex-col p-3 ${isToday ? "border-goblin-500/50" : ""}`}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-ink/50 uppercase">{d.toLocaleDateString([], { weekday: "short" })}</div>
                    <div className={`text-lg font-semibold ${isToday ? "text-goblin-800" : ""}`}>{d.getDate()}</div>
                  </div>
                  {!past && (
                    <button
                      className="grid h-7 w-7 place-items-center rounded-md text-ink/50 hover:bg-goblin-100 hover:text-white"
                      onClick={() => onCompose(seedFor(d))}
                      aria-label="New post on this day"
                    >
                      +
                    </button>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {byDay(d).map((p) => (
                    <PostCard key={p.id} post={p} onClick={() => onCompose({ post: p })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-ink/10 text-center text-xs text-ink/50 uppercase">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = byDay(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              const past = d < startOfDay(today);
              return (
                <div
                  key={d.toISOString()}
                  className={`group min-h-[110px] border-r border-b border-ink/10 p-1.5 ${inMonth ? "" : "opacity-40"} ${
                    past ? "" : "cursor-pointer hover:bg-ink/[0.02]"
                  }`}
                  onClick={() => !past && onCompose(seedFor(d))}
                >
                  <div className={`mb-1 text-xs ${sameDay(d, today) ? "font-bold text-goblin-800" : "text-ink/60"}`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((p) => (
                      <button
                        key={p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCompose({ post: p });
                        }}
                        className="flex w-full items-center gap-1 truncate rounded bg-goblin-100 px-1.5 py-0.5 text-left text-[11px] hover:bg-goblin-100"
                      >
                        <Dot status={p.status} />
                        <span className="text-ink/50">{fmtTime(postTime(p))}</span>
                        <span className="truncate">{p.content || "(media)"}</span>
                      </button>
                    ))}
                    {list.length > 3 && <div className="px-1 text-[11px] text-ink/50">+{list.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Dot({ status }: { status: string }) {
  const c: Record<string, string> = {
    draft: "bg-zinc-400",
    scheduled: "bg-sky-400",
    publishing: "bg-amber-400",
    published: "bg-goblin-400",
    partial: "bg-orange-400",
    failed: "bg-red-400",
  };
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c[status] ?? "bg-zinc-400"}`} />;
}

function PostCard({ post, onClick }: { post: PostView; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-ink/10 bg-surface p-2 text-left transition hover:border-ink/30"
    >
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="text-xs text-ink/60">{fmtTime(postTime(post))}</span>
        <StatusPill status={post.status} />
      </div>
      <p className="line-clamp-3 text-xs leading-relaxed text-ink">{post.content || "(media only)"}</p>
      <div className="mt-2 flex items-center gap-1">
        {post.targets.map((t) => (
          <span key={t.accountId} title={`${t.accountName}: ${t.status}${t.error ? ` — ${t.error}` : ""}`}>
            <ProviderIcon provider={t.provider} size={16} />
          </span>
        ))}
        {post.media.length > 0 && <span className="ml-auto text-[10px] text-ink/50">🖼 {post.media.length}</span>}
        {post.createdBy === "agent" && (
          <span className="ml-auto" title="Created by the agent">
            <GoblinIcon size={16} />
          </span>
        )}
      </div>
    </button>
  );
}
