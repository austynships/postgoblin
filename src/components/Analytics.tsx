"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalyticsView } from "@/lib/analytics";
import { ProviderIcon, request, type ProviderInfo } from "./ui";

const RANGES = [7, 30, 90] as const;

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat();
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : compact.format(n));

function ago(ms: number) {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, opts);

export default function Analytics({ providers, onCompose }: { providers: ProviderInfo[]; onCompose: () => void }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<AnalyticsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showTable, setShowTable] = useState(false);
  const name = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  const load = useCallback(async () => {
    try {
      setData(await request<AnalyticsView>(`/api/analytics?days=${days}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await request("/api/analytics/refresh", { method: "POST" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const hasPosts = !!data && data.platforms.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Analytics</h1>
          <p className="text-sm text-ink/60">
            Posts published from PostGoblins.{" "}
            {data?.lastUpdated ? `Numbers updated ${ago(data.lastUpdated)}.` : "Numbers refresh about every hour."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink/15 p-0.5" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                aria-pressed={days === r}
                className={`rounded-md px-3 py-1 text-sm ${days === r ? "bg-goblin-100 font-semibold text-ink" : "text-ink/60 hover:text-ink"}`}
              >
                {r} days
              </button>
            ))}
          </div>
          <button className="btn-ghost" onClick={refresh} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!data ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : !hasPosts ? (
        <div className="card p-10 text-center">
          <p className="mb-1 font-semibold">Nothing published in the last {days} days</p>
          <p className="mb-4 text-sm text-ink/60">Once your posts go out, likes, comments, shares and views show up here.</p>
          <button className="btn-primary" onClick={onCompose}>
            Create a post
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Posts published" value={data.totals.posts + data.untrackedPosts} hint="Counted once per platform" />
            <Stat label="Views" value={data.totals.views} hint="Where the platform reports them" />
            <Stat label="Likes" value={data.totals.likes} />
            <Stat label="Comments" value={data.totals.comments} />
            <Stat label="Shares" value={data.totals.shares} hint="Reposts, retweets, quotes" />
          </div>

          {data.pending > 0 && (
            <p className="rounded-lg bg-ink/[0.04] px-3 py-2 text-sm text-ink/70">
              {data.pending} post{data.pending > 1 ? "s are" : " is"} waiting for first numbers.{" "}
              <button className="text-goblin-800 hover:underline" onClick={refresh} disabled={busy}>
                Fetch now
              </button>
            </p>
          )}
          {data.errors.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              <p className="font-medium">Some numbers couldn’t be fetched:</p>
              <ul className="mt-1 list-disc pl-5">
                {data.errors.map((e) => (
                  <li key={`${e.provider}:${e.accountName}`} className="break-words">
                    {name(e.provider)} ({e.accountName}): {e.error}
                    {/\b(401|403)\b|permission|scope|expired|OAuth/i.test(e.error) && " — try reconnecting this account."}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Daily engagement */}
          <section className="card p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="font-semibold">Engagement by day posted</h2>
                <p className="text-xs text-ink/50">Likes + comments + shares, grouped by the day each post went out.</p>
              </div>
              <button className="text-xs text-ink/60 hover:text-ink" onClick={() => setShowTable((v) => !v)}>
                {showTable ? "Show chart" : "Show as table"}
              </button>
            </div>
            {showTable ? <DailyTable daily={data.daily} /> : <DailyChart daily={data.daily} />}
          </section>

          <div className="grid gap-5 xl:grid-cols-5">
            {/* Per platform */}
            <section className="card overflow-hidden xl:col-span-2">
              <h2 className="px-5 pt-5 pb-3 font-semibold">By platform</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-ink/50">
                    <tr className="border-b border-ink/10">
                      <th className="px-5 py-2 text-left font-medium">Platform</th>
                      <th className="px-2 py-2 text-right font-medium">Posts</th>
                      <th className="px-2 py-2 text-right font-medium">Views</th>
                      <th className="px-5 py-2 text-right font-medium">Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.platforms.map((p) => (
                      <tr key={p.provider} className="border-b border-ink/5 last:border-0">
                        <td className="px-5 py-2.5">
                          <span className="flex items-center gap-2">
                            <ProviderIcon provider={p.provider} size={16} />
                            {name(p.provider)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{p.posts}</td>
                        {p.tracked ? (
                          <>
                            <td className="px-2 py-2.5 text-right tabular-nums">{p.views ? fmt(p.views) : "—"}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums" title={`${full.format(p.likes)} likes · ${full.format(p.comments)} comments · ${full.format(p.shares)} shares`}>
                              {fmt(p.engagement)}
                            </td>
                          </>
                        ) : (
                          <td colSpan={2} className="px-5 py-2.5 text-right text-xs text-ink/45">
                            No stats from this platform
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Top posts */}
            <section className="card p-5 xl:col-span-3">
              <h2 className="mb-3 font-semibold">Top posts</h2>
              {data.top.length === 0 ? (
                <p className="text-sm text-ink/50">No numbers yet — they appear within an hour of posting.</p>
              ) : (
                <ol className="space-y-3">
                  {data.top.map((t, i) => (
                    <li key={t.targetId} className="flex gap-3">
                      <span className="w-5 shrink-0 pt-0.5 text-right text-sm text-ink/40 tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm break-words">{t.content || <span className="text-ink/40">(media only)</span>}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/55">
                          <span className="flex items-center gap-1">
                            <ProviderIcon provider={t.provider} size={13} />
                            {t.accountName}
                          </span>
                          <span>{new Date(t.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                          {t.views !== null && <span>{fmt(t.views)} views</span>}
                          <span>{fmt(t.likes)} likes</span>
                          <span>{fmt(t.comments)} comments</span>
                          {t.shares !== null && <span>{fmt(t.shares)} shares</span>}
                          {t.url && (
                            <a className="text-goblin-800 hover:underline" href={t.url} target="_blank" rel="noreferrer">
                              View ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {data.platforms.some((p) => !p.tracked) && (
            <p className="text-xs text-ink/45">
              LinkedIn, Discord, Telegram and TikTok don’t share post stats with apps like PostGoblins, so those posts are
              counted but have no numbers.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card p-4" title={hint}>
      <div className="text-xs text-ink/55">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" title={full.format(value)}>
        {fmt(value)}
      </div>
    </div>
  );
}

type Day = AnalyticsView["daily"][number];

/** Nice round axis maximum and three gridlines. */
function niceMax(v: number) {
  if (v <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 2.5, 5, 10].find((m) => m * p >= v)!;
  return n * p;
}

function DailyChart({ daily }: { daily: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...daily.map((d) => d.engagement)));
  const ticks = [max, max / 2, 0];
  const labelEvery = daily.length <= 7 ? 1 : daily.length <= 31 ? 7 : 15;
  const h = hover !== null ? daily[hover] : null;

  return (
    <div className="relative">
      <div className="flex h-48 gap-2">
        {/* Y axis */}
        <div className="flex w-8 shrink-0 flex-col justify-between pb-5 text-right text-[11px] text-ink/45 tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compact.format(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* Gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className={`border-t ${t === 0 ? "border-ink/25" : "border-ink/[0.07]"}`} />
            ))}
          </div>
          {/* Bars: full-height hit targets, 2px gaps, rounded data end on the baseline */}
          <div className="absolute inset-x-0 top-0 bottom-5 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
            {daily.map((d, i) => (
              <div
                key={d.day}
                className="flex h-full min-w-0 flex-1 cursor-default items-end"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${dayLabel(d.day, { month: "short", day: "numeric" })}: ${d.engagement} engagement from ${d.posts} posts`}
              >
                <div
                  className={`w-full rounded-t-[4px] bg-chart transition-opacity ${hover !== null && hover !== i ? "opacity-40" : ""}`}
                  style={{ height: d.engagement ? `max(2px, ${(d.engagement / max) * 100}%)` : 0 }}
                />
              </div>
            ))}
          </div>
          {/* X labels */}
          <div className="absolute inset-x-0 bottom-0 flex h-4 gap-[2px] text-[11px] text-ink/45">
            {daily.map((d, i) => (
              <div key={d.day} className="relative min-w-0 flex-1">
                {(i % labelEvery === 0 || i === daily.length - 1) && (daily.length - 1 - i >= labelEvery / 2 || i === daily.length - 1) && (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                    {dayLabel(d.day, { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            ))}
          </div>
          {/* Tooltip */}
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-xs shadow-lg"
              style={{ left: `${((hover + 0.5) / daily.length) * 100}%` }}
            >
              <div className="font-semibold">{dayLabel(h.day, { weekday: "short", month: "short", day: "numeric" })}</div>
              <div className="text-ink/70 tabular-nums">{full.format(h.engagement)} engagement</div>
              <div className="text-ink/50 tabular-nums">
                {h.posts} post{h.posts === 1 ? "" : "s"}
                {h.views ? ` · ${full.format(h.views)} views` : ""}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyTable({ daily }: { daily: Day[] }) {
  const rows = daily.filter((d) => d.posts > 0);
  if (!rows.length) return <p className="text-sm text-ink/50">No posts in this range.</p>;
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface text-xs text-ink/50">
          <tr className="border-b border-ink/10">
            <th className="py-2 text-left font-medium">Day</th>
            <th className="py-2 text-right font-medium">Posts</th>
            <th className="py-2 text-right font-medium">Views</th>
            <th className="py-2 text-right font-medium">Engagement</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((d) => (
            <tr key={d.day} className="border-b border-ink/5">
              <td className="py-1.5">{dayLabel(d.day, { weekday: "short", month: "short", day: "numeric" })}</td>
              <td className="py-1.5 text-right tabular-nums">{d.posts}</td>
              <td className="py-1.5 text-right tabular-nums">{d.views ? full.format(d.views) : "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{full.format(d.engagement)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
