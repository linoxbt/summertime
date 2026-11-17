import Link from "next/link";
import type { ReactNode } from "react";
import { DemoStatus } from "./demo-status";
import { Logo } from "./logo";

export const PRIVACY_PROMISE =
  "Competing importers cannot see each other's reservations, volumes or identities. Your forwarder sees your reservation, exactly as it does today, and so does Summertime, which enforces the settlement rules. Funds move only if the container fills.";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label="Summertime home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Sections">
          <Link href="/#how-it-works" className="hover:text-fg">
            How it works
          </Link>
          <Link href="/#privacy" className="hover:text-fg">
            Privacy
          </Link>
          <Link href="/#why-canton" className="hover:text-fg">
            Why Canton
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <DemoStatus />
          <Link href="/login" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
            Sign in <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="label mt-3 text-faint">Commit together · Settle together</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted">
          <Link href="/privacy" className="hover:text-fg">
            Privacy
          </Link>
          <a href="https://github.com/linoxbt/summertime" className="hover:text-fg">
            Source
          </a>
          <span className="label text-faint">Unaudited · Canton</span>
        </div>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

export function Section({ id, eyebrow, title, children, tinted }: { id?: string; eyebrow: string; title: string; children: ReactNode; tinted?: boolean }) {
  return (
    <section id={id} className={tinted ? "bg-panel-2" : "bg-panel"}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-wider text-link">{eyebrow}</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function TrustTable() {
  const rows = [
    { party: "Importer", can: "See own reservation, receipts, rounded progress", cannot: "See other importers" },
    { party: "Forwarder", can: "See all reservations; choose when to settle", cannot: "Settle below threshold or late; overbook; void bonuses" },
    { party: "Summertime", can: "Co-sign campaigns; hold and pay the bond", cannot: "Move importer funds; settle alone" },
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-accent" tabIndex={0} role="region" aria-label="Trust model table (scrolls sideways)">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-panel-2 text-fg">
          <tr>
            <th className="px-4 py-3 font-semibold">Party</th>
            <th className="px-4 py-3 font-semibold">Can</th>
            <th className="px-4 py-3 font-semibold">Cannot</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.party} className="align-top">
              <td className="px-4 py-3 font-semibold text-fg">{r.party}</td>
              <td className="px-4 py-3">{r.can}</td>
              <td className="px-4 py-3">{r.cannot}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
