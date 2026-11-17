// Landing-page sections, shared by the landing page and the standalone pages
// (/how-it-works, /the-box, /sailings, /canton, /questions). On a standalone page the
// section title is the page's h1.

import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow, PRIVACY_PROMISE } from "./public";
import { ContainerDrawing, type Slot } from "./drawings";
import { LanesTable, Questions, Steps } from "./landing";

export const HERO_SLOTS: Slot[] = [
  { id: "A", cbm: 14, mine: true },
  { id: "B", cbm: 9 },
  { id: "C", cbm: 12 },
  { id: "D", cbm: 6 },
  { id: "E", cbm: 8 },
  { id: "F", cbm: 5 },
];

export const STATS = [
  { v: "1", k: "Settlement transaction" },
  { v: "0", k: "USDCx moved before full" },
  { v: "3+", k: "Importers before progress shows" },
  { v: "100%", k: "Refund if it doesn't fill" },
];

const PARTIES = [
  { who: "Importer", sees: "Own reservation", never: "Other importers" },
  { who: "Forwarder", sees: "Every reservation", never: "Funds before full" },
  { who: "Summertime", sees: "Every reservation", never: "Importer funds" },
];

const CANTON = [
  { t: "Private by contract", d: "One contract per importer. Others can't read it." },
  { t: "Atomic settlement", d: "Every leg settles in one transaction, or none do." },
  { t: "CIP-56 allocations", d: "Funds wait in your allocation. No pooled escrow." },
  { t: "USDCx", d: "Dollar settlement on Canton Network." },
  { t: "Enforced capacity", d: "No overbooking. The ledger counts the CBM." },
  { t: "Bonded forwarders", d: "A failed box pays importers from the bond." },
];

export function HowItWorksSection({ standalone = false }: { standalone?: boolean }) {
  return (
    <section id="how-it-works" className="scroll-mt-16 border-b border-line">
      <SectionHead level={standalone ? 1 : 2} eyebrow="How it works" title="Four steps. One box." note="Click a step to see its paperwork." index="FIG · 02" />
      <Steps />
    </section>
  );
}

