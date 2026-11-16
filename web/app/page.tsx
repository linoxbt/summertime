import Link from "next/link";
import { PRIVACY_PROMISE, PublicPage, Section, TrustTable } from "@/components/public";

const FAILURES = [
  {
    n: "01",
    title: "Pay-first risk",
    body: "Importers pay before the container is confirmed full. If it doesn't fill, their money is stuck with the consolidator.",
  },
  { n: "02", title: "First-mover reluctance", body: "Nobody wants to commit first, so containers fill slowly and ship late." },
  { n: "03", title: "Competitive leakage", body: "Importers in the same market learn each other's volumes and suppliers through the shared shipment." },
  { n: "04", title: "Partial execution", body: "Some pay, some don't. The container ships late or not at all, and refunds are slow and disputed." },
];

const STEPS = [
  {
    title: "The forwarder opens a campaign",
    body: "Container capacity, a fixed rate per CBM, a lock time, a deadline, and a failure bond of 1–5% of the container's value.",
  },
  {
    title: "Importers reserve privately",
    body: "Each importer reserves its CBM and locks USDCx against a forwarder-signed reservation. The money stays in the importer's own allocation.",
  },
  { title: "Full container: one atomic settlement", body: "Every importer's payment settles to the forwarder in a single Canton transaction. All or nothing." },
  {
    title: "Not full: funds released, bonus paid",
    body: "Every importer gets its funds back and claims a share of the forwarder's bond. Committing early is rewarded, not punished.",
  },
];

const CANTON = [
  {
    title: "Sub-transaction privacy",
    body: "Each importer sees only its own leg of a settlement, even inside one shared transaction. On a public chain, every competitor's volume would be visible.",
  },
  { title: "Atomic multi-party settlement", body: "Independent importers pay one forwarder in a single transaction. If any leg fails, nothing moves." },
  {
    title: "Token-standard allocations",
    body: "Importers lock funds in their own CIP-56 allocation, not a pooled escrow. USDCx gives businesses a dollar asset they understand.",
  },
];

export default function Home() {
  return (
    <PublicPage>
      <section className="bg-ink text-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">Shared containers · Canton Network · USDCx</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">Commit together. Settle together.</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            Summertime lets importers who share a shipping container reserve space privately and lock their payment. Money moves only if the container fills, in
            one atomic transaction.
          </p>
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

      <Section eyebrow="The problem" title="Small importers share containers, and carry all the risk of doing so.">
        <p className="max-w-3xl text-lg text-slate-700">
          Importers who can&apos;t fill a container alone share one. Today each pays the consolidator upfront, coordinated over WhatsApp, and hopes the
          container fills, while competitors learn each other&apos;s volumes through the same consolidator.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FAILURES.map((f) => (
            <div key={f.n} className="rounded-xl border border-slate-200 p-5">
              <p className="text-2xl font-semibold text-accent tabular">{f.n}</p>
              <h3 className="mt-2 font-semibold text-ink">{f.title}</h3>
              <p className="mt-1 text-slate-700">{f.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="how-it-works" eyebrow="How it works" title="Money moves only if the container fills." tinted>
        <ol className="grid gap-4 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-ink font-semibold text-white">{i + 1}</span>
              <div>
                <h3 className="font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-slate-700">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-ink">Worked example</h3>
          <p className="mt-1 text-slate-700">
            A 60 CBM container at 150 USDCx per CBM with a 200 USDCx bond. If six importers reserve all 60 CBM, 9,000 USDCx settles to the forwarder in one
            transaction. If only 54 CBM is reserved by the deadline, nobody pays, every importer&apos;s funds are released, and the 200 USDCx bond is shared in
            proportion to what each committed.
          </p>
        </div>
      </Section>

      <Section id="privacy" eyebrow="Privacy and trust" title="Competitors stay invisible to each other.">
        <blockquote className="max-w-4xl border-l-4 border-accent pl-5 text-xl font-medium text-ink">&ldquo;{PRIVACY_PROMISE}&rdquo;</blockquote>
        <div className="mt-8">
          <TrustTable />
        </div>
        <p className="mt-4 text-sm text-slate-600">
          We state the trust model plainly: the forwarder and Summertime see reservations, and Summertime holds the bond in custody.{" "}
          <Link href="/privacy" className="font-semibold text-accent hover:underline">
            Read the full trust model
          </Link>
          .
        </p>
      </Section>

      <Section id="why-canton" eyebrow="Why Canton" title="Only Canton offers all three properties together." tinted>
        <div className="grid gap-4 md:grid-cols-3">
          {CANTON.map((c) => (
            <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-ink">{c.title}</h3>
              <p className="mt-1 text-slate-700">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <section className="bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-14 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-ink">See it work end to end.</h2>
            <p className="mt-1 text-slate-700">Sign in as a forwarder or an importer in the demo environment. Test USDCx only; no real money moves.</p>
          </div>
          <Link href="/login" className="inline-flex min-h-12 items-center rounded-lg bg-accent px-6 font-semibold text-white hover:bg-accent-strong">
            Sign in to the demo
          </Link>
        </div>
      </section>
    </PublicPage>
  );
}
