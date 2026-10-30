import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";
import Landing from "@/components/Landing";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "PostGoblins — the agentic social media scheduler",
  description:
    "Write once, schedule everywhere. PostGoblins plans, writes and publishes to X, Bluesky, Mastodon, LinkedIn, Threads, Facebook, Discord and Telegram with an AI agent that does the work.",
  openGraph: {
    title: "PostGoblins — the agentic social media scheduler",
    description: "Let the goblins handle your posting. Schedule everywhere with an AI agent that does the work.",
    images: ["/brand/logo.png"],
  },
};

/** Signed-in users get the app; everyone else gets the landing page. */
export default async function Home() {
  if (await currentUser()) return <Dashboard />;
  return <Landing />;
}
