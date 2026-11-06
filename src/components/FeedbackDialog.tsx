"use client";

import { useEffect, useState } from "react";
import { Modal, request } from "./ui";

export type FeedbackMode = "feedback" | "review";

/** Lets a user send an idea / bug report, or rate PostGoblins (one rating each, editable). */
export default function FeedbackDialog({
  mode: initialMode,
  page,
  onClose,
  onSent,
}: {
  mode: FeedbackMode;
  page?: string;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [kind, setKind] = useState<"idea" | "bug" | "other">("idea");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [allowQuote, setAllowQuote] = useState(false);
  const [hadReview, setHadReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill an existing rating so it can be updated.
  useEffect(() => {
    request<{ review: { rating: number; comment: string | null; allowQuote: boolean } | null }>("/api/reviews/me")
      .then(({ review }) => {
        if (!review) return;
        setHadReview(true);
        setRating(review.rating);
        setComment(review.comment ?? "");
        setAllowQuote(review.allowQuote);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "feedback") {
        await request("/api/feedback", { method: "POST", body: { kind, message, page } });
        onSent("Thanks! Your feedback went straight to the PostGoblins team.");
      } else {
        await request("/api/reviews/me", { method: "PUT", body: { rating, comment, allowQuote } });
        onSent(hadReview ? "Rating updated. Thank you!" : "Thanks for rating PostGoblins!");
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const shown = hover || rating;
  const LABELS = ["", "Poor", "Fair", "Good", "Great", "Love it"];

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 pt-3">
          <div className="flex gap-1">
            {(["feedback", "review"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  mode === m ? "border-goblin-500 font-semibold text-ink" : "border-transparent text-ink/60 hover:text-ink"
                }`}
              >
                {m === "feedback" ? "Send feedback" : "Rate PostGoblins"}
              </button>
            ))}
          </div>
          <button type="button" className="text-ink/60 hover:text-ink" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="space-y-4 p-5">
          {mode === "feedback" ? (
            <>
              <fieldset>
                <legend className="label">What's it about?</legend>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["idea", "💡 Idea"],
                    ["bug", "🐛 Something's broken"],
                    ["other", "💬 Other"],
                  ] as const).map(([k, label]) => (
                    <label
                      key={k}
                      className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                        kind === k ? "border-goblin-500 bg-goblin-100 text-ink" : "border-ink/15 text-ink/70 hover:border-ink/30"
                      }`}
                    >
                      <input type="radio" name="kind" value={k} className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="label" htmlFor="fb-message">Message</label>
                <textarea
                  id="fb-message"
                  className="input min-h-[120px]"
                  maxLength={4000}
                  placeholder={kind === "bug" ? "What happened, and what did you expect?" : "Tell us what you'd like to see"}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  autoFocus
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="label" id="rating-label">How do you like PostGoblins?</div>
                <div className="flex items-center gap-3" role="radiogroup" aria-labelledby="rating-label" onMouseLeave={() => setHover(0)}>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        className={`px-0.5 text-3xl leading-none transition ${n <= shown ? "text-amber-500" : "text-ink/20 hover:text-ink/35"}`}
                        onMouseEnter={() => setHover(n)}
                        onClick={() => setRating(n)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <span className="text-sm text-ink/60">{LABELS[shown]}</span>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="rv-comment">Anything to add? (optional)</label>
                <textarea
                  id="rv-comment"
                  className="input min-h-[90px]"
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-ink/75">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-goblin-600" checked={allowQuote} onChange={(e) => setAllowQuote(e.target.checked)} />
                PostGoblins may quote this review (with my first name) on its website
              </label>
            </>
          )}

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              disabled={busy || (mode === "feedback" ? !message.trim() : rating === 0)}
            >
              {busy ? "Sending…" : mode === "feedback" ? "Send" : hadReview ? "Update rating" : "Submit rating"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
