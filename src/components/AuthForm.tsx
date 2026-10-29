"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo, request } from "./ui";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await request(`/api/auth/${mode}`, {
        method: "POST",
        body: { ...data, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="sr-only">PostGoblins</h1>
          <Logo height={112} className="max-w-full" />
          <p className="mt-3 text-sm text-ink/60">Your agentic social media scheduler</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          {signup && (
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input className="input" id="name" name="name" autoComplete="name" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              required
              minLength={signup ? 8 : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </div>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : signup ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink/60">
          {signup ? "Already have an account? " : "New here? "}
          <Link className="text-goblin-800 hover:underline" href={signup ? "/login" : "/signup"}>
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </main>
  );
}
