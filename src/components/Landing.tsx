import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { GoblinIcon, Logo, ProviderIcon } from "./ui";

const PLATFORMS = [
  { id: "x", name: "X" },
  { id: "bluesky", name: "Bluesky" },
  { id: "mastodon", name: "Mastodon" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "threads", name: "Threads" },
  { id: "facebook", name: "Facebook Pages" },
  { id: "instagram", name: "Instagram" },
  { id: "youtube", name: "YouTube" },
  { id: "tiktok", name: "TikTok" },
  { id: "discord", name: "Discord" },
  { id: "telegram", name: "Telegram" },
];

const icon = { width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const FEATURES: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "A calendar for everything",
    body: "Week and month views of every draft, scheduled and published post. Click any day to plan something new.",
    icon: (
      <svg viewBox="0 0 24 24" {...icon}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "One composer, every network",
    body: "Write once, pick your accounts, and see live character counts for each platform before anything goes out.",
    icon: (
      <svg viewBox="0 0 24 24" {...icon}>
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    ),
  },
  {
    title: "AI assist, one click away",
    body: "Make it punchier, shorten it to fit X, add hashtags or write a hook-first version without leaving the composer.",
    icon: (
      <svg viewBox="0 0 24 24" {...icon}>
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </svg>
    ),
  },
  {
    title: "Publishing you can trust",
    body: "Automatic retries, delivery status per account, token refresh, and a one-click retry when a platform hiccups.",
    icon: (
      <svg viewBox="0 0 24 24" {...icon}>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
      </svg>
    ),
  },
  {
    title: "Images and video",
    body: "Attach photos and clips once. PostGoblins uploads them to each platform in the format it expects.",
    icon: (
      <svg viewBox="0 0 24 24" {...icon}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="M21 16l-5-5-9 9" />
      </svg>
    ),
  },
  {
    title: "Your accounts stay yours",
    body: "Connect with each platform’s official sign-in. Access tokens are encrypted, and you can disconnect at any time.",
    icon: (
      <svg viewBox="0 0 24 24" {...icon}>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    ),
  },
];

const STEPS = [
  { title: "Connect your accounts", body: "Sign in to your social platforms once. Bluesky, Mastodon, Discord and Telegram take under a minute." },
  { title: "Write, or ask Goblin", body: "Draft posts yourself, or tell the agent what you need: a launch week, a thread, a reschedule." },
  { title: "The goblins post on time", body: "Everything lands on your calendar and publishes when you planned, with status for every account." },
];

const FAQ = [
  {
    q: "Is PostGoblins free?",
    a: "Yes, PostGoblins is free to use right now. If paid plans arrive later, you’ll hear about them first, and nothing will be charged unless you choose a plan.",
  },
  {
    q: "Which platforms can I post to?",
    a: "X, Bluesky, Mastodon, LinkedIn, Threads, Facebook Pages, Instagram, YouTube, TikTok, Discord and Telegram. You can post to several at once.",
  },
  {
    q: "Will the AI post things without asking me?",
    a: "No. Goblin only acts on what you ask it to do. It drafts and schedules on request, and it only publishes immediately or deletes a post when you clearly tell it to. Everything it does shows up on your calendar.",
  },
  {
    q: "Can I connect my own AI agents?",
    a: "Yes. PostGoblins includes an MCP server, so Claude Code, Claude Desktop, Cursor or your own agents can list accounts and create, schedule and retry posts with an API key you control.",
  },
  {
    q: "What happens if a post fails?",
    a: "PostGoblins retries automatically, shows exactly which account failed and why, and lets you retry with one click once it’s fixed.",
  },
  {
    q: "How is my data handled?",
    a: "Platform tokens are encrypted, passwords and API keys are hashed, and we never sell your data or use it for ads. The Privacy Policy has the details.",
  },
];

