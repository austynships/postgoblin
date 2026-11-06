"use client";

import { useState } from "react";
import { Logo, ProviderIcon } from "./ui";

export type ReviewData = {
  token: string;
  ownerName: string;
  open: boolean;
  status: "pending" | "approved" | "changes_requested" | "cancelled";
  reviewerName: string | null;
  note: string | null;
  decidedAt: number | null;
  scheduledAt: number | null;
  media: { url: string; mime: string }[];
  youtubeTitle: string | null;
  thumbnail: string | null;
  versions: {
    parts: string[];
    comment: string;
    accounts: { provider: string; platform: string; name: string }[];
  }[];
};

const fmt = (ms: number) =>
  new Date(ms).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Public page where a client or teammate approves a post or asks for changes. */
export default function Review({ data }: { data: ReviewData }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "changes" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ approved: boolean; scheduledAt: number | null } | null>(null);

  async function decide(decision: "approve" | "changes") {
    if (decision === "changes" && !note.trim()) {
      setError("Add a note saying what should change.");
      return;
    }
    setBusy(decision);
    setError("");
    try {
      const res = await fetch(`/api/review/${data.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, name, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      setDone({ approved: decision === "approve", scheduledAt: body.scheduledAt ?? null });
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  }

  const by = data.reviewerName ? ` by ${data.reviewerName}` : "";
  const when = data.decidedAt ? ` on ${fmt(data.decidedAt)}` : "";
  const closedMessage =
    data.status === "approved"
      ? `Approved${by}${when}.`
      : data.status === "changes_requested"
        ? `Changes requested${by}${when}.`
        : "This review link is closed. The post was changed or withdrawn after it was sent.";

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <Logo height={34} />
        <h1 className="font-display mt-6 text-3xl">Review this post</h1>
        <p className="mt-1 text-sm text-ink/60">
          {data.ownerName} asked you to check this post before it goes live.{" "}
          {data.scheduledAt
            ? `It's planned for ${fmt(data.scheduledAt)} (your time).`
            : "It publishes as soon as it's approved."}
        </p>

        <div className="mt-6 space-y-4">
          {data.versions.map((v, i) => (
            <div key={i} className="card p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {v.accounts.map((a, j) => (
                  <span key={j} className="flex items-center gap-1.5 rounded-full border border-ink/15 py-0.5 pr-2.5 pl-1 text-xs">
                    <ProviderIcon provider={a.provider} size={16} />
                    <span className="max-w-[200px] truncate">
                      {a.platform} · {a.name}
                    </span>
                  </span>
                ))}
              </div>
              {data.youtubeTitle && v.accounts.some((a) => a.provider === "youtube") && (
                <p className="mb-2 text-sm font-semibold text-ink">{data.youtubeTitle}</p>
              )}
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
                {v.parts[0] || <span className="text-ink/40">(no text)</span>}
              </p>
              {data.media.length > 0 && (
                <div className={`mt-3 grid gap-1 ${data.media.length > 1 ? "grid-cols-2" : ""}`}>
                  {data.media.map((m, j) =>
                    m.mime.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={j} src={m.url} alt="" className="w-full rounded-lg object-cover" />
                    ) : (
                      <video key={j} src={m.url} controls className="w-full rounded-lg" />
                    ),
                  )}
                </div>
              )}
              {[...v.parts.slice(1), ...(v.comment ? [v.comment] : [])].map((part, j, all) => (
                <div key={j} className="mt-3 border-l-2 border-ink/15 pl-3">
                  <div className="mb-0.5 text-[11px] text-ink/45">
                    {v.comment && j === all.length - 1 ? "First comment" : `${j + 2}/${v.parts.length}`}
                  </div>
                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">{part}</p>
                </div>
              ))}
            </div>
          ))}
          {data.thumbnail && (
            <div className="card p-4">
              <div className="label">YouTube thumbnail</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.thumbnail} alt="" className="aspect-video w-full rounded-lg object-cover" />
            </div>
          )}
        </div>

        <div className="card mt-6 p-5">
          {done ? (
            <div role="status">
              <h2 className="font-semibold">{done.approved ? "Approved, thanks!" : "Sent back with your notes"}</h2>
              <p className="mt-1 text-sm text-ink/60">
                {done.approved
                  ? done.scheduledAt && done.scheduledAt > Date.now() + 60_000
                    ? `It will publish ${fmt(done.scheduledAt)}.`
                    : "It's publishing now."
                  : `${data.ownerName} will see your notes and update the post.`}
              </p>
            </div>
          ) : !data.open ? (
            <div>
              <h2 className="font-semibold">Nothing to do here</h2>
              <p className="mt-1 text-sm text-ink/60">{closedMessage}</p>
              {data.status === "changes_requested" && data.note && (
                <p className="mt-2 text-sm break-words whitespace-pre-wrap text-ink/80">“{data.note}”</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="rv-name">Your name (optional)</label>
                <input id="rv-name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="rv-note">Notes</label>
                <textarea
                  id="rv-note"
                  className="input min-h-[90px]"
                  maxLength={2000}
                  placeholder="Needed when you request changes, optional when you approve"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm break-words text-red-700">{error}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button className="btn-primary flex-1" disabled={!!busy} onClick={() => decide("approve")}>
                  {busy === "approve" ? "Approving…" : "Approve"}
                </button>
                <button className="btn-ghost flex-1" disabled={!!busy} onClick={() => decide("changes")}>
                  {busy === "changes" ? "Sending…" : "Request changes"}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-ink/40">Sent with PostGoblins</p>
      </div>
    </div>
  );
}
