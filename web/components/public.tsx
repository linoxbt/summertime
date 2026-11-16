import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";

export const PRIVACY_PROMISE =
  "Competing importers cannot see each other's reservations, volumes or identities. Your forwarder sees your reservation, exactly as it does today, and so does Summertime, which enforces the settlement rules. Funds move only if the container fills.";

export function PublicHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label="Summertime home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold" aria-label="Main">
          <Link href="/#how-it-works" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:text-ink sm:block">
            How it works
          </Link>
          <Link href="/#why-canton" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:text-ink sm:block">
            Why Canton
          </Link>
          <Link href="/privacy" className="rounded-lg px-3 py-2 text-slate-600 hover:text-ink">
            Privacy
          </Link>
          <Link href="/login" className="ml-1 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-white hover:bg-accent-strong">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-2">Commit together. Settle together.</p>
        </div>
        <div className="space-y-1 sm:text-right">
          <p>Unaudited · Built on Canton</p>
          <p>
            <Link href="/privacy" className="font-semibold text-accent hover:underline">
              Privacy
            </Link>{" "}
            ·{" "}
            <a href="https://github.com/linoxbt/summertime" className="font-semibold text-accent hover:underline">
              Source
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

export function Section({ id, eyebrow, title, children, tinted }: { id?: string; eyebrow: string; title: string; children: ReactNode; tinted?: boolean }) {
  return (
    <section id={id} className={tinted ? "bg-slate-50" : "bg-white"}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
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
    <div className="overflow-x-auto rounded-xl border border-slate-200 focus-visible:outline-2 focus-visible:outline-accent" tabIndex={0} role="region" aria-label="Trust model table (scrolls sideways)">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-slate-50 text-ink">
          <tr>
            <th className="px-4 py-3 font-semibold">Party</th>
            <th className="px-4 py-3 font-semibold">Can</th>
            <th className="px-4 py-3 font-semibold">Cannot</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((r) => (
            <tr key={r.party} className="align-top">
              <td className="px-4 py-3 font-semibold text-ink">{r.party}</td>
              <td className="px-4 py-3">{r.can}</td>
              <td className="px-4 py-3">{r.cannot}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
