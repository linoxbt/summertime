// Outgoing email. Providers, in order of preference:
//   BREVO_API_KEY  → Brevo (sends from one verified sender address; no custom domain needed)
//   RESEND_API_KEY → Resend (needs a verified domain)
// Without a provider, outside production, mail is written to the mail_outbox table and the
// log (development sink). In production without a provider, sending fails and callers say so.
// EMAIL_FROM is the sender, "Name <address>" or a bare address; with Brevo it must be the
// sender address verified in Brevo.

import type { AppContext } from "./context.ts";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) || process.env.NODE_ENV !== "production";
}

function sender(): { name: string; email: string } {
  const raw = process.env.EMAIL_FROM ?? "Summertime <no-reply@summertime.app>";
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  return m ? { name: m[1] || "Summertime", email: m[2]! } : { name: "Summertime", email: raw.trim() };
}

export async function sendMail(ctx: AppContext, mail: Mail): Promise<void> {
  const from = sender();
  if (process.env.BREVO_API_KEY) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: from, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text }),
    });
    if (!res.ok) throw new Error(`Brevo answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("no email provider configured");
  await ctx.db.query("INSERT INTO mail_outbox (to_email, subject, body) VALUES ($1, $2, $3)", [mail.to, mail.subject, mail.text]);
  ctx.log.warn({ to: mail.to, subject: mail.subject }, "no email provider: message written to mail_outbox");
}
