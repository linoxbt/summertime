import Link from "next/link";
import { PRIVACY_PROMISE, PublicPage, Section, TrustTable } from "@/components/public";

const STEPS = [
  { title: "Forwarder opens a campaign", body: "Capacity, rate, deadline, bond" },
  { title: "Importers reserve privately", body: "USDCx locked in their own allocation" },
  { title: "Full: one atomic settlement", body: "All pay together, or none do" },
  { title: "Not full: refund + bonus", body: "Funds released, bond shared" },
];

const CANTON = [
  { title: "Private", body: "Each importer sees only its own leg" },
  { title: "Atomic", body: "Every payment settles in one transaction" },
  { title: "CIP-56 + USDCx", body: "No pooled escrow" },
];

export default function Home() {
  return (
    <PublicPage>
      <section className="bg-ink text-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">Shared containers · Canton · USDCx</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">Commit together. Settle together.</h1>
          <p className="mt-5 text-lg text-slate-300">Money moves only if the container fills.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 font-semibold text-white hover:bg-accent-strong"
            >
              Try the demo
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-600 px-6 font-semibold text-white hover:bg-slate-800"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      <Section id="how-it-works" eyebrow="How it works" title="All or nothing." tinted>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-semibold text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="privacy" eyebrow="Privacy" title="Competitors stay invisible to each other.">
        <blockquote className="max-w-4xl border-l-4 border-accent pl-5 text-lg font-medium text-ink">&ldquo;{PRIVACY_PROMISE}&rdquo;</blockquote>
        <div className="mt-8">
          <TrustTable />
        </div>
        <p className="mt-4 text-sm">
          <Link href="/privacy" className="font-semibold text-accent hover:underline">
            Full trust model
          </Link>
        </p>
      </Section>

      <Section id="why-canton" eyebrow="Why Canton" title="Private, atomic, standard." tinted>
        <div className="grid gap-4 sm:grid-cols-3">
          {CANTON.map((c) => (
            <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-ink">{c.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </PublicPage>
  );
}
