"use client";

import { useMemo, useRef, useState } from "react";
import { CHAR_LIMITS, countChars } from "@/lib/limits";
import { Avatar, Modal, ProviderIcon, StatusPill, request, type AccountView, type PostView, type ProviderInfo } from "./ui";

export type ComposerSeed = { post?: PostView; at?: number };
type Media = PostView["media"][number];

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Composer({
  seed,
  accounts,
  providers,
  aiEnabled,
  onClose,
  onSaved,
  onGoToAccounts,
}: {
  seed: ComposerSeed;
  accounts: AccountView[];
  providers: ProviderInfo[];
  aiEnabled: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onGoToAccounts: () => void;
}) {
  const post = seed.post;
  const locked = post && ["publishing", "published", "partial"].includes(post.status);
  const [content, setContent] = useState(post?.content ?? "");
  const [selected, setSelected] = useState<string[]>(
    post ? post.targets.map((t) => t.accountId) : accounts.filter((a) => a.status === "active").map((a) => a.id),
  );
  const [media, setMedia] = useState<Media[]>(post?.media ?? []);
  const [when, setWhen] = useState(() => {
    const at = post?.scheduledAt ?? seed.at ?? (() => {
      const t = new Date();
      t.setHours(t.getHours() + 1, 0, 0, 0);
      return t.getTime();
    })();
    return toLocalInput(at);
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const chosen = accounts.filter((a) => selected.includes(a.id));
  const platforms = [...new Set(chosen.map((a) => a.provider))];
  const counts = platforms.map((p) => ({ p, n: countChars(p, content), max: CHAR_LIMITS[p] }));
  const tooLong = counts.some((c) => c.n > c.max);
  const maxMedia = Math.min(...platforms.map((p) => providers.find((x) => x.id === p)?.maxMedia ?? 4), 10);
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function upload(files: FileList | null) {
    if (!files) return;
    setError("");
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      setBusy("upload");
      try {
        const { media: m } = await request<{ media: Media }>("/api/media", { method: "POST", body });
        setMedia((cur) => [...cur, m]);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function runAi(instruction: string) {
    if (!instruction.trim()) return;
    setBusy("ai");
    setError("");
    try {
      const { text } = await request<{ text: string }>("/api/ai/assist", {
        method: "POST",
        body: { instruction, content, platforms },
      });
      setContent(text);
      setAiPrompt("");
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  }

  async function save(mode: "draft" | "schedule" | "now") {
    setBusy(mode);
    setError("");
    const body = {
      content,
      accountIds: selected,
      mediaIds: media.map((m) => m.id),
      mode,
      scheduledAt: mode === "schedule" ? new Date(when).getTime() : null,
    };
    try {
      await request(post ? `/api/posts/${post.id}` : "/api/posts", { method: post ? "PATCH" : "POST", body });
      onSaved(
        mode === "draft"
          ? "Draft saved"
          : mode === "now"
            ? "Publishing now — status will update in a few seconds"
            : `Scheduled for ${new Date(when).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`,
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function remove() {
    if (!post || !confirm("Delete this post? This can't be undone.")) return;
    setBusy("delete");
    try {
      await request(`/api/posts/${post.id}`, { method: "DELETE" });
      onSaved("Post deleted");
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  const previewAccount = chosen[0];
  const QUICK = useMemo(
    () => ["Make it punchier", "Shorten to fit every platform", "Add 2–3 relevant hashtags", "Fix grammar", "Write a hook-first version"],
    [],
  );

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">{post ? (locked ? "Post details" : "Edit post") : "Create post"}</h2>
          {post && <StatusPill status={post.status} />}
        </div>
        <button className="text-ink/60 hover:text-white" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5 p-5">
          {/* Accounts */}
          <div>
            <div className="label">Publish to</div>
            {accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ink/20 p-4 text-sm text-ink/60">
                No accounts connected yet.{" "}
                <button className="text-goblin-800 hover:underline" onClick={onGoToAccounts}>
                  Connect one
                </button>{" "}
                — you can still save drafts.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      disabled={!!locked}
                      onClick={() => toggle(a.id)}
                      title={`${a.providerName} · ${a.name}${a.status !== "active" ? " (needs attention)" : ""}`}
                      className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition ${
                        on ? "border-goblin-500/60 bg-goblin-500/10" : "border-ink/15 opacity-50 grayscale hover:opacity-80"
                      }`}
                    >
                      <Avatar account={a} size={26} />
                      <span className="max-w-[140px] truncate">{a.name}</span>
                      {a.status !== "active" && <span className="text-amber-700">!</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Content */}
          <div>
            <div className="label">Content</div>
            <textarea
              className="input min-h-[180px] resize-y leading-relaxed"
              value={content}
              disabled={!!locked}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What do you want to share?"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {counts.map(({ p, n, max }) => (
                <span key={p} className={`flex items-center gap-1.5 text-xs ${n > max ? "text-red-700" : "text-ink/60"}`}>
                  <ProviderIcon provider={p} size={14} />
                  {n}/{max}
                </span>
              ))}
            </div>
          </div>

          {/* AI assist */}
          {!locked && aiEnabled && (
            <div className="rounded-lg border border-goblin-500/20 bg-goblin-500/[0.04] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-goblin-800">✨ AI assist</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    disabled={!!busy}
                    onClick={() => runAi(q)}
                    className="rounded-full border border-ink/15 px-2.5 py-1 text-xs text-ink/80 hover:bg-goblin-100"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  runAi(aiPrompt);
                }}
              >
                <input
                  className="input"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={content ? "e.g. Make it sound more excited" : "e.g. Announce our spring sale, 20% off"}
                />
                <button className="btn-ghost shrink-0" disabled={!!busy || !aiPrompt.trim()}>
                  {busy === "ai" ? "Writing…" : content ? "Rewrite" : "Generate"}
                </button>
              </form>
            </div>
          )}

          {/* Media */}
          <div>
            <div className="label">Media</div>
            <div className="flex flex-wrap gap-2">
              {media.map((m) => (
                <div key={m.id} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-ink/15">
                  {m.mime.startsWith("video/") ? (
                    <video src={m.url} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
                  )}
                  {!locked && (
                    <button
                      onClick={() => setMedia((cur) => cur.filter((x) => x.id !== m.id))}
                      className="absolute top-1 right-1 hidden h-5 w-5 place-items-center rounded-full bg-black/80 text-xs group-hover:grid"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {!locked && media.length < maxMedia && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy === "upload"}
                  className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-ink/20 text-xs text-ink/60 hover:border-ink/30"
                >
                  {busy === "upload" ? "…" : "+ Add"}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                hidden
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4"
                onChange={(e) => upload(e.target.files)}
              />
            </div>
          </div>

          {/* Delivery results */}
          {post && post.targets.some((t) => t.status !== "pending") && (
            <div>
              <div className="label">Delivery</div>
              <ul className="space-y-1.5">
                {post.targets.map((t) => (
                  <li key={t.accountId} className="flex items-start gap-2 text-sm">
                    <ProviderIcon provider={t.provider} size={16} />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink/80">{t.accountName}</span> <StatusPill status={t.status} />
                      {t.remoteUrl && (
                        <a className="ml-2 text-goblin-800 hover:underline" href={t.remoteUrl} target="_blank" rel="noreferrer">
                          View ↗
                        </a>
                      )}
                      {t.error && <div className="mt-0.5 text-xs break-words text-red-700">{t.error}</div>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right rail: schedule + preview */}
        <div className="space-y-5 border-t border-ink/10 p-5 lg:border-t-0 lg:border-l">
          {!locked && (
            <div>
              <label className="label" htmlFor="when">Schedule for</label>
              <input id="when" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
              <p className="mt-1 text-xs text-ink/50">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
            </div>
          )}

          <div>
            <div className="label">Preview</div>
            <div className="rounded-xl border border-ink/15 bg-white p-4">
              <div className="mb-3 flex items-center gap-2.5">
                {previewAccount ? (
                  <Avatar account={previewAccount} size={36} />
                ) : (
                  <span className="h-9 w-9 rounded-full bg-ink/10" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{previewAccount?.name ?? "Your account"}</div>
                  <div className="truncate text-xs text-ink/50">
                    {previewAccount ? (previewAccount.username ?? providerName(previewAccount.provider)) : "Pick an account"}
                  </div>
                </div>
              </div>
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
                {content || <span className="text-ink/40">Your post will appear here…</span>}
              </p>
              {media.length > 0 && (
                <div className={`mt-3 grid gap-1 ${media.length > 1 ? "grid-cols-2" : ""}`}>
                  {media.slice(0, 4).map((m) =>
                    m.mime.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={m.id} src={m.url} alt="" className="aspect-video w-full rounded-lg object-cover" />
                    ) : (
                      <video key={m.id} src={m.url} className="aspect-video w-full rounded-lg object-cover" muted />
                    ),
                  )}
                </div>
              )}
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm break-words text-red-700">{error}</p>}
          {tooLong && !error && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              Too long for {counts.filter((c) => c.n > c.max).map((c) => providerName(c.p)).join(", ")}. Shorten it or
              deselect those accounts.
            </p>
          )}

          {!locked && (
            <div className="space-y-2">
              <button
                className="btn-primary w-full"
                disabled={!!busy || tooLong || !selected.length || (!content.trim() && !media.length)}
                onClick={() => save("schedule")}
              >
                {busy === "schedule" ? "Scheduling…" : post?.status === "scheduled" ? "Update schedule" : "Schedule"}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-ghost"
                  disabled={!!busy || tooLong || !selected.length || (!content.trim() && !media.length)}
                  onClick={() => confirm("Publish to the selected accounts right now?") && save("now")}
                >
                  {busy === "now" ? "Posting…" : "Post now"}
                </button>
                <button className="btn-ghost" disabled={!!busy || (!content.trim() && !media.length)} onClick={() => save("draft")}>
                  {busy === "draft" ? "Saving…" : "Save draft"}
                </button>
              </div>
            </div>
          )}
          {post && post.status !== "publishing" && (
            <button className="btn-danger w-full" disabled={!!busy} onClick={remove}>
              Delete post
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
