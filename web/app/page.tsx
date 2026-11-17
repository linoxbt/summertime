import Link from "next/link";
import { PRIVACY_PROMISE, PublicPage } from "@/components/public";
import { BookingSlip, Eyebrow, Panel, RouteGlobe, SailingsBoard, SailingsTicker } from "@/components/landing";

const PROTOCOL = [
  { k: "Settlement", v: "1 transaction" },
  { k: "If not full", v: "Refund + bonus" },
  { k: "Visibility", v: "Yours only" },
];

const PARTIES = [
  { who: "Importer", sees: "Own reservation", never: "Other importers" },
  { who: "Forwarder", sees: "Every reservation", never: "Funds before full" },
  { who: "Summertime", sees: "Every reservation", never: "Importer funds" },
];

const CANTON = [
  { icon: "◐", title: "Sub-transaction privacy", tag: "Per-party views" },
  { icon: "⇄", title: "Atomic settlement", tag: "All or nothing" },
  { icon: "▣", title: "CIP-56 allocations", tag: "No pooled escrow" },
  { icon: "$", title: "USDCx", tag: "Dollar settlement" },
];

export default function Home() {
  return (
    <PublicPage>
      {/* Hero */}
      <section className="grid-bg relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(59,104,240,0.22),transparent_60%)]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-14 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div className="flex flex-col justify-center">
            <p className="inline-flex w-fit items-center overflow-hidden rounded border border-line-strong">
              <span className="label bg-amber px-2 py-1 text-[#1a1204]">Pilot</span>
              <span className="px-3 py-1 text-sm text-muted">China → Lagos groupage</span>
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[0.95] tracking-tight text-fg sm:text-7xl">
              Fill the container.
              <br />
              Then pay.
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted">Importers reserve space privately. Everyone settles together, only when it&apos;s full.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-md bg-accent px-6 font-semibold text-white shadow-[0_0_30px_-6px_rgba(59,104,240,0.8)] hover:bg-accent-strong"
              >
                Try the demo <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-line-strong bg-page px-6 font-semibold text-fg hover:bg-panel-2"
              >
                How it works
              </Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 border-t border-line">
              {PROTOCOL.map((p, i) => (
                <div key={p.k} className={`pt-4 ${i ? "border-l border-line pl-4" : ""}`}>
                  <dt className="label text-faint">{p.k}</dt>
                  <dd className="mt-1 text-lg font-semibold text-fg sm:text-xl">{p.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[520px]">
            <RouteGlobe />
            <div className="absolute -bottom-6 right-0 w-[78%] max-w-[340px] sm:right-2">
              <BookingSlip />
            </div>
            <div className="absolute left-0 top-2 rounded-md border border-line-strong bg-page/90 px-3 py-2 backdrop-blur">
              <p className="flex items-center gap-3 text-sm font-semibold text-fg">
                CNCAN → NGAPP <span className="label rounded border border-link/40 px-1.5 py-0.5 text-link">Filling</span>
              </p>
              <div className="mt-2 h-1 w-32 overflow-hidden rounded bg-line sm:w-40">
                <div className="h-full w-[90%] bg-ok" />
              </div>
              <p className="label mt-1.5 text-faint">54 / 60 CBM · example</p>
            </div>
          </div>
        </div>
        <SailingsTicker />
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <Eyebrow letter="01">How it works</Eyebrow>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">One container. Many importers.</h2>
          </div>
          <p className="text-muted lg:text-right">Money moves only if the container fills.</p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <Panel letter="A" tag="Forwarder" title="Open a campaign">
            <div className="space-y-3 text-sm">
              <Row k="Container" v="60 CBM" />
              <Row k="Rate" v="150 USDCx / CBM" />
              <Row k="Deadline" v="Fri 18:00" />
              <Row k="Bond" v="200 USDCx" accent />
            </div>
          </Panel>
          <Panel letter="B" tag="Importers" title="Reserve privately">
            <p className="label text-faint">Your space</p>
            <p className="mt-1 text-3xl font-semibold text-fg tabular">14 CBM</p>
            <div className="mt-4 h-1.5 rounded bg-line">
              <div className="relative h-full w-[23%] rounded bg-link">
                <span className="absolute -right-2 -top-1.5 h-4 w-4 rounded-full border-2 border-page bg-fg" />
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">
              Locked in your allocation · <span className="font-semibold text-fg">2,100.00 USDCx</span>
            </p>
          </Panel>
          <Panel letter="C" tag="Settlement" title="All pay, or none do">
            <ul className="space-y-2 text-sm">
              {["Importer A", "Importer B", "Importer C", "+3 more"].map((n) => (
                <li key={n} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                  <span className="text-muted">{n}</span>
                  <span className="label text-ok">Settled</span>
                </li>
              ))}
            </ul>
            <p className="label mt-3 text-faint">One Canton transaction</p>
          </Panel>
        </div>
      </section>

      {/* Sailings */}
      <section className="border-y border-line bg-panel/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <div>
              <Eyebrow letter="02">Sailings</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Full, or refunded.</h2>
            </div>
            <dl className="grid grid-cols-2 gap-6 lg:justify-self-end">
              <div>
                <dt className="label text-faint">Full</dt>
                <dd className="mt-1 text-2xl font-semibold text-ok">Settled</dd>
              </div>
              <div className="border-l border-line pl-6">
                <dt className="label text-faint">Not full</dt>
                <dd className="mt-1 text-2xl font-semibold text-amber">Refund + bonus</dd>
              </div>
            </dl>
          </div>
          <div className="mt-10">
            <SailingsBoard />
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <Eyebrow letter="03">Privacy</Eyebrow>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Competitors stay invisible.</h2>
          </div>
          <Link href="/privacy" className="font-semibold text-link hover:underline lg:justify-self-end">
            Full trust model →
          </Link>
        </div>
        <blockquote className="mt-8 max-w-4xl border-l-2 border-amber pl-5 text-lg text-fg">&ldquo;{PRIVACY_PROMISE}&rdquo;</blockquote>
        <div className="mt-10 grid overflow-hidden rounded-lg border border-line sm:grid-cols-3">
          {PARTIES.map((p, i) => (
            <div key={p.who} className={`bg-panel/60 p-5 ${i ? "border-t border-line sm:border-l sm:border-t-0" : ""}`}>
              <p className="label text-link">{p.who}</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="label text-faint">Sees</dt>
                  <dd className="mt-0.5 font-semibold text-fg">{p.sees}</dd>
                </div>
                <div>
                  <dt className="label text-faint">Never</dt>
                  <dd className="mt-0.5 font-semibold text-fg">{p.never}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* Why Canton */}
      <section id="why-canton" className="border-t border-line bg-panel/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Eyebrow letter="04">Why Canton</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Private. Atomic. Standard.</h2>
          <div className="mt-10 grid overflow-hidden rounded-lg border border-line sm:grid-cols-2 lg:grid-cols-4">
            {CANTON.map((c, i) => (
              <div key={c.title} className={`bg-page/60 p-5 ${i ? "border-t border-line sm:border-t-0 sm:border-l" : ""}`}>
                <span className="text-xl text-link" aria-hidden="true">
                  {c.icon}
                </span>
                <p className="mt-3 font-semibold text-fg">{c.title}</p>
                <p className="label mt-2 text-amber">{c.tag}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="grid-bg border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Book the next container.</h2>
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center gap-3 rounded-md bg-accent px-6 font-semibold text-white shadow-[0_0_30px_-6px_rgba(59,104,240,0.8)] hover:bg-accent-strong"
          >
            Try the demo <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </PublicPage>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="label text-faint">{k}</span>
      <span className={`font-semibold ${accent ? "text-amber" : "text-fg"}`}>{v}</span>
    </div>
  );
}
