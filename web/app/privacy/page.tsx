import type { Metadata } from "next";
import { PRIVACY_PROMISE, PublicPage, TrustTable } from "@/components/public";

export const metadata: Metadata = { title: "Privacy and trust model" };

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <h2 className="mt-10 text-xl font-semibold text-ink">{title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </>
  );
}

export default function PrivacyPage() {
  return (
    <PublicPage>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Privacy and trust</h1>
        <blockquote className="mt-6 border-l-4 border-accent pl-5 text-lg font-medium text-ink">&ldquo;{PRIVACY_PROMISE}&rdquo;</blockquote>

        <h2 className="mt-10 text-xl font-semibold text-ink">Who can do what</h2>
        <div className="mt-4">
          <TrustTable />
        </div>

        <Block
          title="Enforced by Canton"
          items={["One private contract per importer", "Each importer sees only its own settlement leg", "Progress: rounded, scheduled, hidden below 3 importers"]}
        />
        <Block
          title="Still visible, by design"
          items={[
            "Rounded aggregate progress",
            "Size of a single change between two readings (not who made it)",
            "Total committed, via a proportional bonus (equal split below 3 importers)",
            "Everything, to the forwarder and Summertime",
          ]}
        />
        <Block title="Bond custody" items={["Held by Summertime until the campaign ends", "Trust in Summertime, not a ledger guarantee", "Reconciled continuously; new campaigns pause on a shortfall"]} />
        <Block title="Pilot mode" items={["Summertime hosts your party and signs for you", "Private from other importers, not from Summertime", "Own-wallet mode removes this"]} />
        <Block title="Not covered" items={["Physical delivery (off-ledger, forwarder agreement)", "Refunds after settlement", "Summertime is unaudited"]} />
      </article>
    </PublicPage>
  );
}
