import type { Metadata } from "next";
import { CONTACT_URL, LegalPage } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy", description: "What Summertime collects, why, and who can see it." };

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy."
      intro="What we collect, why, and who can see it. We keep it to what the service needs."
      sections={[
        {
          title: "What we collect",
          body: (
            <ul>
              <li><span><strong>Email</strong>, to sign you in (Privy sends the one-time code) and, if you keep them on, to send notifications.</span></li>
              <li><span><strong>Company name and role</strong>, shown to the people you trade with.</span></li>
              <li><span><strong>Your activity</strong>: campaigns, reservations, payments, bookings and disputes.</span></li>
              <li><span><strong>Sign-in records</strong>: time, email and IP address, to stop password guessing and abuse.</span></li>
              <li><span><strong>Messages</strong> you send through the Contact page.</span></li>
            </ul>
          ),
        },
        {
          title: "What we don't do",
          body: (
            <ul>
              <li><span>No ads, no tracking scripts, no analytics cookies.</span></li>
              <li><span>We never sell your data.</span></li>
              <li><span>We don&apos;t ask for a wallet, card or bank details.</span></li>
            </ul>
          ),
        },
        {
          title: "Who sees your activity",
          body: (
            <>
              <p>Summertime runs on Canton, where each record is shared only with the parties on it.</p>
              <ul>
                <li><span>Other importers never see your reservation, amount or identity.</span></li>
                <li><span>Your forwarder sees the reservations in their own campaigns.</span></li>
                <li><span>Summertime, as operator, co-signs campaigns and can see them, to run and support the service.</span></li>
              </ul>
              <p>
                Details: <a href="/docs#privacy">who sees what</a>.
              </p>
            </>
          ),
        },
        {
          title: "Cookies",
          body: <p>One cookie keeps you signed in for up to 7 days. Privy stores its own sign-in data in your browser. Nothing else.</p>,
        },
        {
          title: "Services we use",
          body: (
            <ul>
              <li><span><strong>Privy</strong>: sign-in and email codes.</span></li>
              <li><span><strong>Netlify</strong>: hosts the website.</span></li>
              <li><span><strong>Railway</strong>: hosts the ledger and database.</span></li>
              <li><span><strong>Brevo</strong>: sends notification emails, when switched on.</span></li>
            </ul>
          ),
        },
        {
          title: "How long we keep it",
          body: (
            <>
              <p>We keep your account while it is open. Delete it yourself on the Account page: we remove your email, company name, sign-in records, notifications and messages.</p>
              <p>
                Ledger records are permanent by design and cannot be edited after the fact. They stay on our test network, which
                may be reset during the pilot.
              </p>
            </>
          ),
        },
        {
          title: "Your choices",
          body: (
            <p>
              Your Account page shows your details, turns notification emails on or off, and deletes your account. For anything
              else, use the <a href={CONTACT_URL}>Contact page</a>.
            </p>
          ),
        },
        {
          title: "Changes",
          body: <p>If this policy changes, we will update the date above.</p>,
        },
      ]}
    />
  );
}
