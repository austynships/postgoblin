import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { ThemeToggle } from "./Theme";
import { Logo } from "./ui";

/** Shared shell for /privacy and /terms: logo header, readable column, footer links. */
export default function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="PostGoblins home">
            <Logo height={44} />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-ink/50">Effective {LEGAL.effectiveDate}</p>
        <div className="mt-6 text-[15px] leading-relaxed text-ink/80">{intro}</div>
        <div className="mt-8 space-y-8">{children}</div>
        <p className="mt-12 border-t border-ink/10 pt-6 text-sm text-ink/60">
          Questions? Email{" "}
          <a className="font-medium text-goblin-800 hover:underline" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          .
        </p>
      </main>

      <footer className="border-t border-ink/10 py-6 text-center text-sm text-ink/50">
        <Link className="hover:text-ink" href="/privacy">Privacy Policy</Link>
        <span className="mx-2">·</span>
        <Link className="hover:text-ink" href="/terms">Terms of Service</Link>
        <span className="mx-2">·</span>
        <Link className="hover:text-ink" href="/">Open PostGoblins</Link>
      </footer>
    </div>
  );
}

/** A numbered policy section. */
export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-3 text-xl font-bold text-ink">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink/80 [&_a]:font-medium [&_a]:text-goblin-800 [&_a:hover]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
