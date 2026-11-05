"use client";

import { useMemo, useRef, useState } from "react";
import { CHAR_LIMITS, countChars } from "@/lib/limits";
import {
  YOUTUBE_TAGS_MAX_CHARS,
  YOUTUBE_TITLE_MAX,
  defaultYouTubeTitle,
  COMMENT_LIMITS,
  THREAD_PLATFORMS,
  parseTags,
  partsFor,
  supportsComments,
  textFor,
  type PlatformId,
  type YouTubeOptions,
  type YouTubePrivacy,
} from "@/lib/postOptions";
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
  directUploads,
  userId,
  onClose,
  onSaved,
  onGoToAccounts,
}: {
  seed: ComposerSeed;
  accounts: AccountView[];
  providers: ProviderInfo[];
  aiEnabled: boolean;
  directUploads: boolean;
  userId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  onGoToAccounts: () => void;
}) {
  const post = seed.post;
  const locked = post && ["publishing", "published", "partial"].includes(post.status);
  const [content, setContent] = useState(post?.content ?? "");
  /** Per-platform versions of the text. Missing = uses the main text. */
  const [texts, setTexts] = useState<Record<string, string>>(post?.options?.text ?? {});
  const [tab, setTab] = useState<string>("all");
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
  const [progress, setProgress] = useState<number | null>(null);
  const [yt, setYt] = useState<YouTubeOptions>(post?.options?.youtube ?? {});
  const [ytTags, setYtTags] = useState((post?.options?.youtube?.tags ?? []).join(", "));
  const [thumb, setThumb] = useState<Media | null>(post?.thumbnail ?? null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [firstComment, setFirstComment] = useState(post?.options?.firstComment ?? "");
  const [showComment, setShowComment] = useState(!!post?.options?.firstComment);

  const chosen = accounts.filter((a) => selected.includes(a.id));
  const platforms = [...new Set(chosen.map((a) => a.provider))];
  const activeTab = platforms.includes(tab as never) ? tab : "all";
  const customized = (p: string) => texts[p] !== undefined && texts[p].trim() !== "";
  /** What each platform will actually get. */
  const effectiveText = (p: string) => (customized(p) ? texts[p] : content);
  const counts = platforms.map((p) => {
    const parts = partsFor(p, effectiveText(p));
    const n = Math.max(0, ...parts.map((part) => countChars(p, part)));
    return { p, n, max: CHAR_LIMITS[p], custom: customized(p), parts: parts.length };
  });
  const threadPlatforms = platforms.filter((p) => THREAD_PLATFORMS.includes(p as PlatformId));
  const commentPlatforms = platforms.filter(supportsComments);
  const commentCounts = firstComment.trim()
    ? commentPlatforms.map((p) => ({ p, n: countChars(p, firstComment.trim()), max: COMMENT_LIMITS[p as PlatformId] ?? CHAR_LIMITS[p] }))
    : [];
  const commentTooLong = commentCounts.filter((c) => c.n > c.max);
  const editorValue = activeTab === "all" ? content : (texts[activeTab] ?? content);
  const setEditorValue = (v: string) =>
    activeTab === "all" ? setContent(v) : setTexts((cur) => ({ ...cur, [activeTab]: v }));
  function insertThreadBreak() {
    const el = editorRef.current;
    const value = editorValue;
    const at = el ? el.selectionStart : value.length;
    const before = value.slice(0, at).replace(/\s+$/, "");
    const after = value.slice(at).replace(/^\s+/, "");
    const next = `${before}\n\n---\n\n${after}`;
    setEditorValue(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length + 7;
      el?.setSelectionRange(pos, pos);
    });
  }
  const resetTab = (p: string) =>
    setTexts((cur) => {
      const next = { ...cur };
      delete next[p];
      return next;
    });
  const hasText = !!content.trim() || platforms.some(customized);
  const tooLong = counts.some((c) => c.n > c.max) || commentTooLong.length > 0;
  // The most restrictive limit among selected platforms (10 when none are selected).
  const maxMedia = Math.min(10, ...platforms.map((p) => providers.find((x) => x.id === p)?.maxMedia ?? 10));
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  // Platform media rules: Instagram needs media; YouTube and TikTok need exactly one video.
  const videos = media.filter((m) => m.mime.startsWith("video/")).length;
  const mediaProblems = platforms.flatMap((p) => {
    const info = providers.find((x) => x.id === p);
    if (!info) return [];
    if (info.requiresMedia === "any" && media.length === 0) return [`${info.name} needs a photo or video`];
    if (info.requiresMedia === "video" && !(media.length === 1 && videos === 1)) return [`${info.name} needs exactly one video`];
    if (media.length > info.maxMedia) return [`${info.name} allows at most ${info.maxMedia} file${info.maxMedia > 1 ? "s" : ""}`];
    return [];
  });
  const hasYouTube = platforms.includes("youtube");
  const tagsTooLong = parseTags(ytTags).join(",").length > YOUTUBE_TAGS_MAX_CHARS;
  const ytProblems = !hasYouTube
    ? []
    : [
        ...(typeof yt.madeForKids !== "boolean" ? ["YouTube: choose whether the video is made for kids"] : []),
        ...(tagsTooLong ? [`YouTube tags must total ${YOUTUBE_TAGS_MAX_CHARS} characters or fewer`] : []),
      ];
  const blocked = tooLong || mediaProblems.length > 0 || ytProblems.length > 0;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /**
   * With Blob storage, files go straight from the browser to storage (needed
   * for video: serverless functions only accept ~4.5MB). Otherwise they're
   * posted to our own upload route.
   */
  async function uploadOne(file: File): Promise<Media> {
    if (directUploads) {
      const { upload: blobUpload } = await import("@vercel/blob/client");
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "upload";
      const blob = await blobUpload(`media/u/${userId}/${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/media/blob",
        contentType: file.type,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      const { media: m } = await request<{ media: Media }>("/api/media/register", {
        method: "POST",
        body: { url: blob.url, pathname: blob.pathname, name: file.name },
      });
      return m;
    }
    const body = new FormData();
    body.append("file", file);
    return (await request<{ media: Media }>("/api/media", { method: "POST", body })).media;
  }

  async function upload(files: FileList | null) {
    if (!files) return;
    setError("");
    setBusy("upload");
    for (const file of Array.from(files)) {
      setProgress(0);
      try {
        const m = await uploadOne(file);
        setMedia((cur) => [...cur, m]);
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
    }
    setBusy(null);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadThumbnail(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError("Thumbnail must be a JPG, PNG, WebP or GIF image");
    } else {
      setBusy("thumb");
      setProgress(0);
      try {
        setThumb(await uploadOne(file));
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
      setBusy(null);
      setProgress(null);
    }
    if (thumbRef.current) thumbRef.current.value = "";
  }

  async function runAi(instruction: string) {
    if (!instruction.trim()) return;
    setBusy("ai");
    setError("");
    try {
      const { text } = await request<{ text: string }>("/api/ai/assist", {
        method: "POST",
        body: { instruction, content: editorValue, platforms: activeTab === "all" ? platforms : [activeTab] },
      });
      setEditorValue(text);
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
      options: {
        ...post?.options,
        text: Object.fromEntries(platforms.filter(customized).map((p) => [p, texts[p]])),
        firstComment: firstComment.trim() || undefined,
        youtube: { ...yt, tags: parseTags(ytTags), thumbnailId: thumb?.id } },
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

  const previewAccount = (activeTab !== "all" && chosen.find((a) => a.provider === activeTab)) || chosen[0];
  const previewText = previewAccount ? effectiveText(previewAccount.provider) : content;
  const previewParts = previewAccount ? partsFor(previewAccount.provider, previewText) : [previewText];
  const previewComment = previewAccount && supportsComments(previewAccount.provider) ? firstComment.trim() : "";
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
            {platforms.length > 1 || platforms.some(customized) ? (
              <div className="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Text for each platform">
                {["all", ...platforms].map((p) => {
                  const on = activeTab === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setTab(p)}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        on ? "border-goblin-500/60 bg-goblin-500/10 font-semibold text-ink" : "border-ink/15 text-ink/60 hover:text-ink"
                      }`}
                    >
                      {p === "all" ? "All platforms" : <ProviderIcon provider={p} size={14} />}
                      {p !== "all" && <span>{providerName(p)}</span>}
                      {p !== "all" && customized(p) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-goblin-500" title="Has its own text" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <textarea
              ref={editorRef}
              className="input min-h-[180px] resize-y leading-relaxed"
              value={editorValue}
              disabled={!!locked}
              onChange={(e) => setEditorValue(e.target.value)}
              placeholder={activeTab === "all" ? "What do you want to share?" : `Text for ${providerName(activeTab)}…`}
              aria-label={activeTab === "all" ? "Main text" : `Text for ${providerName(activeTab)}`}
            />
            {activeTab !== "all" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink/60">
                {customized(activeTab) ? (
                  <>
                    <span>{providerName(activeTab)} gets its own text.</span>
                    {!locked && (
                      <button type="button" className="text-goblin-800 hover:underline" onClick={() => resetTab(activeTab)}>
                        Use the main text instead
                      </button>
                    )}
                  </>
                ) : (
                  <span>
                    Using the main text. Edit it here to give {providerName(activeTab)} its own version; other platforms won’t
                    change.
                  </span>
                )}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {counts.map(({ p, n, max, custom, parts }) => (
                <span
                  key={p}
                  title={`${custom ? `${providerName(p)} has its own text` : `${providerName(p)} uses the main text`}${
                    parts > 1 ? `, posted as a ${parts}-part thread (longest part shown)` : ""
                  }`}
                  className={`flex items-center gap-1.5 text-xs ${n > max ? "text-red-700" : "text-ink/60"}`}
                >
                  <ProviderIcon provider={p} size={14} />
                  {parts > 1 && <span>{parts} parts ·</span>}
                  {n}/{max}
                  {custom && <span className="text-goblin-800">·&nbsp;own</span>}
                </span>
              ))}
              {!locked && threadPlatforms.length > 0 && (
                <button
                  type="button"
                  onClick={insertThreadBreak}
                  className="ml-auto rounded-full border border-ink/15 px-2.5 py-0.5 text-xs text-ink/70 hover:border-ink/30 hover:text-ink"
                  title="Insert a --- line: everything after it becomes the next post in the thread"
                >
                  + Thread break
                </button>
              )}
            </div>
            {threadPlatforms.length > 0 && /^[ \t]*-{3,}[ \t]*$/m.test(editorValue) && (
              <p className="mt-1.5 text-xs text-ink/50">
                Lines with only <code>---</code> split this into a thread on{" "}
                {threadPlatforms.map(providerName).join(", ")}
                {platforms.length > threadPlatforms.length ? "; other platforms get it as one post" : ""}.
              </p>
            )}
          </div>

          {/* First comment */}
          {commentPlatforms.length > 0 && (showComment || !locked) && (
            <div>
              {!showComment ? (
                <button type="button" className="text-sm text-goblin-800 hover:underline" onClick={() => setShowComment(true)}>
                  + Add a first comment
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <label className="label" htmlFor="first-comment">First comment</label>
                    {!locked && (
                      <button
                        type="button"
                        className="text-xs text-ink/50 hover:text-ink"
                        onClick={() => {
                          setFirstComment("");
                          setShowComment(false);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <textarea
                    id="first-comment"
                    className="input min-h-[72px] resize-y leading-relaxed"
                    value={firstComment}
                    disabled={!!locked}
                    onChange={(e) => setFirstComment(e.target.value)}
                    placeholder="e.g. Link in the comments: https://…"
                  />
                  <p className="mt-1 text-xs text-ink/50">
                    Posted right after the post on {commentPlatforms.map(providerName).join(", ")}
                    {threadPlatforms.length > 0 ? " (after the last part of a thread)" : ""}.
                    {platforms.length > commentPlatforms.length &&
                      ` Not supported on ${platforms.filter((p) => !supportsComments(p)).map(providerName).join(", ")}.`}
                  </p>
                  {commentCounts.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-3">
                      {commentCounts.map(({ p, n, max }) => (
                        <span key={p} className={`flex items-center gap-1.5 text-xs ${n > max ? "text-red-700" : "text-ink/60"}`}>
                          <ProviderIcon provider={p} size={14} />
                          {n}/{max}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* AI assist */}
          {!locked && aiEnabled && (
            <div className="rounded-lg border border-goblin-500/20 bg-goblin-500/[0.04] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-goblin-800">✨ AI assist</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(activeTab === "all" ? QUICK : [`Adapt this for ${providerName(activeTab)}`, ...QUICK.filter((q) => !q.startsWith("Shorten"))]).map((q) => (
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
                  {busy === "upload" ? (progress !== null && progress > 0 ? `${progress}%` : "…") : "+ Add"}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                hidden
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime"
                onChange={(e) => upload(e.target.files)}
              />
            </div>
          </div>

          {/* YouTube settings */}
          {hasYouTube && (
            <fieldset disabled={!!locked} className="space-y-3 rounded-xl border border-ink/15 p-4">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                <ProviderIcon provider="youtube" size={16} /> YouTube settings
              </legend>
              <div>
                <label className="label" htmlFor="yt-title">Title</label>
                <input
                  id="yt-title"
                  className="input"
                  maxLength={YOUTUBE_TITLE_MAX}
                  value={yt.title ?? ""}
                  placeholder={defaultYouTubeTitle(effectiveText("youtube"))}
                  onChange={(e) => setYt({ ...yt, title: e.target.value.replace(/[<>]/g, "") })}
                />
                <p className="mt-1 text-xs text-ink/50">
                  {(yt.title ?? "").length}/{YOUTUBE_TITLE_MAX}. Leave empty to use the first line of the post. The full post
                  text becomes the description.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="yt-privacy">Visibility</label>
                  <select
                    id="yt-privacy"
                    className="input"
                    value={yt.privacy ?? "public"}
                    onChange={(e) => setYt({ ...yt, privacy: e.target.value as YouTubePrivacy })}
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div>
                  <span className="label">Made for kids? <span className="text-red-700">*</span></span>
                  <div className="flex gap-2" role="radiogroup" aria-label="Made for kids">
                    {[
                      [false, "No"],
                      [true, "Yes"],
                    ].map(([value, label]) => (
                      <label
                        key={String(value)}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          yt.madeForKids === value ? "border-goblin-600 bg-goblin-600/10 font-semibold" : "border-ink/15"
                        }`}
                      >
                        <input
                          type="radio"
                          name="yt-kids"
                          className="sr-only"
                          checked={yt.madeForKids === value}
                          onChange={() => setYt({ ...yt, madeForKids: value as boolean })}
                        />
                        {label as string}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-ink/50">
                US law (COPPA) requires saying whether a video is made for kids. Made-for-kids videos have comments and some
                features turned off.
              </p>
              <div>
                <label className="label" htmlFor="yt-tags">Tags</label>
                <input
                  id="yt-tags"
                  className="input"
                  value={ytTags}
                  placeholder="cooking, recipes, quick dinner"
                  onChange={(e) => setYtTags(e.target.value)}
                />
                <p className={`mt-1 text-xs ${tagsTooLong ? "text-red-700" : "text-ink/50"}`}>
                  Separate with commas. {parseTags(ytTags).join(",").length}/{YOUTUBE_TAGS_MAX_CHARS} characters.
                </p>
              </div>
              <div>
                <span className="label">Thumbnail</span>
                <div className="flex items-start gap-3">
                  {thumb ? (
                    <div className="group relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg border border-ink/15">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb.url} alt="Video thumbnail" className="h-full w-full object-cover" />
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => setThumb(null)}
                          className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-black/80 text-xs text-white"
                          aria-label="Remove thumbnail"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => thumbRef.current?.click()}
                      disabled={busy === "thumb"}
                      className="grid aspect-video w-40 shrink-0 place-items-center rounded-lg border border-dashed border-ink/20 text-xs text-ink/60 hover:border-ink/30"
                    >
                      {busy === "thumb" ? (progress ? `${progress}%` : "Uploading…") : "+ Add thumbnail"}
                    </button>
                  )}
                  <div className="space-y-2 text-xs text-ink/50">
                    <p>Optional. 1280×720 (16:9) works best. We resize and convert it to fit YouTube’s 2 MB limit.</p>
                    <p>Custom thumbnails only work on verified channels (youtube.com/verify).</p>
                    {thumb && !locked && (
                      <button type="button" className="text-goblin-800 hover:underline" onClick={() => thumbRef.current?.click()}>
                        Replace
                      </button>
                    )}
                  </div>
                  <input
                    ref={thumbRef}
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => uploadThumbnail(e.target.files?.[0])}
                  />
                </div>
              </div>
            </fieldset>
          )}

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
                      {t.error && (
                        <div className={`mt-0.5 text-xs break-words ${t.status === "published" ? "text-amber-700" : "text-red-700"}`}>
                          {t.error}
                        </div>
                      )}
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
            <div className="rounded-xl border border-ink/15 bg-surface p-4">
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
                {previewParts[0] || <span className="text-ink/40">Your post will appear here…</span>}
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
              {[...previewParts.slice(1), ...(previewComment ? [previewComment] : [])].map((part, i, all) => (
                <div key={i} className="mt-3 border-l-2 border-ink/15 pl-3">
                  <div className="mb-0.5 text-[11px] text-ink/45">
                    {previewComment && i === all.length - 1
                      ? "First comment"
                      : `${i + 2}/${previewParts.length}`}
                  </div>
                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">{part}</p>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm break-words text-red-700">{error}</p>}
          {tooLong && !error && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              {counts.some((c) => c.n > c.max) &&
                `Too long for ${counts
                  .filter((c) => c.n > c.max)
                  .map((c) => providerName(c.p) + (c.parts > 1 ? " (a thread part)" : ""))
                  .join(", ")}. `}
              {commentTooLong.length > 0 && `First comment is too long for ${commentTooLong.map((c) => providerName(c.p)).join(", ")}. `}
              Shorten it, add a thread break, or deselect those accounts.
            </p>
          )}
          {!locked && mediaProblems.length > 0 && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              {mediaProblems.join(". ")}. Adjust the media or deselect those accounts.
            </p>
          )}
          {!locked && ytProblems.length > 0 && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{ytProblems.join(". ")}.</p>
          )}

          {!locked && (
            <div className="space-y-2">
              <button
                className="btn-primary w-full"
                disabled={!!busy || blocked || !selected.length || (!hasText && !media.length)}
                onClick={() => save("schedule")}
              >
                {busy === "schedule" ? "Scheduling…" : post?.status === "scheduled" ? "Update schedule" : "Schedule"}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-ghost"
                  disabled={!!busy || blocked || !selected.length || (!hasText && !media.length)}
                  onClick={() => confirm("Publish to the selected accounts right now?") && save("now")}
                >
                  {busy === "now" ? "Posting…" : "Post now"}
                </button>
                <button className="btn-ghost" disabled={!!busy || (!hasText && !media.length)} onClick={() => save("draft")}>
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
