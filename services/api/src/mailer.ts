// Outgoing email. With RESEND_API_KEY set, mail goes through Resend's HTTP API. Without it,
// outside production, mail is written to the mail_outbox table and the log (development
// sink). In production without a provider, sending fails and callers say so.

import type { AppContext } from "./context.ts";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || process.env.NODE_ENV !== "production";
}

export async function sendMail(ctx: AppContext, mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Summertime <no-reply@summertime.app>",
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!res.ok) throw new Error(`email provider answered ${res.status}`);
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("no email provider configured");
  await ctx.db.query("INSERT INTO mail_outbox (to_email, subject, body) VALUES ($1, $2, $3)", [mail.to, mail.subject, mail.text]);
  ctx.log.warn({ to: mail.to, subject: mail.subject }, "no email provider: message written to mail_outbox");
}
