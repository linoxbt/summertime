import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ContactMessageDto, NotificationDto, NotificationList, Preferences } from "@summertime/ledger";
import { mailConfigured, sendMail } from "@summertime/platform";
import type { AppContext } from "../context.ts";
import { destroySession, me, requireUser } from "../auth.ts";
import { ApiError, conflict, forbidden, notFound } from "../errors.ts";
import { partyLedger } from "../reads.ts";

const CONTACT_PER_IP_PER_HOUR = 5;

/** Notifications, preferences, account deletion and the public contact form. */
export function accountRoutes(app: FastifyInstance, ctx: AppContext) {
  const signedIn = { preHandler: requireUser(ctx) };

  // ---- Notifications ---------------------------------------------------------------------

  app.get("/notifications", signedIn, async (req): Promise<{ data: NotificationList }> => {
    const user = me(req);
    const [items, unread] = await Promise.all([
      ctx.db.query<{ id: string; kind: string; title: string; body: string; link: string | null; created_at: Date; read_at: Date | null }>(
        "SELECT id, kind, title, body, link, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50",
        [user.id],
      ),
      ctx.db.query<{ n: string }>("SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [user.id]),
    ]);
    const data: NotificationDto[] = items.rows.map((r) => ({
      id: String(r.id),
      kind: r.kind,
      title: r.title,
      body: r.body,
      link: r.link,
      createdAt: r.created_at.toISOString(),
      read: r.read_at !== null,
    }));
    return { data: { items: data, unread: Number(unread.rows[0]?.n ?? 0) } };
  });

  app.post("/notifications/read", signedIn, async (req) => {
    const user = me(req);
    const { ids } = z.object({ ids: z.array(z.string().regex(/^\d+$/)).max(200).optional() }).parse(req.body ?? {});
    if (ids?.length) await ctx.db.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::bigint[])", [user.id, ids]);
    else await ctx.db.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [user.id]);
    return { data: { ok: true } };
  });

  // ---- Preferences -----------------------------------------------------------------------

  const prefs = async (userId: string): Promise<Preferences> => {
    const r = await ctx.db.query<{ notify_email: boolean }>("SELECT notify_email FROM users WHERE id = $1", [userId]);
    return { notifyEmail: r.rows[0]?.notify_email ?? false, emailAvailable: process.env.NODE_ENV !== "production" || Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) };
  };

  app.get("/me/preferences", signedIn, async (req) => ({ data: await prefs(me(req).id) }));

  app.post("/me/preferences", signedIn, async (req) => {
    const user = me(req);
    const { notifyEmail } = z.object({ notifyEmail: z.boolean() }).parse(req.body);
    if (user.kind !== "member") throw forbidden("Demo accounts don't receive email.");
    await ctx.db.query("UPDATE users SET notify_email = $2 WHERE id = $1", [user.id, notifyEmail]);
    return { data: await prefs(user.id) };
  });

  // ---- Account deletion ------------------------------------------------------------------

  /**
   * Delete your own account. Ledger records are permanent, so the user row stays (the party is
   * named in other people's history) but every personal detail is removed and sign-in ends.
   * Refused while money or obligations are still open.
   */
  app.post("/auth/account/delete", signedIn, async (req, reply) => {
    const user = me(req);
    z.object({ confirm: z.literal("DELETE") }).parse(req.body);
    if (user.kind !== "member") throw forbidden("Demo accounts are shared and can't be deleted.");
    if (user.role === "operator") throw forbidden("The operator account can't be deleted here.");
    const L = await partyLedger(ctx, user.party);
    const open: string[] = [];
    if (user.role === "forwarder") {
      if (L.proposals.some((x) => x.payload.forwarder === user.party)) open.push("a campaign waiting for approval");
      if (L.campaigns.some((x) => x.payload.forwarder === user.party)) open.push("an open campaign");
      if (L.bonds.some((x) => x.payload.forwarder === user.party)) open.push("a bond not yet returned");
      if (L.disputes.some((x) => x.payload.forwarder === user.party)) open.push("an open dispute");
    } else {
      if (L.requests.some((x) => x.payload.importer === user.party) || L.reservations.some((x) => x.payload.importer === user.party)) open.push("a reservation");
      if (L.commitments.some((x) => x.payload.importer === user.party)) open.push("locked funds");
      if (L.entitlements.some((x) => x.payload.importer === user.party) || L.payouts.some((x) => x.payload.importer === user.party)) open.push("a bonus on its way");
      if (L.disputes.some((x) => x.payload.importer === user.party)) open.push("an open dispute");
    }
    if (open.length) throw conflict("ACCOUNT_BUSY", `You still have ${open.join(", ")}. Finish or cancel ${open.length > 1 ? "them" : "it"} first.`);

    const email = user.email?.toLowerCase() ?? "";
    const client = await ctx.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE users SET email = NULL, display_name = 'Deleted account', contact = NULL, password_hash = NULL,
                          privy_did = NULL, notify_email = false, deleted_at = now() WHERE id = $1`,
        [user.id],
      );
      for (const q of ["DELETE FROM sessions WHERE user_id = $1", "DELETE FROM notifications WHERE user_id = $1", "DELETE FROM idempotency_keys WHERE user_id = $1"])
        await client.query(q, [user.id]);
      if (email)
        for (const q of [
          "DELETE FROM login_codes WHERE lower(email) = $1",
          "DELETE FROM auth_attempts WHERE lower(email) = $1",
          "DELETE FROM mail_outbox WHERE lower(to_email) = $1",
          "DELETE FROM contact_messages WHERE lower(email) = $1",
        ])
          await client.query(q, [email]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    await destroySession(ctx, req, reply);
    req.log.info({ user: user.id }, "account deleted");
    return { data: { deleted: true } };
  });

  // ---- Contact ---------------------------------------------------------------------------

  const ContactBody = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    company: z.string().trim().max(160).optional(),
    topic: z.enum(["pilot", "support", "privacy", "partnership", "other"]),
    message: z.string().trim().min(10).max(4000),
    website: z.string().max(0).optional(), // honeypot: people leave it empty
  });

  app.post("/contact", async (req, reply) => {
    const body = ContactBody.parse(req.body);
    const recent = await ctx.db.query<{ n: string }>("SELECT count(*) AS n FROM contact_messages WHERE ip = $1 AND created_at > now() - interval '1 hour'", [req.ip]);
    if (Number(recent.rows[0]?.n ?? 0) >= CONTACT_PER_IP_PER_HOUR) throw new ApiError(429, "RATE_LIMITED", "Too many messages. Please try again later.");
    const r = await ctx.db.query<{ id: string }>(
      "INSERT INTO contact_messages (name, email, company, topic, message, ip) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [body.name, body.email, body.company || null, body.topic, body.message, req.ip],
    );
    // Optional copy to an inbox; the operator also reads messages on the Operations page.
    const inbox = process.env.CONTACT_INBOX;
    if (inbox && mailConfigured()) {
      sendMail(ctx, {
        to: inbox,
        subject: `Contact: ${body.topic} from ${body.name}`,
        text: `${body.name} <${body.email}>${body.company ? `, ${body.company}` : ""}\nTopic: ${body.topic}\n\n${body.message}`,
      }).catch((e) => ctx.log.warn({ err: String(e).slice(0, 200) }, "contact copy email failed"));
    }
    return reply.code(201).send({ data: { received: true, id: String(r.rows[0]!.id) } });
  });

  app.get("/ops/contact", { preHandler: requireUser(ctx, "operator") }, async (): Promise<{ data: ContactMessageDto[] }> => {
    const r = await ctx.db.query<{ id: string; name: string; email: string; company: string | null; topic: string; message: string; created_at: Date; handled_at: Date | null }>(
      "SELECT id, name, email, company, topic, message, created_at, handled_at FROM contact_messages ORDER BY created_at DESC LIMIT 100",
    );
    return {
      data: r.rows.map((x) => ({ id: String(x.id), name: x.name, email: x.email, company: x.company, topic: x.topic, message: x.message, createdAt: x.created_at.toISOString(), handled: x.handled_at !== null })),
    };
  });

  app.post<{ Params: { id: string } }>("/ops/contact/:id/handled", { preHandler: requireUser(ctx, "operator") }, async (req) => {
    if (!/^\d+$/.test(req.params.id)) throw notFound("No such message.");
    const r = await ctx.db.query("UPDATE contact_messages SET handled_at = now() WHERE id = $1 AND handled_at IS NULL", [req.params.id]);
    if (r.rowCount === 0) throw notFound("No such message, or it's already handled.");
    return { data: { handled: true } };
  });
}
