import Link from "next/link";
import { Eyebrow, PRIVACY_PROMISE, PublicPage } from "@/components/public";
import { BoltSeal, ContainerDrawing, type Slot } from "@/components/drawings";
import { LanesTable, Questions, Steps, Ticker } from "@/components/landing";

const HERO_SLOTS: Slot[] = [
  { id: "A", cbm: 14, mine: true },
  { id: "B", cbm: 9 },
  { id: "C", cbm: 12 },
  { id: "D", cbm: 6 },
  { id: "E", cbm: 8 },
  { id: "F", cbm: 5 },
];

const STATS = [
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

export default function Home() {
  return (
    <PublicPage footer>
      <div className="mx-auto max-w-6xl border-x border-line">
        {/* Meta strip */}
        <div className="label grid border-b border-line text-faint sm:grid-cols-[1.15fr_1fr]">
          <p className="px-4 py-3 sm:px-6">Shared container settlement · Canton Network</p>
          <p className="hidden border-l border-line px-6 py-3 sm:block">40&apos; high-cube · 60 CBM shared · CNCAN → NGAPP</p>
        </div>

        {/* Hero */}
        <section className="border-b border-line">
          <div className="grid sm:grid-cols-[1.15fr_1fr]">
            <div className="px-4 pt-12 sm:px-6 sm:pt-16">
              <h1 className="display text-[3.4rem] text-fg sm:text-7xl lg:text-[6.5rem]">
                Fill the
                <br />
                container.
                <br />
                Then pay.
              </h1>
            </div>
            <div className="flex flex-col justify-end gap-5 px-4 pb-2 pt-6 sm:border-l sm:border-line sm:px-6 sm:pb-6">
              <p className="max-w-xs text-sm text-muted">Importers book space privately. Everyone pays in one settlement, only when the box is full.</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/login" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-fg px-6 text-sm font-medium text-page shadow-soft hover:bg-accent-strong hover:shadow-lift">
                  Try the demo <span aria-hidden="true">→</span>
                </Link>
                <Link href="#how-it-works" className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-panel px-6 text-sm font-medium text-fg hover:border-fg hover:bg-white">
                  How it works
                </Link>
              </div>
            </div>
          </div>
          <div className="px-2 pt-4 sm:px-6">
            <ContainerDrawing
              crane
              slots={HERO_SLOTS}
              capacity={60}
              threshold={48}
              label="Drawing of a shared 40 foot container lifted by a crane. Six importers fill 54 of 60 cubic metres; the 48 cubic metre threshold is passed."
            />
          </div>
          <dl className="grid grid-cols-2 border-t border-line lg:grid-cols-4">
            {STATS.map((s, i) => (
              <div key={s.k} className={`px-4 py-6 sm:px-6 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
                <dt className="sr-only">{s.k}</dt>
                <dd className="display text-5xl text-fg">{s.v}</dd>
                <dd className="mt-2 text-sm text-muted">{s.k}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <Ticker />

      <div className="mx-auto max-w-6xl border-x border-line">
        {/* Belief */}
        <section className="grid border-b border-line md:grid-cols-[0.8fr_2fr]">
          <div className="flex flex-col justify-between gap-6 border-b border-line p-4 sm:p-6 md:border-b-0 md:border-r">
            <Eyebrow>What we hold to</Eyebrow>
            <BoltSeal className="mx-auto h-48 w-auto sm:h-56" />
            <p className="label text-faint">Bolt seal · ISO 17712</p>
          </div>
          <div className="flex flex-col justify-center p-4 py-10 sm:p-10">
            <p className="display text-3xl text-fg sm:text-[2.6rem] sm:leading-[1.02]">
              Everyone pays, or nobody does. Your space stays yours. Your volume stays private.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {["No pooled escrow", "One atomic settlement", "Bonded forwarders"].map((t) => (
                <li key={t} className="rounded-full border border-line-strong bg-panel px-4 py-2 text-sm text-muted">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 border-b border-line">
          <SectionHead eyebrow="How it works" title="Four steps. One box." note="Click a step to see its paperwork." index="FIG · 02" />
          <Steps />
        </section>

        {/* Anatomy */}
        <section id="anatomy" className="scroll-mt-16 border-b border-line">
          <SectionHead eyebrow="Anatomy of a shared box" title="Six importers. Six private contracts." note="The black slot is yours. The rest are hidden from you." index="FIG · 03" />
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

        {/* Sailings */}
        <section id="sailings" className="scroll-mt-16 border-b border-line">
          <SectionHead eyebrow="Sailings" title="Full, or refunded." note="Example campaigns. Every one ends settled or refunded." index="TBL · 04" />
          <div className="sm:px-6 sm:pb-8">
            <LanesTable />
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-16 border-b border-line">
          <SectionHead eyebrow="Privacy" title="Who sees what." index="TBL · 05" />
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
            <Link href="/privacy" className="label flex-none text-link hover:underline">
              Full trust model →
            </Link>
          </div>
        </section>

        {/* Canton */}
        <section id="why-canton" className="scroll-mt-16 border-b border-line">
          <SectionHead eyebrow="Built on Canton" title="The rules live on the ledger." index="SPEC · 06" />
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

        {/* Questions */}
        <section id="questions" className="scroll-mt-16 grid border-b border-line md:grid-cols-[1fr_1.4fr]">
          <div className="p-4 py-10 sm:p-6 md:border-r md:border-line">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="display mt-6 text-4xl text-fg sm:text-5xl">The hard ones first.</h2>
          </div>
          <div className="md:py-10 md:pr-6">
            <Questions />
          </div>
        </section>

        {/* Closing */}
        <section className="hatch border-b border-line px-4 py-16 text-center sm:py-24">
          <div className="mx-auto max-w-xl rounded-3xl border border-line bg-page px-4 py-10 shadow-lift sm:px-10">
            <h2 className="display text-5xl text-fg sm:text-6xl">Book space on the next box.</h2>
            <p className="mt-3 text-sm text-muted">Test USDCx. Real contracts. No sign-up.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/login" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-fg px-6 text-sm font-medium text-page shadow-soft hover:bg-accent-strong hover:shadow-lift">
                Try the demo <span aria-hidden="true">→</span>
              </Link>
              <Link href="/privacy" className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-panel px-6 text-sm font-medium text-fg hover:border-fg hover:bg-white">
                Trust model
              </Link>
            </div>
          </div>
        </section>
      </div>
    </PublicPage>
  );
}

function SectionHead({ eyebrow, title, note, index }: { eyebrow: string; title: string; note?: string; index: string }) {
  return (
    <div className="grid md:grid-cols-[1.15fr_1fr]">
      <div className="p-4 pb-6 pt-10 sm:p-6 sm:pt-12">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="display mt-6 text-4xl text-fg sm:text-5xl">{title}</h2>
      </div>
      <div className="flex items-end justify-between gap-4 px-4 pb-6 sm:px-6 md:border-l md:border-line">
        <p className="max-w-xs text-sm text-muted">{note}</p>
        <span className="label flex-none text-faint">{index}</span>
      </div>
    </div>
  );
}
