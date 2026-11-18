// Outgoing email. Providers, in order of preference:
//   BREVO_API_KEY  → Brevo (sends from one verified sender address; no custom domain needed)
//   RESEND_API_KEY → Resend (needs a verified domain)
// Without a provider, outside production, mail is written to the mail_outbox table and the
// log (development sink). In production without a provider, sending fails and callers say so.
// EMAIL_FROM is the sender, "Name <address>" or a bare address; with Brevo it must be the
// sender address verified in Brevo.

import type { Logger } from "pino";
import type { Db } from "./db.ts";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML version; the text version is always sent too. */
  html?: string;
}

/** Public address of the web app, for links in emails. */
export const WEB_URL = (process.env.PUBLIC_WEB_URL ?? "https://summertime-app.netlify.app").replace(/\/$/, "");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A Summertime-branded email: logo, title, body paragraphs, an optional button, a footer line. */
export function brandedEmail(m: { title: string; paragraphs: string[]; button?: { label: string; href: string }; footer: string }): string {
  const p = m.paragraphs.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#4a4a47">${esc(t)}</p>`).join("");
  const btn = m.button
    ? `<p style="margin:22px 0 6px"><a href="${esc(m.button.href)}" style="display:inline-block;background:#0b0a09;color:#f3f2ee;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:999px">${esc(m.button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2ee;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px"><img src="${WEB_URL}/brand/summertime-email-logo.png" width="180" height="90" alt="Summertime" style="display:block;width:180px;height:90px;margin-left:-22px"></td></tr>
<tr><td style="background:#faf9f6;border:1px solid #e3e1da;border-radius:22px;padding:28px 26px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0b0a09;letter-spacing:-0.01em">${esc(m.title)}</h1>${p}${btn}
</td></tr>
<tr><td style="padding:18px 6px 0;font-size:12px;line-height:1.5;color:#63625e">${esc(m.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) || process.env.NODE_ENV !== "production";
}

function sender(): { name: string; email: string } {
  const raw = process.env.EMAIL_FROM ?? "Summertime <no-reply@summertime.app>";
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  return m ? { name: m[1] || "Summertime", email: m[2]! } : { name: "Summertime", email: raw.trim() };
}

export async function sendMail(ctx: { db: Db; log: Logger }, mail: Mail): Promise<void> {
  const from = sender();
  if (process.env.BREVO_API_KEY) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: from, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, ...(mail.html ? { htmlContent: mail.html } : {}) }),
    });
    if (!res.ok) throw new Error(`Brevo answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}) }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("no email provider configured");
  await ctx.db.query("INSERT INTO mail_outbox (to_email, subject, body) VALUES ($1, $2, $3)", [mail.to, mail.subject, mail.text]);
  ctx.log.warn({ to: mail.to, subject: mail.subject }, "no email provider: message written to mail_outbox");
}
