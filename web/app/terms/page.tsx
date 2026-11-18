import type { Metadata } from "next";
import { CONTACT_URL, LegalPage } from "@/components/legal";

export const metadata: Metadata = { title: "Terms", description: "The terms for using Summertime." };

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms."
      intro="These terms cover your use of Summertime. By signing in, you accept them."
      sections={[
        {
          title: "A test network",
          body: (
            <>
              <p>Summertime is an unaudited pilot. It runs on a Canton test network of its own, with test USDCx.</p>
              <ul>
                <li><span>Test USDCx has no value and cannot be withdrawn or exchanged.</span></li>
                <li><span>Do not send real funds or rely on Summertime for real shipments.</span></li>
                <li><span>Balances, campaigns and history may be reset as the pilot changes.</span></li>
              </ul>
            </>
          ),
        },
        {
          title: "Your account",
          body: (
            <ul>
              <li><span>Sign in with an email you control. Keep access to it safe.</span></li>
              <li><span>Give a real company name and choose the role that fits you: importer or forwarder.</span></li>
              <li><span>You are responsible for what happens under your account.</span></li>
              <li><span>Demo accounts are shared and reset. Don&apos;t put anything private in them.</span></li>
            </ul>
          ),
        },
        {
          title: "Fair use",
          body: (
            <>
              <p>Don&apos;t:</p>
              <ul>
                <li><span>try to reach other people&apos;s data or accounts;</span></li>
                <li><span>disrupt, overload or attack the service;</span></li>
                <li><span>pretend to be another person or company;</span></li>
                <li><span>use Summertime for anything unlawful.</span></li>
              </ul>
              <p>We may suspend accounts that break these rules.</p>
            </>
          ),
        },
        {
          title: "How settlement works",
          body: (
            <p>
              Campaigns follow the rules in their smart contracts: money moves only when a container reaches its threshold before
              the deadline; otherwise reservations are refunded with any bonus due. The contracts, not Summertime staff, decide
              these outcomes. See the <a href="/docs#how-it-works">docs</a> and the <a href="/docs#trust-model">trust model</a>.
            </p>
          ),
        },
        {
          title: "No warranty",
          body: (
            <p>
              Summertime is provided as is, without warranties of any kind. As far as the law allows, we are not liable for any
              loss from using the pilot, including lost data, downtime or decisions made on its output.
            </p>
          ),
        },
        {
          title: "Source code",
          body: (
            <p>
              The code is public at <a href="https://github.com/linoxbt/summertime">github.com/linoxbt/summertime</a>. Its license
              is in the repository.
            </p>
          ),
        },
        {
          title: "Changes and contact",
          body: (
            <p>
              We may update these terms; the date above shows the latest version. Questions? Use the{" "}
              <a href={CONTACT_URL}>Contact page</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
