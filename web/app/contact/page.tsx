"use client";

import { useState, type FormEvent } from "react";
import { Eyebrow, PublicPage } from "@/components/public";
import { AuthField } from "@/components/auth-layout";
import { Button, InlineError, inputClass, cx } from "@/components/ui";
import { api, newIdempotencyKey } from "@/lib/api";

const TOPICS = [
  { value: "pilot", label: "Join the pilot" },
  { value: "support", label: "Help with my account" },
  { value: "privacy", label: "Privacy or data request" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Something else" },
] as const;

export default function ContactPage() {
  const [f, setF] = useState({ name: "", email: "", company: "", topic: "pilot", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ready = f.name.trim().length >= 2 && f.email.includes("@") && f.message.trim().length >= 10;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/contact", { ...f, company: f.company.trim() || undefined, website: f.website || undefined }, newIdempotencyKey());
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicPage>
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)] border-x border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section className="border-b border-line px-4 py-10 sm:px-6 lg:border-b-0 lg:border-r lg:p-10">
          <Eyebrow>Contact</Eyebrow>
          <h1 className="display mt-6 text-5xl text-fg sm:text-7xl">Talk to us.</h1>
          <p className="mt-4 max-w-sm text-muted">Forwarders and importers who want to try Summertime, questions about your account, or a privacy request.</p>
          <ul className="mt-8 space-y-2 text-sm text-muted">
            {["We reply by email", "Your message stays private"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-fg text-[10px] text-page" aria-hidden="true">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex min-w-0 items-start justify-center px-4 py-10 sm:px-8 lg:py-14">
          <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-6 shadow-lift sm:p-8">
            {sent ? (
              <div role="status" className="fade-in space-y-3">
                <h2 className="text-xl font-semibold tracking-tight text-fg">Message sent</h2>
                <p className="text-sm text-muted">
                  Thanks, {f.name.trim().split(" ")[0]}. We&apos;ll reply to <span className="font-medium text-fg">{f.email}</span>.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="fade-in space-y-5" noValidate>
                <h2 className="text-xl font-semibold tracking-tight text-fg">Send a message</h2>
                <AuthField label="Your name" name="name" autoComplete="name" required value={f.name} onChange={set("name")} />
                <AuthField label="Email" type="email" name="email" autoComplete="email" inputMode="email" required value={f.email} onChange={set("email")} placeholder="you@company.com" />
                <AuthField label="Company (optional)" name="company" autoComplete="organization" value={f.company} onChange={set("company")} />
                <div>
                  <label htmlFor="topic" className="label block text-muted">
                    Topic
                  </label>
                  <select id="topic" value={f.topic} onChange={set("topic")} className={cx(inputClass, "mt-1.5 min-h-12 text-base")}>
                    {TOPICS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="message" className="label block text-muted">
                    Message
                  </label>
                  <textarea id="message" required rows={5} maxLength={4000} value={f.message} onChange={set("message")} className={cx(inputClass, "mt-1.5 text-base")} />
                </div>
                {/* Left empty by people; filled by bots. */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input id="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
                </div>
                <InlineError error={error} />
                <Button type="submit" className="min-h-12 w-full text-base" busy={busy} disabled={!ready}>
                  Send message
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </PublicPage>
  );
}
