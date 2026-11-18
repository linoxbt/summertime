import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow, PublicPage } from "./public";

export const LEGAL_UPDATED = "18 November 2026";
export const CONTACT_URL = "/contact";

/** A legal page: title, date, short numbered sections in the outlined frame. */
export function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: ReactNode; sections: { title: string; body: ReactNode }[] }) {
  return (
    <PublicPage>
      <div className="mx-auto w-full max-w-6xl flex-1 border-x border-line">
        <div className="border-b border-line px-4 py-10 sm:px-6">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="display mt-6 text-5xl text-fg sm:text-7xl">{title}</h1>
          <p className="label mt-3 text-faint">Updated {LEGAL_UPDATED}</p>
          <p className="mt-4 max-w-2xl text-muted">{intro}</p>
        </div>
        <ol className="divide-y divide-line">
          {sections.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 py-8 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-8 sm:px-6">
              <h2 className="flex items-baseline gap-3 font-semibold text-fg">
                <span className="label text-faint">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className="max-w-2xl space-y-3 text-sm leading-relaxed text-muted [&_a]:font-medium [&_a]:text-link [&_a:hover]:underline [&_li]:flex [&_li]:gap-2 [&_li]:before:text-faint [&_li]:before:content-['–'] [&_strong]:text-fg [&_ul]:space-y-1.5">
                {s.body}
              </div>
            </li>
          ))}
        </ol>
        <p className="border-t border-line px-4 py-6 text-sm text-muted sm:px-6">
          See also: <Link href="/terms" className="font-medium text-link hover:underline">Terms</Link> ·{" "}
          <Link href="/privacy" className="font-medium text-link hover:underline">Privacy</Link> ·{" "}
          <Link href="/contact" className="font-medium text-link hover:underline">Contact</Link> ·{" "}
          <Link href="/docs#trust-model" className="font-medium text-link hover:underline">Trust model</Link>
        </p>
      </div>
    </PublicPage>
  );
}
