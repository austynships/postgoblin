"use client";

import { useEffect, useState } from "react";
import { ProviderIcon, StatusPill, fmtDateTime, postTime, request, type PostView } from "./ui";

const FILTERS = [
  { id: "upcoming", label: "Upcoming", status: "scheduled,publishing" },
  { id: "drafts", label: "Drafts", status: "draft" },
  { id: "published", label: "Published", status: "published,partial" },
  { id: "failed", label: "Failed", status: "failed,partial" },
] as const;

export default function PostsList({
  version,
  onEdit,
  onChanged,
}: {
  version: number;
  onEdit: (p: PostView) => void;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("upcoming");
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    request<{ posts: PostView[] }>(`/api/posts?status=${f.status}&limit=300`).then((r) => {
      const list = filter === "failed" ? r.posts.filter((p) => p.targets.some((t) => t.status === "failed")) : r.posts;
      // Newest first for history, soonest first for upcoming.
      setPosts(filter === "upcoming" ? list : [...list].reverse());
    });
  }, [filter, version]);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-semibold">Posts</h1>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-white/8">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${
              filter === f.id ? "border-goblin-500 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      {posts === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : posts.length === 0 ? (
        <div className="card p-10 text-center text-sm text-zinc-400">Nothing here yet.</div>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <StatusPill status={p.status} />
                <span>
                  {p.status === "draft" ? "Draft · edited " + fmtDateTime(p.updatedAt) : fmtDateTime(postTime(p))}
                </span>
                {p.createdBy === "agent" && <span title="Created by the agent">· 👺 agent</span>}
              </div>
              <p className="mb-3 line-clamp-4 text-sm whitespace-pre-wrap text-zinc-200">{p.content || "(media only)"}</p>
              {p.media.length > 0 && (
                <div className="mb-3 flex gap-1.5">
                  {p.media.map((m) =>
                    m.mime.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={m.id} src={m.url} alt="" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <span key={m.id} className="grid h-12 w-12 place-items-center rounded bg-zinc-800 text-xs">▶</span>
                    ),
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {p.targets.map((t) => (
                    <span
                      key={t.accountId}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 py-0.5 pr-2.5 pl-1 text-xs"
                      title={t.error ?? undefined}
                    >
                      <ProviderIcon provider={t.provider} size={16} />
                      <span className="max-w-[120px] truncate">{t.accountName}</span>
                      {t.remoteUrl ? (
                        <a href={t.remoteUrl} target="_blank" rel="noreferrer" className="text-goblin-400 hover:underline">
                          ↗
                        </a>
                      ) : (
                        t.status !== "pending" && <StatusPill status={t.status} />
                      )}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  {p.targets.some((t) => t.status === "failed") && (
                    <button className="btn-ghost py-1 text-xs" onClick={() => act(() => request(`/api/posts/${p.id}/retry`, { method: "POST" }))}>
                      Retry failed
                    </button>
                  )}
                  <button className="btn-ghost py-1 text-xs" onClick={() => onEdit(p)}>
                    {["draft", "scheduled", "failed"].includes(p.status) ? "Edit" : "Details"}
                  </button>
                </div>
              </div>
              {p.targets
                .filter((t) => t.error && t.status !== "published")
                .map((t) => (
                  <p key={t.accountId} className="mt-2 text-xs break-words text-red-300">
                    {t.accountName}: {t.error}
                    {t.status === "pending" && ` (retrying, attempt ${t.attempts + 1})`}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
