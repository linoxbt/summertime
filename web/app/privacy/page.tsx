import type { Metadata } from "next";
import { PRIVACY_PROMISE, PublicPage, TrustTable } from "@/components/public";

export const metadata: Metadata = { title: "Privacy and trust model" };

export default function PrivacyPage() {
  return (
    <PublicPage>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Privacy and trust model</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Who can see what, and who can do what.</h1>
        <blockquote className="mt-6 border-l-4 border-accent pl-5 text-lg font-medium text-ink">&ldquo;{PRIVACY_PROMISE}&rdquo;</blockquote>

        <h2 className="mt-10 text-xl font-semibold text-ink">How privacy is enforced</h2>
        <p className="mt-2 text-slate-700">
          Summertime runs on Canton, where each party receives only the parts of a transaction it is entitled to see. Every importer&apos;s reservation,
          commitment, bond eligibility and receipt is a separate contract shared only with that importer and its forwarder. When the container fills, all
          payments settle in one transaction, but each importer&apos;s view of it contains only its own payment.
        </p>
        <p className="mt-2 text-slate-700">
          Progress reaches each importer through its own private record. It shows committed capacity rounded down to whole CBM, published on a schedule rather
          than after every change, and it is hidden until at least three importers have committed.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-ink">Trust model</h2>
        <div className="mt-4">
          <TrustTable />
        </div>

        <h2 className="mt-10 text-xl font-semibold text-ink">What still leaks, by design</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-700">
          <li>Aggregate progress (rounded) and, if the forwarder chooses, the number of committed importers.</li>
          <li>
            When exactly one commitment changes between two scheduled readings, the difference shows that commitment&apos;s size to the nearest CBM, but not who
            made it.
          </li>
          <li>
            A proportional bonus lets an importer work out the total committed by all eligible importers. Below three eligible importers the bonus is split
            equally instead.
          </li>
          <li>The forwarder and Summertime see every reservation.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-ink">Bond custody</h2>
        <p className="mt-2 text-slate-700">
          The forwarder&apos;s failure bond is transferred to Summertime, which holds it until the campaign ends. Summertime&apos;s contracts record what is
          owed to each importer, but the token standard lets the owner of a holding transfer it, so bond custody is trust in Summertime, not a ledger guarantee.
          Summertime reconciles bond holdings against live entitlements daily, and plans to replace its custody with a neutral escrow.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-ink">Pilot mode</h2>
        <p className="mt-2 text-slate-700">
          In pilot mode, Summertime hosts the forwarder&apos;s and importers&apos; parties on its own Canton node and signs on their behalf after explicit
          consent. Ledger privacy then protects importers from each other, but not from Summertime, which operates the node and could act as any hosted party.
          Every signing screen says so. Using your own wallet removes this.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-ink">What Summertime does not cover</h2>
        <p className="mt-2 text-slate-700">
          Physical delivery stays off-ledger. If a forwarder is paid and then fails to ship, the dispute and any refund are handled under the forwarder
          agreement. Summertime is unaudited.
        </p>
      </article>
    </PublicPage>
  );
}
