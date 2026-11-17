import Link from "next/link";
import { Eyebrow, PublicPage } from "@/components/public";
import { BoltSeal, ContainerDrawing } from "@/components/drawings";
import { Ticker } from "@/components/landing";
import {
  AnatomySection,
  CantonSection,
  ClosingSection,
  HERO_SLOTS,
  HowItWorksSection,
  PrivacySection,
  QuestionsSection,
  SailingsSection,
  STATS,
} from "@/components/sections";

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
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-fg px-6 text-sm font-medium text-page shadow-soft hover:bg-accent-strong hover:shadow-lift"
                >
                  Try the demo <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-panel px-6 text-sm font-medium text-fg hover:border-fg hover:bg-white"
                >
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
              <div
                key={s.k}
                className={`px-4 py-6 sm:px-6 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
              >
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

        <HowItWorksSection />
        <AnatomySection />
        <SailingsSection />
        <PrivacySection />
        <CantonSection />
        <QuestionsSection />
        <ClosingSection />
      </div>
    </PublicPage>
  );
}
