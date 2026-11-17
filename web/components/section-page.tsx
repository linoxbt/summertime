import Link from "next/link";
import type { ReactNode } from "react";
import { PublicPage } from "./public";

/** The standalone public pages, in reading order. */
export const TOUR = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/the-box", label: "The box" },
  { href: "/sailings", label: "Sailings" },
  { href: "/canton", label: "Why Canton" },
  { href: "/questions", label: "Questions" },
  { href: "/privacy", label: "Trust model" },
] as const;

/** A public page of its own: framed content, then links to the previous and next page. */
export function SectionPage({ href, children }: { href: (typeof TOUR)[number]["href"]; children: ReactNode }) {
  const i = TOUR.findIndex((t) => t.href === href);
  const prev = TOUR[i - 1];
  const next = TOUR[i + 1];
  return (
    <PublicPage>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col border-x border-line">
        <div className="flex-1">{children}</div>
        <nav aria-label="More pages" className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 sm:p-6">
          {prev ? (
            <PageLink href={prev.href} dir="Previous" label={prev.label} />
          ) : (
            <PageLink href="/" dir="Back to" label="Home" />
          )}
          {next ? <PageLink href={next.href} dir="Next" label={next.label} align="end" /> : <PageLink href="/login" dir="Ready?" label="Try the demo" align="end" />}
        </nav>
      </div>
    </PublicPage>
  );
}

function PageLink({ href, dir, label, align }: { href: string; dir: string; label: string; align?: "end" }) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border border-line bg-panel px-5 py-4 shadow-soft hover:border-line-strong hover:bg-white ${align === "end" ? "sm:items-end sm:text-right" : ""}`}
    >
      <span className="label text-faint">{dir}</span>
      <span className="display mt-1 flex items-center gap-2 text-2xl text-fg">
        {align !== "end" && (
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-x-1">
            ←
          </span>
        )}
        {label}
        {align === "end" && (
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        )}
      </span>
    </Link>
  );
}
