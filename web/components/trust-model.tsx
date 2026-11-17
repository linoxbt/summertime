import { PRIVACY_PROMISE, Eyebrow, TrustTable } from "./public";

const BLOCKS: { title: string; items: string[] }[] = [
  {
    title: "Enforced by Canton",
    items: ["One private contract per importer", "Each importer sees only its own settlement leg", "Progress: rounded, scheduled, hidden below 3 importers"],
  },
  {
    title: "Still visible, by design",
    items: [
      "Rounded aggregate progress",
      "Size of a single change between two readings (not who made it)",
      "Total committed, via a proportional bonus (equal split below 3 importers)",
      "Everything, to the forwarder and Summertime",
    ],
  },
  {
    title: "Bond custody",
    items: ["Held by Summertime until the campaign ends", "Trust in Summertime, not a ledger guarantee", "Reconciled continuously; new campaigns pause on a shortfall"],
  },
  {
    title: "Pilot mode",
    items: ["Summertime hosts your party and signs for you", "Private from other importers, not from Summertime", "Own-wallet mode removes this"],
  },
  { title: "Not covered", items: ["Physical delivery (off-ledger, forwarder agreement)", "Refunds after settlement", "Summertime is unaudited"] },
];

/** The trust model: who can do what, what Canton enforces, and what remains visible. */
export function TrustModelSection() {
  return (
    <section id="trust-model" className="scroll-mt-20 border-b border-line px-4 py-10 sm:px-6 sm:py-12">
      <Eyebrow>Trust model</Eyebrow>
      <h2 className="display mt-6 text-4xl text-fg sm:text-5xl">Privacy and trust.</h2>
      <blockquote className="mt-6 max-w-3xl border-l-2 border-fg pl-5 text-fg">&ldquo;{PRIVACY_PROMISE}&rdquo;</blockquote>

      <h3 className="display mt-10 text-2xl text-fg">Who can do what</h3>
      <div className="mt-4">
        <TrustTable />
      </div>

      <div className="mt-6 grid gap-x-8 md:grid-cols-2">
        {BLOCKS.map((b) => (
          <div key={b.title}>
            <h3 className="display mt-6 text-2xl text-fg">{b.title}</h3>
            <ul className="mt-3 divide-y divide-line border-y border-line text-sm text-muted">
              {b.items.map((i) => (
                <li key={i} className="py-2">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
