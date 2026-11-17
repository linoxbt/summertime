"use client";

import { useState, type ReactNode } from "react";

/* ---------------------------------------------------------------- Ticker */

const TICKS = [
  "CNCAN → NGAPP — FILLING 54/60",
  "CNSZX → GHTEM — LOCKED 48/60",
  "CNNGB → KEMBA — SETTLED 60/60",
  "CNSHA → NGAPP — REFUNDED + BONUS",
  "CNXMN → CIABJ — FILLING 22/60",
  "CNTAO → TZDAR — SETTLED 58/60",
];

export function Ticker() {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {TICKS.map((t) => (
        <li key={t} className="label flex items-center gap-2 whitespace-nowrap text-fg">
          <span className="h-1.5 w-1.5 rounded-full bg-fg" aria-hidden="true" />
          {t}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="flex overflow-hidden border-y border-line bg-panel py-3" role="region" aria-label="Example campaigns">
      <div className="flex min-w-0 motion-safe:animate-[ticker_40s_linear_infinite]">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Steps */

type Step = { n: string; title: string; who: string; doc: ReactNode };

const STEPS: Step[] = [
  {
    n: "01",
    title: "Open a campaign",
    who: "Forwarder",
    doc: (
      <Doc title="Campaign terms" ref_="CMP-0226">
        <DocRow k="Lane" v="CNCAN → NGAPP" />
        <DocRow k="Box" v="40' HC · 60 CBM" />
        <DocRow k="Rate" v="150 USDCx / CBM" />
        <DocRow k="Threshold" v="48 CBM" />
        <DocRow k="Lock" v="Fri 18:00 WAT" />
        <DocRow k="Bond" v="200 USDCx" strong />
      </Doc>
    ),
  },
  {
    n: "02",
    title: "Reserve privately",
    who: "Importer",
    doc: (
      <Doc title="Reservation" ref_="RSV-A-14">
        <DocRow k="Space" v="14 CBM" />
        <DocRow k="Price" v="2,100.00 USDCx" />
        <DocRow k="Funds" v="Allocated, not sent" />
        <DocRow k="Visible to" v="You · forwarder · Summertime" />
        <DocRow k="Hidden from" v="Other importers" strong />
      </Doc>
    ),
  },
  {
    n: "03",
    title: "Fill and lock",
    who: "Everyone",
    doc: (
      <Doc title="Lock notice" ref_="LCK-0226">
        <DocRow k="Committed" v="54 / 60 CBM" />
        <DocRow k="Threshold" v="Reached" strong />
        <DocRow k="Importers" v="6" />
        <DocRow k="Changes" v="Closed" />
      </Doc>
    ),
  },
  {
    n: "04",
    title: "Settle together",
    who: "Ledger",
    doc: (
      <Doc title="Settlement receipt" ref_="STL-0226">
        <DocRow k="Legs" v="6 importers → forwarder" />
        <DocRow k="Total" v="8,100.00 USDCx" />
        <DocRow k="Transaction" v="1, atomic" strong />
        <DocRow k="If short" v="Full refund + bond bonus" />
      </Doc>
    ),
  },
];

export function Steps() {
  const [active, setActive] = useState(0);
  const step = STEPS[active]!;
  return (
    <div className="grid border-t border-line lg:grid-cols-[1.15fr_1fr]">
      <ol className="divide-y divide-line lg:border-r lg:border-line">
        {STEPS.map((s, i) => (
          <li key={s.n}>
            <button
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className="grid min-h-16 w-full grid-cols-[4rem_1fr_auto] items-center gap-4 px-4 py-4 text-left hover:bg-panel/70 sm:px-6"
            >
              <span className={`display text-3xl ${i === active ? "text-fg" : "text-faint"}`}>{s.n}</span>
              <span className={`display text-2xl sm:text-3xl ${i === active ? "text-fg" : "text-faint"}`}>{s.title}</span>
              <span className="label text-faint">{s.who}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="hatch flex items-center justify-center border-t border-line p-6 sm:p-10 lg:border-t-0">
        <div key={step.n} className="sheet-in w-full max-w-sm">
          {step.doc}
        </div>
      </div>
    </div>
  );
}

function Doc({ title, ref_, children }: { title: string; ref_: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-lift">
      <div className="flex items-center justify-between border-b border-line bg-white/60 px-5 py-3">
        <span className="display text-xl text-fg">{title}</span>
        <span className="label text-faint">{ref_}</span>
      </div>
      <dl className="divide-y divide-line px-5">{children}</dl>
      <div className="flex items-end justify-between border-t border-line px-5 py-3">
        <span className="label text-faint">Example</span>
        <Barcode />
      </div>
    </div>
  );
}

function DocRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="label text-faint">{k}</dt>
      <dd className={`text-right tabular ${strong ? "font-semibold text-fg" : "text-muted"}`}>{v}</dd>
    </div>
  );
}

function Barcode() {
  const bars = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2];
  let x = 0;
  return (
    <svg viewBox="0 0 64 18" className="h-4 w-16" aria-hidden="true">
      {bars.map((w, i) => {
        const r = i % 2 === 0 ? <rect key={i} x={x} y="0" width={w} height="18" fill="#0b0a09" /> : null;
        x += w + 1;
        return r;
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- Sailings */

type Lane = { o: string; oc: string; d: string; dc: string; filled: number; cap: number; status: "Filling" | "Locked" | "Settled" | "Refunded"; lock: string };

const LANES: Lane[] = [
  { o: "Guangzhou", oc: "CNCAN", d: "Lagos Apapa", dc: "NGAPP", filled: 54, cap: 60, status: "Filling", lock: "Fri 18:00" },
  { o: "Shenzhen", oc: "CNSZX", d: "Tema", dc: "GHTEM", filled: 48, cap: 60, status: "Locked", lock: "Closed" },
  { o: "Ningbo", oc: "CNNGB", d: "Mombasa", dc: "KEMBA", filled: 60, cap: 60, status: "Settled", lock: "Closed" },
  { o: "Shanghai", oc: "CNSHA", d: "Lagos Apapa", dc: "NGAPP", filled: 31, cap: 60, status: "Refunded", lock: "Expired" },
  { o: "Xiamen", oc: "CNXMN", d: "Abidjan", dc: "CIABJ", filled: 22, cap: 60, status: "Filling", lock: "Tue 12:00" },
  { o: "Qingdao", oc: "CNTAO", d: "Dar es Salaam", dc: "TZDAR", filled: 58, cap: 60, status: "Settled", lock: "Closed" },
  { o: "Guangzhou", oc: "CNCAN", d: "Dakar", dc: "SNDKR", filled: 40, cap: 60, status: "Filling", lock: "Mon 09:00" },
];

const STATUS_STYLE: Record<Lane["status"], string> = {
  Filling: "border-fg text-fg",
  Locked: "border-fg bg-fg text-page",
  Settled: "border-ok text-ok",
  Refunded: "border-amber text-amber",
};

export function LanesTable() {
  return (
    <div className="mx-4 overflow-x-auto rounded-2xl border border-line bg-panel shadow-soft sm:mx-0" tabIndex={0} role="region" aria-label="Example sailings (scrolls sideways)">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="label border-b border-line text-faint">
            {["No.", "Origin", "Destination", "Filled", "Status", "Lock"].map((h, i) => (
              <th key={h} className={`px-4 py-3 font-normal ${i ? "border-l border-line" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {LANES.map((l, i) => (
            <tr key={i}>
              <td className="px-4 py-3 font-mono text-faint">{String(i + 1).padStart(2, "0")}</td>
              <td className="border-l border-line px-4 py-3 text-fg">
                {l.o} <span className="label ml-1 text-faint">{l.oc}</span>
              </td>
              <td className="border-l border-line px-4 py-3 text-fg">
                → {l.d} <span className="label ml-1 text-faint">{l.dc}</span>
              </td>
              <td className="border-l border-line px-4 py-3">
                <span className="flex items-center gap-3">
                  <span className="relative h-1.5 w-20 rounded-full bg-panel-2" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: `${(l.filled / l.cap) * 100}%` }} />
                    <span className="absolute inset-y-[-3px] w-0.5 rounded-full bg-amber" style={{ left: "80%" }} />
                  </span>
                  <span className="font-mono text-fg tabular">
                    {l.filled}/{l.cap}
                  </span>
                </span>
              </td>
              <td className="border-l border-line px-4 py-3">
                <span className={`label inline-block rounded-full border px-2.5 py-0.5 ${STATUS_STYLE[l.status]}`}>{l.status}</span>
              </td>
              <td className="border-l border-line px-4 py-3 font-mono text-muted">{l.lock}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- FAQ */

const QUESTIONS: { q: string; a: string }[] = [
  { q: "What if the container doesn't fill?", a: "Nobody pays. Every importer gets a full refund plus a share of the forwarder's bond." },
  { q: "Who holds my money before settlement?", a: "Funds stay locked in your own allocation, never pooled, until the single settlement." },
  { q: "Can other importers see my order?", a: "No. Each reservation is a separate private contract on Canton." },
  { q: "Can the forwarder settle early or overbook?", a: "No. Settlement needs the threshold, must land before the deadline and needs Summertime's co-signature. Capacity is enforced on-ledger." },
  { q: "What is USDCx?", a: "A dollar stablecoin on Canton Network. The demo uses test USDCx only." },
  { q: "Is it audited?", a: "Not yet. This is a pilot; an audit comes before real funds." },
];

export function Questions() {
  const [open, setOpen] = useState(0);
  return (
    <ul className="mx-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel shadow-soft md:mx-0">
      {QUESTIONS.map((item, i) => {
        const isOpen = open === i;
        const id = `faq-${i}`;
        return (
          <li key={item.q}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={id}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/60 sm:px-5"
              >
                <span className="display text-lg text-fg sm:text-xl">{item.q}</span>
                <span
                  className={`grid h-8 w-8 flex-none place-items-center rounded-full transition-transform duration-300 ease-smooth ${isOpen ? "rotate-45 bg-fg text-page" : "bg-panel-2 text-fg"}`}
                  aria-hidden="true"
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={id}
              inert={!isOpen}
              aria-hidden={!isOpen}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-smooth ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="overflow-hidden">
                <p className="px-4 pb-4 text-sm text-muted sm:px-5">{item.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
