"use client";

import { useEffect, useRef, useState } from "react";
import { GoblinIcon, request } from "./ui";

type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "action"; summary: string; ok: boolean };
type Conversation = { id: string; title: string; updatedAt: number };

const STARTERS = [
  "Plan a week of posts announcing our new product, one per weekday at good times",
  "What do I have scheduled for the next 7 days?",
  "Turn this into a short thread for Bluesky and a longer LinkedIn post: …",
  "Find any failed posts, tell me why, and retry the ones that can be fixed",
];

/** Minimal markdown: **bold**, `code`, bullet lists and line breaks. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") ? (
        <code key={i} className="rounded bg-goblin-100 px-1 text-[0.9em]">{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)/);
        const num = line.match(/^\s*(\d+)[.)]\s+(.*)/);
        if (bullet) return <div key={i} className="flex gap-2 pl-1"><span className="text-ink/50">•</span><span>{inline(bullet[1])}</span></div>;
        if (num) return <div key={i} className="flex gap-2 pl-1"><span className="text-ink/50">{num[1]}.</span><span>{inline(num[2])}</span></div>;
        if (/^#{1,4}\s/.test(line)) return <div key={i} className="pt-1 font-semibold">{inline(line.replace(/^#+\s/, ""))}</div>;
        return line.trim() ? <p key={i}>{inline(line)}</p> : <div key={i} className="h-1" />;
      })}
    </div>
  );
}

export default function Agent({
  aiEnabled,
  hasAccounts,
  onChanged,
}: {
  aiEnabled: boolean;
  hasAccounts: boolean;
  onChanged: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const loadConversations = () =>
    request<{ conversations: Conversation[] }>("/api/agent/conversations").then((r) => setConversations(r.conversations));

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, busy]);

  async function open(id: string) {
    setActive(id);
    setError("");
    setItems((await request<{ items: Item[] }>(`/api/agent/conversations/${id}`)).items);
  }

  async function remove(id: string) {
    await request(`/api/agent/conversations/${id}`, { method: "DELETE" });
    if (active === id) {
      setActive(null);
      setItems([]);
    }
    loadConversations();
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setError("");
    setItems((cur) => [...cur, { kind: "user", text }]);
    setBusy(true);
    try {
      const res = await request<{
        conversationId: string;
        reply: string;
        actions: { summary: string; ok: boolean }[];
      }>("/api/agent", {
        method: "POST",
        body: { message: text, conversationId: active, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      setActive(res.conversationId);
      setItems((cur) => [
        ...cur,
        ...res.actions.map((a) => ({ kind: "action" as const, ...a })),
        ...(res.reply ? [{ kind: "assistant" as const, text: res.reply }] : []),
      ]);
      if (res.actions.length) onChanged();
      loadConversations();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  if (!aiEnabled) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <GoblinIcon size={88} className="mx-auto" />
        <h1 className="font-display mt-3 text-2xl">The agent is asleep</h1>
        <p className="mt-2 text-sm text-ink/60">
          Add <code className="rounded bg-goblin-100 px-1">ANTHROPIC_API_KEY</code> to your <code>.env</code> file and restart
          the server to let the agent plan, write and schedule posts for you.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 md:h-[calc(100vh-4rem)]">
      <aside className="hidden w-60 shrink-0 flex-col lg:flex">
        <button
          className="btn-ghost mb-3"
          onClick={() => {
            setActive(null);
            setItems([]);
          }}
        >
          + New chat
        </button>
        <ul className="flex-1 space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                onClick={() => open(c.id)}
                className={`flex-1 truncate rounded-lg px-3 py-2 text-left text-sm ${
                  active === c.id ? "bg-goblin-100" : "text-ink/60 hover:bg-ink/[0.04]"
                }`}
              >
                {c.title}
              </button>
              <button
                onClick={() => remove(c.id)}
                className="hidden px-2 text-xs text-ink/50 group-hover:block hover:text-red-700"
                aria-label="Delete chat"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="card flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {items.length === 0 && (
            <div className="mx-auto max-w-xl pt-8 text-center">
              <GoblinIcon size={112} className="mx-auto" />
              <h1 className="font-display mt-3 text-2xl">Goblin, your social media agent</h1>
              <p className="mt-1 text-sm text-ink/60">
                Ask me to write posts, plan a content calendar, reschedule things or check what failed. I act directly
                on your calendar.
              </p>
              {!hasAccounts && (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                  Connect an account first so I have somewhere to post — I can still write drafts.
                </p>
              )}
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => (s.endsWith("…") ? setInput(s.replace("…", "")) : send(s))}
                    className="rounded-lg border border-ink/15 p-3 text-sm text-ink/80 hover:bg-ink/[0.04]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.map((it, i) =>
            it.kind === "action" ? (
              <div key={i} className="flex justify-center">
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    it.ok ? "bg-goblin-500/10 text-goblin-800" : "bg-red-500/10 text-red-700"
                  }`}
                >
                  {it.ok ? "✓" : "✕"} {it.summary}
                </span>
              </div>
            ) : (
              <div key={i} className={`flex items-end gap-2 ${it.kind === "user" ? "justify-end" : "justify-start"}`}>
                {it.kind === "assistant" && <GoblinIcon size={30} />}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    it.kind === "user"
                      ? "rounded-br-sm bg-goblin-500/20 whitespace-pre-wrap text-ink"
                      : "rounded-bl-sm border border-ink/10 bg-white text-ink"
                  }`}
                >
                  {it.kind === "user" ? it.text : <Rich text={it.text} />}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-ink/60">
              <GoblinIcon size={22} className="animate-bounce" /> Goblin is working on it…
            </div>
          )}
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div ref={bottom} />
        </div>

        <form
          className="flex gap-2 border-t border-ink/10 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            className="input max-h-40 min-h-[44px] resize-none"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask Goblin to plan, write or schedule…"
          />
          <button className="btn-primary shrink-0" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
