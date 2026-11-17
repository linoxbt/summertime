import Link from "next/link";
import type { ReactNode } from "react";
import { DemoStatus } from "./demo-status";
import { Menu } from "./menu";
import { Logo } from "./logo";

export const PRIVACY_PROMISE =
  "Competing importers cannot see each other's reservations, volumes or identities. Your forwarder sees your reservation, exactly as it does today, and so does Summertime, which enforces the settlement rules. Funds move only if the container fills.";

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/the-box", label: "The box" },
  { href: "/sailings", label: "Sailings" },
  { href: "/canton", label: "Why Canton" },
  { href: "/questions", label: "Questions" },
  { href: "/privacy", label: "Trust model" },
  { href: "/login", label: "Sign in" },
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur">
      <div className="relative">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-x border-line px-4 py-3 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <DemoStatus />
            <Link href="/login" className="hidden min-h-10 items-center gap-2 rounded-full bg-fg px-5 text-sm font-medium text-page shadow-soft hover:bg-accent-strong hover:shadow-lift sm:inline-flex">
              Try the demo <span aria-hidden="true">→</span>
            </Link>
            <Menu items={PAGES} />
          </div>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-fg text-[#c9c8c2]">
      <div className="mx-auto grid max-w-6xl border-x border-[#2c2b28] sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="border-b border-[#2c2b28] px-4 py-10 sm:border-b-0 sm:border-r sm:px-6">
          <Logo inverted />
          <p className="mt-4 max-w-xs text-sm">Shared containers. One settlement. Built on Canton with USDCx.</p>
        </div>
        <FooterCol title="Product" links={[["/how-it-works", "How it works"], ["/the-box", "The box"], ["/sailings", "Sailings"], ["/login", "Sign in"]]} />
        <FooterCol title="Project" links={[["https://github.com/linoxbt/summertime", "Source"], ["https://www.canton.network", "Canton Network"], ["/questions", "Questions"], ["/privacy", "Trust model"]]} last />
      </div>
      <div className="border-t border-[#2c2b28]">
        <p className="label mx-auto max-w-6xl border-x border-[#2c2b28] px-4 py-4 text-[#a6a59f] sm:px-6">© 2026 Summertime · Unaudited pilot · Test USDCx only</p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links, last }: { title: string; links: [string, string][]; last?: boolean }) {
  return (
    <div className={`px-4 py-10 sm:px-6 ${last ? "" : "border-b border-[#2c2b28] sm:border-b-0 sm:border-r"}`}>
      <p className="label text-[#a6a59f]">{title}</p>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-page hover:underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Public page: header with menu, outlined frame. The footer is shown on the landing page only. */
export function PublicPage({ children, footer = false }: { children: ReactNode; footer?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex flex-1 flex-col [&>*]:w-full">{children}</main>
      {footer && <PublicFooter />}
    </div>
  );
}

/** Section eyebrow: a ringed dot and a mono label. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="label flex items-center gap-2 text-muted">
      <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-fg" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-fg" />
      </span>
      {children}
    </p>
  );
}

export function TrustTable() {
  const rows = [
    { party: "Importer", can: "See own reservation, receipts, rounded progress", cannot: "See other importers" },
    { party: "Forwarder", can: "See all reservations; choose when to settle", cannot: "Settle below threshold or late; overbook; void bonuses" },
    { party: "Summertime", can: "Co-sign campaigns; hold and pay the bond", cannot: "Move importer funds; settle alone" },
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-soft" tabIndex={0} role="region" aria-label="Trust model table (scrolls sideways)">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="label text-muted">
          <tr className="border-b border-line">
            <th className="px-4 py-3 font-normal">Party</th>
            <th className="border-l border-line px-4 py-3 font-normal">Can</th>
            <th className="border-l border-line px-4 py-3 font-normal">Cannot</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.party} className="align-top">
              <td className="px-4 py-3 font-semibold text-fg">{r.party}</td>
              <td className="border-l border-line px-4 py-3">{r.can}</td>
              <td className="border-l border-line px-4 py-3">{r.cannot}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
