"use client";

import { useEffect, useState } from "react";
import { request } from "./ui";

type Key = { id: string; name: string; prefix: string; createdAt: number; lastUsedAt: number | null };

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="text-xs text-zinc-400 hover:text-white"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied ✓" : "Copy"}
    </button>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{title}</span>
        <Copy text={code} />
      </div>
      <pre className="overflow-x-auto rounded-lg border border-white/8 bg-black/40 p-3 text-xs leading-relaxed text-zinc-300">
        {code}
      </pre>
    </div>
  );
}

export default function Settings({ timezone, onTimezoneSaved }: { timezone: string; onTimezoneSaved: () => void }) {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [tz, setTz] = useState(timezone);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const browserTz = typeof window === "undefined" ? "" : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const mcpUrl = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;
  const key = fresh ?? "pg_YOUR_API_KEY";

  const load = () => request<{ keys: Key[] }>("/api/keys").then((r) => setKeys(r.keys));
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await request<{ key: string }>("/api/keys", { method: "POST", body: { name: name || "MCP client" } });
      setFresh(res.key);
      setName("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function revoke(k: Key) {
    if (!confirm(`Revoke "${k.name}"? Any agent using it will lose access immediately.`)) return;
    await request(`/api/keys/${k.id}`, { method: "DELETE" });
    load();
  }

  async function saveTz(value: string) {
    setError("");
    try {
      await request("/api/me", { method: "PATCH", body: { timezone: value } });
      setTz(value);
      setMsg("Timezone saved");
      onTimezoneSaved();
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Timezone</h2>
        <p className="text-sm text-zinc-400">
          Used by external AI agents (MCP) to interpret times like “tomorrow at 9am”.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-xs" value={tz} onChange={(e) => setTz(e.target.value)} />
          <button className="btn-ghost" onClick={() => saveTz(tz)}>Save</button>
          {browserTz && browserTz !== tz && (
            <button className="btn-ghost" onClick={() => saveTz(browserTz)}>Use {browserTz}</button>
          )}
          {msg && <span className="text-sm text-goblin-300">{msg}</span>}
        </div>
      </section>

      <section className="card space-y-5 p-5">
        <div>
          <h2 className="font-semibold">MCP server · connect your AI agents</h2>
          <p className="mt-1 text-sm text-zinc-400">
            PostGoblins speaks the Model Context Protocol. Any MCP client — Claude Code, Claude Desktop, Cursor, your own
            agents — can list your accounts, draft, schedule, reschedule and retry posts with an API key.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/30 px-3 py-2">
          <span className="text-xs text-zinc-500">Endpoint</span>
          <code className="flex-1 truncate text-sm text-goblin-300">{mcpUrl}</code>
          <Copy text={mcpUrl} />
        </div>

        <form onSubmit={create} className="flex gap-2">
          <input
            className="input"
            placeholder="Key name, e.g. Claude Code on laptop"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-primary shrink-0">Create API key</button>
        </form>

        {fresh && (
          <div className="rounded-lg border border-goblin-500/40 bg-goblin-500/10 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-goblin-300">Your new key — copy it now, it won&apos;t be shown again</span>
              <Copy text={fresh} />
            </div>
            <code className="block text-sm break-all text-zinc-100">{fresh}</code>
          </div>
        )}

        {keys.length > 0 && (
          <ul className="divide-y divide-white/5 rounded-lg border border-white/8">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{k.name}</div>
                  <div className="text-xs text-zinc-500">
                    {k.prefix}… · created {new Date(k.createdAt).toLocaleDateString()} ·{" "}
                    {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}
                  </div>
                </div>
                <button className="text-xs text-zinc-500 hover:text-red-300" onClick={() => revoke(k)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-4">
          <Snippet
            title="Claude Code"
            code={`claude mcp add --transport http postgoblins ${mcpUrl} --header "Authorization: Bearer ${key}"`}
          />
          <Snippet
            title="JSON config (Cursor, Claude Desktop via mcp-remote, and most clients)"
            code={JSON.stringify(
              { mcpServers: { postgoblins: { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } } },
              null,
              2,
            )}
          />
          <p className="text-xs text-zinc-500">
            Tools: get_current_time, list_accounts, list_posts, get_post, create_post, update_post, delete_post,
            retry_post, find_open_slots, list_media. Keys act as you — treat them like passwords.
          </p>
        </div>
      </section>
    </div>
  );
}