function Sticker({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border-2 border-outline bg-surface shadow-[4px_4px_0_var(--color-outline)] dark:border-ink/20 ${className}`}>
      {children}
    </div>
  );
}

/** Hero illustration: a mock agent conversation that fills a calendar. */
function AgentDemo() {
  const scheduled = [
    { day: "Mon", time: "9:00 AM", text: "Launch day! Meet PostGoblins…", platforms: ["x", "bluesky", "linkedin"] },
    { day: "Tue", time: "12:30 PM", text: "3 ways to never miss a post…", platforms: ["threads", "mastodon"] },
    { day: "Wed", time: "5:00 PM", text: "Behind the scenes with the goblins…", platforms: ["facebook", "x"] },
  ];
  return (
    <Sticker className="relative w-full max-w-md p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-ink/10 pb-3">
        <GoblinIcon size={28} />
        <span className="font-semibold">Goblin</span>
        <span className="ml-auto rounded-full bg-goblin-500/20 px-2 py-0.5 text-[11px] font-semibold text-goblin-800">AI agent</span>
      </div>
      <div className="space-y-3 text-sm">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-goblin-500/20 px-3.5 py-2">
          Plan our launch week, one post each weekday at good times.
        </div>
        <div className="flex flex-col gap-1.5">
          {scheduled.map((s) => (
            <div key={s.day} className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper px-2.5 py-1.5 text-xs">
              <span className="text-goblin-800">✓</span>
              <span className="w-24 shrink-0 font-semibold">
                {s.day} {s.time}
              </span>
              <span className="truncate text-ink/70">{s.text}</span>
              <span className="ml-auto flex shrink-0 -space-x-1">
                {s.platforms.map((p) => (
                  <span key={p} className="rounded-full ring-2 ring-paper">
                    <ProviderIcon provider={p} size={16} />
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <GoblinIcon size={24} />
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-ink/10 px-3.5 py-2">
            Done! Your launch week is <strong>on the calendar</strong>. Want me to add a recap thread on Friday?
          </div>
        </div>
      </div>
    </Sticker>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" aria-label="PostGoblins home" className="shrink-0">
            <Logo height={42} />
          </Link>
          <nav className="ml-6 hidden gap-6 text-sm font-medium text-ink/70 md:flex">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#agents" className="hover:text-ink">For AI agents</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="btn hidden text-ink/80 hover:text-ink sm:inline-flex">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary whitespace-nowrap">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_70%_20%,color-mix(in_srgb,var(--color-goblin-500)_22%,transparent),transparent)]" />
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pt-14 pb-16 md:grid-cols-[1.05fr_1fr] md:pt-20 md:pb-24 [&>*]:min-w-0">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-surface px-3 py-1 text-xs font-semibold text-ink/70">
                <span className="h-2 w-2 rounded-full bg-goblin-500" />
                The agentic social media scheduler
              </span>
              <h1 className="font-display mt-5 text-5xl leading-[1.05] sm:text-6xl">
                Let the goblins handle your <span className="text-goblin-600 dark:text-goblin-500">posting.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink/70">
                Write once, schedule everywhere. PostGoblins plans, writes and publishes to eleven networks, with an AI
                agent that actually does the work, not just the suggesting.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="btn-primary px-6 py-3 text-base">
                  Start free
                </Link>
                <a href="#how" className="btn-ghost px-6 py-3 text-base">
                  See how it works
                </a>
              </div>
              <p className="mt-4 text-sm text-ink/50">Free to use. No credit card.</p>
            </div>
            <div className="flex justify-center pt-20 md:justify-end">
              <div className="relative w-full max-w-md">
                {/* The mascot sits on the card's top edge without covering its contents. */}
                <GoblinIcon
                  size={124}
                  className="absolute -top-[112px] right-6 z-10 rotate-[6deg] drop-shadow-xl"
                />
                <AgentDemo />
              </div>
            </div>
          </div>
        </section>

        {/* Platforms */}
        <section className="border-y border-ink/10 bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-8">
            <p className="text-center text-xs font-semibold tracking-wider text-ink/50 uppercase">
              Publish to all your channels at once
            </p>
            <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
              {PLATFORMS.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm font-semibold text-ink/80">
                  <ProviderIcon provider={p.id} size={26} />
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl">Everything you need to stay consistent</h2>
            <p className="mt-3 text-lg text-ink/70">
              A scheduler that’s a pleasure to use on its own, and a lot faster with a goblin helping.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-11 w-11 place-items-center rounded-xl border-2 border-outline bg-goblin-500 text-[#1d1e23] dark:border-ink/20">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink/70">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Agent spotlight */}
        <section className="bg-surface border-y border-ink/10">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 md:grid-cols-2 [&>*]:min-w-0">
            <div className="order-2 md:order-1">
              <Sticker className="p-5">
                <div className="space-y-2.5 text-sm">
                  {[
                    "What do I have scheduled for the next 7 days?",
                    "Turn this blog post into a Bluesky thread and a LinkedIn post",
                    "Find failed posts, tell me why, and retry the ones that can be fixed",
                    "Move Thursday’s posts to Friday morning",
                  ].map((q) => (
                    <div key={q} className="flex items-center gap-2.5 rounded-lg border border-ink/10 bg-paper px-3 py-2.5">
                      <span className="text-goblin-700">›</span>
                      {q}
                    </div>
                  ))}
                </div>
              </Sticker>
            </div>
            <div className="order-1 md:order-2">
              <GoblinIcon size={72} />
              <h2 className="font-display mt-4 text-4xl">Meet Goblin, your social media agent</h2>
              <p className="mt-4 text-lg leading-relaxed text-ink/70">
                Goblin can see your accounts and your calendar, and acts on them. Ask in plain English and it writes
                platform-ready copy, picks open time slots, schedules whole campaigns, reschedules, and fixes what
                failed.
              </p>
              <ul className="mt-5 space-y-2 text-[15px] text-ink/80">
                {[
                  "Writes to each platform’s character limit and style",
                  "Finds good posting times around what’s already booked",
                  "Never publishes or deletes without you clearly asking",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-goblin-500 text-[11px] font-bold text-[#1d1e23]">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="font-display text-center text-4xl">Up and running in three steps</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card relative p-6 pt-9">
                <span className="font-display absolute -top-5 left-6 grid h-10 w-10 place-items-center rounded-full border-2 border-outline bg-goblin-500 text-xl text-[#1d1e23] shadow-[2px_2px_0_var(--color-outline)] dark:border-ink/20">
                  {i + 1}
                </span>
                <h3 className="text-lg font-bold">{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink/70">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* MCP / agents */}
        <section id="agents" className="scroll-mt-20 border-y border-ink/10 bg-surface">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 md:grid-cols-2 [&>*]:min-w-0">
            <div>
              <span className="text-xs font-semibold tracking-wider text-goblin-700 uppercase">Built for AI agents</span>
              <h2 className="font-display mt-2 text-4xl">Plug PostGoblins into your own agents</h2>
              <p className="mt-4 text-lg leading-relaxed text-ink/70">
                PostGoblins speaks the Model Context Protocol. Create an API key, add one line to Claude Code, Claude
                Desktop, Cursor or your own agent, and it can list your accounts, find open slots, and create, schedule
                and retry posts.
              </p>
              <p className="mt-3 text-sm text-ink/50">Keys are revocable at any time and stored only as hashes.</p>
            </div>
            <div className="min-w-0 overflow-hidden rounded-2xl border-2 border-outline bg-[#16171b] shadow-[4px_4px_0_var(--color-outline)] dark:border-ink/20">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-2 text-xs text-white/40">terminal</span>
              </div>
              <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-[#e8ebe3]">
                <code>
                  <span className="text-[#8fd624]">$</span> claude mcp add --transport http postgoblins \{"\n"}
                  {"    "}{LEGAL.siteUrl}/api/mcp \{"\n"}
                  {"    "}--header <span className="text-[#b8e85f]">&quot;Authorization: Bearer pg_…&quot;</span>
                  {"\n\n"}
                  <span className="text-white/40">✓ list_accounts  ✓ find_open_slots  ✓ create_post</span>
                  {"\n"}
                  <span className="text-white/40">✓ update_post    ✓ retry_post       ✓ list_posts</span>
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
          <h2 className="font-display text-center text-4xl">Questions, answered</h2>
          <div className="mt-10 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="card group p-5 open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-goblin-100 text-goblin-800 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-ink/70">
                  {f.a}
                  {f.q.startsWith("How is my data") && (
                    <>
                      {" "}
                      <Link href="/privacy" className="font-medium text-goblin-800 hover:underline">
                        Read the Privacy Policy
                      </Link>
                      .
                    </>
                  )}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-20">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border-2 border-outline bg-goblin-500 px-6 py-14 text-center text-[#1d1e23] shadow-[6px_6px_0_var(--color-outline)] dark:border-black">
            <GoblinIcon size={96} className="mx-auto" />
            <h2 className="font-display mt-4 text-4xl sm:text-5xl">Put the goblins to work</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-[#1d1e23]/75">
              Connect your accounts, ask for a week of posts, and get your time back.
            </p>
            <Link
              href="/signup"
              className="btn mt-8 border-2 border-[#1d1e23] bg-[#1d1e23] px-7 py-3 text-base text-[#e8ebe3] shadow-[3px_3px_0_rgba(0,0,0,0.35)] hover:bg-black"
            >
              Create your free account
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-ink/60 sm:flex-row">
          <div className="flex items-center gap-3">
            <Logo height={32} />
            <span>© {new Date().getFullYear()} {LEGAL.operator}</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-5">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-ink">Contact</a>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
