"use client";

import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "pg-theme";

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the
 * wrong theme. Kept as a string: it executes outside React.
 */
export const themeScript = `(function(){try{var c=localStorage.getItem("${KEY}")||"system";var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

function apply(choice: ThemeChoice) {
  const dark =
    choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const OPTIONS: { id: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  {
    id: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    id: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
  {
    id: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
];

/** Light / System / Dark segmented control. Choice is remembered per browser. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(readChoice());
    // In "system" mode, follow the OS when it switches (e.g. at sunset).
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readChoice() === "system" && apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function pick(next: ThemeChoice) {
    setChoice(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
  }

  return (
    <div role="radiogroup" aria-label="Theme" className={`inline-flex rounded-lg border border-ink/15 bg-surface p-0.5 ${className}`}>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={choice === o.id}
          title={o.label}
          onClick={() => pick(o.id)}
          className={`grid h-7 w-8 place-items-center rounded-md transition ${
            choice === o.id ? "bg-goblin-500 text-[#1d1e23]" : "text-ink/60 hover:text-ink"
          }`}
        >
          {o.icon}
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