export function AnatomySection({ standalone = false }: { standalone?: boolean }) {
  return (
    <section id="anatomy" className="scroll-mt-16 border-b border-line">
      <SectionHead
        level={standalone ? 1 : 2}
        eyebrow="Anatomy of a shared box"
        title="Six importers. Six private contracts."
        note="The black slot is yours. The rest are hidden from you."
        index="FIG · 03"
      />
      <div className="border-t border-line px-2 py-8 sm:px-6">
        <ContainerDrawing
          slots={HERO_SLOTS}
          capacity={60}
          threshold={48}
          label="Cross-section of a shared container. Your 14 cubic metre slot is shown solid; five other importers' slots are hatched; 6 cubic metres are open."
        />
      </div>
      <dl className="grid border-t border-line sm:grid-cols-3">
        {[
          ["Your slot", "Solid. Only you, your forwarder and Summertime see it."],
          ["Other slots", "Hatched. Separate contracts you can't read."],
          ["Threshold", "Dashed line. Below it, nothing can settle."],
        ].map(([k, v], i) => (
          <div key={k} className={`p-4 sm:p-6 ${i ? "border-t border-line sm:border-l sm:border-t-0" : ""}`}>
            <dt className="display text-xl text-fg">{k}</dt>
            <dd className="mt-1 text-sm text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SailingsSection({ standalone = false }: { standalone?: boolean }) {
  return (
    <section id="sailings" className="scroll-mt-16 border-b border-line">
      <SectionHead
        level={standalone ? 1 : 2}
        eyebrow="Sailings"
        title="Full, or refunded."
        note="Example campaigns. Every one ends settled or refunded."
        index="TBL · 04"
      />
      <div className="sm:px-6 sm:pb-8">
        <LanesTable />
      </div>
    </section>
  );
}

export function PrivacySection({ standalone = false }: { standalone?: boolean }) {
  return (
    <section id="privacy" className="scroll-mt-16 border-b border-line">
      <SectionHead level={standalone ? 1 : 2} eyebrow="Privacy" title="Who sees what." index="TBL · 05" />
      <div className="grid border-t border-line sm:grid-cols-3">
        {PARTIES.map((p, i) => (
          <div key={p.who} className={`p-4 sm:p-6 ${i ? "border-t border-line sm:border-l sm:border-t-0" : ""}`}>
            <p className="display text-3xl text-fg">{p.who}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3 border-b border-line pb-2">
                <dt className="label text-faint">Sees</dt>
                <dd className="text-fg">{p.sees}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="label text-faint">Never</dt>
                <dd className="text-fg">{p.never}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 border-t border-line p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <blockquote className="max-w-3xl border-l-2 border-fg pl-4 text-sm text-muted">&ldquo;{PRIVACY_PROMISE}&rdquo;</blockquote>
        <Link href="/docs#trust-model" className="label flex-none text-link hover:underline">
          Full trust model →
        </Link>
      </div>
    </section>
  );
}

export function CantonSection({ standalone = false }: { standalone?: boolean }) {
  return (
    <section id="why-canton" className="scroll-mt-16 border-b border-line">
      <SectionHead level={standalone ? 1 : 2} eyebrow="Built on Canton" title="The rules live on the ledger." index="SPEC · 06" />
      <ul className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-3">
        {CANTON.map((c, i) => (
          <li
            key={c.t}
            className={`border-line p-4 sm:p-6 ${i ? "border-t" : ""} ${i === 1 ? "sm:border-t-0" : ""} ${i % 2 ? "sm:border-l" : ""} ${i === 2 ? "lg:border-t-0" : ""} ${i % 3 ? "lg:border-l" : "lg:border-l-0"}`}
          >
            <p className="display text-2xl text-fg">{c.t}</p>
            <p className="mt-1 text-sm text-muted">{c.d}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QuestionsSection({ standalone = false }: { standalone?: boolean }) {
  return (
    <section id="questions" className="scroll-mt-16 grid border-b border-line md:grid-cols-[1fr_1.4fr]">
      <div className="p-4 py-10 sm:p-6 md:border-r md:border-line">
        <Eyebrow>Questions</Eyebrow>
        <Heading level={standalone ? 1 : 2} className="display mt-6 text-4xl text-fg sm:text-5xl">
          The hard ones first.
        </Heading>
      </div>
      <div className="md:py-10 md:pr-6">
        <Questions />
      </div>
    </section>
  );
}

export function ClosingSection() {
  return (
    <section className="hatch border-b border-line px-4 py-16 text-center sm:py-24">
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-page px-4 py-10 shadow-lift sm:px-10">
        <h2 className="display text-5xl text-fg sm:text-6xl">Book space on the next box.</h2>
        <p className="mt-3 text-sm text-muted">Create an account in a minute, or look around the demo first.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-fg px-6 text-sm font-medium text-page shadow-soft hover:bg-accent-strong hover:shadow-lift"
          >
            Create an account <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/demo"
            className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-panel px-6 text-sm font-medium text-fg hover:border-fg hover:bg-white"
          >
            Try the demo
          </Link>
        </div>
      </div>
    </section>
  );
}

function Heading({ level, className, children }: { level: 1 | 2; className: string; children: ReactNode }) {
  return level === 1 ? <h1 className={className}>{children}</h1> : <h2 className={className}>{children}</h2>;
}

export function SectionHead({ eyebrow, title, note, index, level = 2 }: { eyebrow: string; title: string; note?: string; index: string; level?: 1 | 2 }) {
  return (
    <div className="grid md:grid-cols-[1.15fr_1fr]">
      <div className="p-4 pb-6 pt-10 sm:p-6 sm:pt-12">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading level={level} className="display mt-6 text-4xl text-fg sm:text-5xl">
          {title}
        </Heading>
      </div>
      <div className="flex items-end justify-between gap-4 px-4 pb-6 sm:px-6 md:border-l md:border-line">
        <p className="max-w-xs text-sm text-muted">{note}</p>
        <span className="label flex-none text-faint">{index}</span>
      </div>
    </div>
  );
}
