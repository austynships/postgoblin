"use client";

import { useState } from "react";
import { Avatar, Modal, ProviderIcon, request, type AccountView, type ProviderInfo } from "./ui";

export default function Accounts({
  providers,
  accounts,
  onChanged,
}: {
  providers: ProviderInfo[];
  accounts: AccountView[];
  onChanged: () => void;
}) {
  const [connecting, setConnecting] = useState<ProviderInfo | null>(null);
  const [error, setError] = useState("");

  async function start(p: ProviderInfo) {
    setError("");
    if (p.fields.length) return setConnecting(p);
    try {
      const { redirect } = await request<{ redirect: string }>(`/api/connect/${p.id}`, { method: "POST", body: {} });
      window.location.href = redirect;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function disconnect(a: AccountView) {
    if (!confirm(`Disconnect ${a.name}? Scheduled posts to it will be skipped.`)) return;
    await request(`/api/accounts/${a.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl">Accounts</h1>
      <p className="mb-6 text-sm text-ink/50">Connect the profiles, pages and channels you want to post to.</p>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}

      {accounts.length > 0 && (
        <section className="mb-8">
          <h2 className="label mb-3">Connected</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {accounts.map((a) => (
              <li key={a.id} className="card flex items-center gap-3 p-3">
                <Avatar account={a} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="truncate text-xs text-ink/50">
                    {a.providerName}
                    {a.username ? ` · ${a.username}` : ""}
                  </div>
                  {a.status !== "active" && (
                    <div className="mt-1 text-xs text-amber-700" title={a.lastError ?? undefined}>
                      Needs attention — reconnect
                    </div>
                  )}
                  {a.expiresAt && a.expiresAt < Date.now() + 7 * 86400_000 && a.provider === "linkedin" && (
                    <div className="mt-1 text-xs text-amber-700">Token expires soon — reconnect</div>
                  )}
                </div>
                {a.profileUrl && (
                  <a href={a.profileUrl} target="_blank" rel="noreferrer" className="text-xs text-ink/60 hover:text-white">
                    ↗
                  </a>
                )}
                <button className="text-xs text-ink/50 hover:text-red-700" onClick={() => disconnect(a)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="label mb-3">Add a channel</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => start(p)}
              disabled={!p.configured}
              className="card flex flex-col items-start gap-3 p-4 text-left transition enabled:hover:border-ink/30 disabled:opacity-50"
              title={p.configured ? undefined : p.setupHint}
            >
              <ProviderIcon provider={p.id} size={32} />
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-ink/50">
                  {p.configured ? (p.connect === "oauth" ? "Sign in to connect" : "Connect with a key") : "Server setup needed"}
                </div>
              </div>
            </button>
          ))}
        </div>
        {providers.some((p) => !p.configured) && (
          <p className="mt-4 text-xs text-ink/50">
            Greyed-out platforms need API app credentials in the server&apos;s <code>.env</code> — see the README.
          </p>
        )}
      </section>

      {connecting && (
        <ConnectForm
          provider={connecting}
          onClose={() => setConnecting(null)}
          onDone={() => {
            setConnecting(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ConnectForm({ provider, onClose, onDone }: { provider: ProviderInfo; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const res = await request<{ redirect?: string }>(`/api/connect/${provider.id}`, { method: "POST", body: { values } });
      if (res.redirect) window.location.href = res.redirect;
      else onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <ProviderIcon provider={provider.id} size={28} />
          <h2 className="font-semibold">Connect {provider.name}</h2>
        </div>
        {provider.fields.map((f) => (
          <div key={f.name}>
            <label className="label" htmlFor={f.name}>{f.label}</label>
            <input
              className="input"
              id={f.name}
              name={f.name}
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              required={f.required}
              autoComplete="off"
            />
            {f.help && <p className="mt-1 text-xs text-ink/50">{f.help}</p>}
          </div>
        ))}
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm break-words text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Connecting…" : provider.connect === "oauth" ? "Continue" : "Connect"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
