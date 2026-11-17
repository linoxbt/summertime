import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { T, formatCbm, formatUsdc, type ExplorerContract, type ExplorerPane, type TemplateName } from "@summertime/ledger";
import type { AppContext } from "../context.ts";
import { createSession, destroySession, me, requireUser, sessionUser } from "../auth.ts";
import { ApiError, forbidden, notFound } from "../errors.ts";
import { idempotent } from "../idempotency.ts";
import { amount, balance, partyLedger, receiptDto } from "../reads.ts";

export function commonRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/healthz", async () => ({ ok: true }));

  // ---- Authentication ------------------------------------------------------------------------

  /** The session user for a users.id, in the shape /auth/me returns. */
  async function userDto(id: string) {
    const r = await ctx.db.query<{ id: string; handle: string; display_name: string; role: string; party_id: string; mode: string }>(
      "SELECT u.id, u.handle, u.display_name, u.role, p.party_id, p.mode FROM users u JOIN party_links p ON p.user_id = u.id WHERE u.id = $1",
      [id],
    );
    const u = r.rows[0]!;
    return { id: u.id, handle: u.handle, displayName: u.display_name, role: u.role, party: u.party_id, mode: u.mode };
  }

  // Email one-time codes. Codes are 6 digits, stored only as a keyed hash, valid for 10
  // minutes and 5 attempts; a new code cancels older ones. There is no email provider yet,
  // so codes are only issued in demo mode, where the code is returned for the page to show.
  const CODE_TTL_MINUTES = 10;
  const MAX_ATTEMPTS = 5;
  const MAX_CODES_PER_WINDOW = 5;
  const emailField = z.string().trim().toLowerCase().email().max(254);
  const codeHash = (email: string, code: string) => createHash("sha256").update(ctx.config.sessionSecret).update("\0login\0").update(email).update("\0").update(code).digest("hex");

  app.post("/auth/code/start", async (req) => {
    const { email } = z.object({ email: emailField }).parse(req.body);
    if (!ctx.config.demoMode) throw new ApiError(503, "CODE_DELIVERY_UNAVAILABLE", "Email delivery is not configured yet.");
    const user = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE lower(email) = $1", [email]);
    const recent = await ctx.db.query<{ n: string }>(
      "SELECT count(*) AS n FROM login_codes WHERE lower(email) = $1 AND created_at > now() - interval '10 minutes'",
      [email],
    );
    if (Number(recent.rows[0]!.n) >= MAX_CODES_PER_WINDOW) throw new ApiError(429, "TOO_MANY_CODES", "Too many codes requested. Try again in a few minutes.");
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await ctx.db.query("UPDATE login_codes SET consumed_at = now() WHERE lower(email) = $1 AND consumed_at IS NULL", [email]);
    await ctx.db.query(`INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '${CODE_TTL_MINUTES} minutes')`, [
      email,
      codeHash(email, code),
    ]);
    return { data: { sent: true, expiresInSeconds: CODE_TTL_MINUTES * 60, accountExists: Boolean(user.rows[0]), demoCode: code } };
  });

  app.post("/auth/code/verify", async (req, reply) => {
    const { email, code, profile } = z
      .object({
        email: emailField,
        code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
        profile: z.object({ displayName: z.string().trim().min(2).max(60), role: z.enum(["importer", "forwarder"]) }).optional(),
      })
      .parse(req.body);
    const existing = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE lower(email) = $1", [email]);
    if (!existing.rows[0] && !profile) throw new ApiError(400, "PROFILE_REQUIRED", "Tell us your company name and role to create your account.");
    const r = await ctx.db.query<{ id: string; code_hash: string; attempts: number }>(
      "SELECT id, code_hash, attempts FROM login_codes WHERE lower(email) = $1 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1",
      [email],
    );
    const row = r.rows[0];
    if (!row) throw new ApiError(400, "CODE_EXPIRED", "That code has expired. Request a new one.");
    if (row.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Request a new one.");
    const expected = Buffer.from(row.code_hash, "hex");
    const given = Buffer.from(codeHash(email, code), "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await ctx.db.query("UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
      throw new ApiError(400, "INVALID_CODE", "That code isn't right.");
    }
    const used = await ctx.db.query("UPDATE login_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id", [row.id]);
    if (!used.rowCount) throw new ApiError(400, "CODE_EXPIRED", "That code has expired. Request a new one.");
    const userId = existing.rows[0]?.id ?? (await createAccount(ctx, email, profile!));
    await createSession(ctx, userId, reply);
    return { data: await userDto(userId) };
  });

  // Demo shortcut: sign in by choosing a seeded account.
  app.get("/auth/demo-accounts", async () => {
    if (!ctx.config.demoMode) throw forbidden("Demo sign-in is disabled.");
    const r = await ctx.db.query<{ handle: string; display_name: string; role: string; email: string | null }>(
      "SELECT handle, display_name, role, email FROM users ORDER BY CASE role WHEN 'forwarder' THEN 0 WHEN 'importer' THEN 1 ELSE 2 END, display_name",
    );
    return { data: r.rows.map((x) => ({ handle: x.handle, displayName: x.display_name, role: x.role, email: x.email })) };
  });

  app.post("/auth/demo-login", async (req, reply) => {
    if (!ctx.config.demoMode) throw forbidden("Demo sign-in is disabled.");
    const { handle } = z.object({ handle: z.string().min(1) }).parse(req.body);
    const r = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE handle = $1", [handle]);
    const row = r.rows[0];
    if (!row) throw notFound("Account");
    await createSession(ctx, row.id, reply);
    return { data: await userDto(row.id) };
  });

  app.post("/auth/logout", async (req, reply) => {
    await destroySession(ctx, req, reply);
    return { data: { ok: true } };
  });

  app.get("/auth/me", async (req) => {
    const user = await sessionUser(ctx, req);
    if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
    return { data: user };
  });

  // ---- Any signed-in user ------------------------------------------------------------------

  app.get("/me/receipts", { preHandler: requireUser(ctx) }, async (req) => {
    const L = await partyLedger(ctx, me(req).party);
    const data = await Promise.all(L.receipts.map((r) => receiptDto(ctx, r)));
    return { data: data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  });

  app.get("/me/balance", { preHandler: requireUser(ctx) }, async (req) => {
    const d = await ctx.deployment();
    const b = await balance(ctx, me(req).party);
    return { data: { available: amount(b.available), locked: amount(b.locked), instrument: d.instrument.symbol } };
  });

  // ---- Privacy explorer (demo only, F-12) --------------------------------------------------

  app.get("/explorer/campaigns", { preHandler: requireUser(ctx) }, async () => {
    if (!ctx.config.demoMode) throw forbidden("The privacy explorer is available only in the demo environment.");
    const r = await ctx.db.query<{ campaign_id: string; title: string }>("SELECT campaign_id, title FROM campaign_index ORDER BY created_at DESC LIMIT 50");
    return { data: r.rows.map((x) => ({ campaignId: x.campaign_id, title: x.title })) };
  });

  app.get<{ Params: { campaignId: string }; Querystring: { as?: string } }>("/explorer/:campaignId", { preHandler: requireUser(ctx) }, async (req) => {
    if (!ctx.config.demoMode) throw new ApiError(403, "DISABLED", "The privacy explorer is available only in the demo environment.");
    const handle = req.query.as;
    if (!handle) throw new ApiError(400, "VALIDATION", "Choose a party to view as.");
    const viewer = await ctx.directory.byHandle(handle);
    if (!viewer) throw notFound("Account");
    const role = (await ctx.db.query<{ role: string }>("SELECT role FROM users WHERE handle = $1", [handle])).rows[0]?.role ?? "unknown";
    // Read from this party's own ledger view: exactly what its participant would show it.
    const all = await ctx.ledger.activeContracts<Record<string, unknown>>([viewer.party], { templates: Object.values(T) });
    const name = (templateId: string) => (Object.keys(T) as TemplateName[]).find((k) => templateId.endsWith(T[k].slice(T[k].indexOf(":")))) ?? templateId;
    const contracts: ExplorerContract[] = [];
    for (const c of all) {
      if ((c.payload as { campaignId?: string }).campaignId !== req.params.campaignId) continue;
      contracts.push({
        contractId: c.contractId,
        template: name(c.templateId),
        signatories: await Promise.all(c.signatories.map(async (p) => (await ctx.directory.ref(p)).displayName)),
        observers: await Promise.all(c.observers.map(async (p) => (await ctx.directory.ref(p)).displayName)),
        summary: await summarize(ctx, c.payload),
      });
    }
    contracts.sort((a, b) => a.template.localeCompare(b.template));
    const pane: ExplorerPane = { viewer: { ...viewer, role }, contracts };
    return { data: pane };
  });

  // ---- Development faucet ------------------------------------------------------------------

  app.post("/dev/faucet", { preHandler: requireUser(ctx) }, async (req, reply) => {
    if (!ctx.config.demoMode) throw forbidden("The faucet is available only in the demo environment.");
    const { amountUsdc } = z.object({ amountUsdc: z.string().regex(/^\d{1,7}(\.\d{1,6})?$/) }).parse(req.body);
    const user = me(req);
    const res = await idempotent(ctx, req, async () => {
      const r = await fetch(new URL("/dev/mint", ctx.config.registryUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: user.party, amount: amountUsdc }),
      });
      if (!r.ok) throw new ApiError(502, "REGISTRY_UNAVAILABLE", "The test faucet is not available.");
      return (await r.json()) as { updateId: string };
    });
    return reply.code(res.status).send(res.body);
  });
}

/** Human-readable key fields of a Summertime contract, with party IDs replaced by names. */
async function summarize(ctx: AppContext, p: Record<string, unknown>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const parties = ["forwarder", "operator", "importer"] as const;
  for (const k of parties) if (typeof p[k] === "string") out[k] = (await ctx.directory.ref(p[k] as string)).displayName;
  const terms = p.terms as Record<string, string> | undefined;
  if (typeof p.reservedMilliCbm === "string") out.reserved = `${formatCbm(p.reservedMilliCbm)} CBM`;
  if (typeof p.lockedMicroUsdc === "string") out.locked = `${formatUsdc(p.lockedMicroUsdc)} USDCx`;
  if (typeof p.bonusMicroUsdc === "string") out.bonus = `${formatUsdc(p.bonusMicroUsdc, 6)} USDCx`;
  if (typeof p.heldMilliCbm === "string") out.held = `${formatCbm(p.heldMilliCbm)} CBM (running total)`;
  if (typeof p.reservedCbmRounded === "string") out.progress = p.hidden ? "hidden (< 3 participants)" : `${p.reservedCbmRounded} CBM`;
  if (typeof p.kind === "string") out.kind = p.kind as string;
  if (typeof p.result === "string") out.result = p.result as string;
  if (typeof p.locked === "boolean") out.bondLocked = String(p.locked);
  if (typeof p.amountMicroUsdc === "string") out.amount = `${formatUsdc(p.amountMicroUsdc)} USDCx`;
  if (typeof p.bookingRef === "string") out.booking = `${p.bookingRef}, ETD ${p.etd}${p.containerNo ? `, ${p.containerNo}` : ""}`;
  if (typeof p.subject === "string") out.dispute = p.subject as string;
  if (typeof p.resolution === "string") out.resolution = p.resolution as string;
  if (terms?.thresholdMilliCbm && !out.reserved) out.threshold = `${formatCbm(terms.thresholdMilliCbm)} CBM`;
  if (terms?.bondMicroUsdc && "bondCid" in p) out.bond = `${formatUsdc(terms.bondMicroUsdc)} USDCx`;
  return out;
}

/**
 * Create a pilot-hosted account for a new email: a ledger party and Ledger API user of its
 * own, the user row and party link, and (demo mode) a test USDCx balance from the registry.
 * Returns the users.id. Safe against two sign-ups racing for the same email.
 */
async function createAccount(ctx: AppContext, email: string, profile: { displayName: string; role: "importer" | "forwarder" }): Promise<string> {
  const base =
    email
      .split("@")[0]!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "user";
  const handle = `${base}-${randomBytes(3).toString("hex")}`;
  const party = await ctx.ledger.allocateParty(`${handle}-${Date.now().toString(36)}`);
  await ctx.ledger.createUser(`u-${handle}`, party, [party]);

  const client = await ctx.db.connect();
  let userId: string;
  try {
    await client.query("BEGIN");
    const u = await client.query<{ id: string }>(
      "INSERT INTO users (handle, display_name, role, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id",
      [handle, profile.displayName, profile.role, email],
    );
    if (!u.rows[0]) {
      // Someone else created this email's account first; use theirs.
      await client.query("ROLLBACK");
      const other = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE lower(email) = $1", [email]);
      return other.rows[0]!.id;
    }
    userId = u.rows[0].id;
    await client.query("INSERT INTO party_links (user_id, party_id, mode) VALUES ($1, $2, 'pilot')", [userId, party]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  if (ctx.config.demoMode) {
    const amount = profile.role === "forwarder" ? "5000" : "20000";
    const r = await fetch(new URL("/dev/mint", ctx.config.registryUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: party, amount }),
    }).catch(() => undefined);
    if (!r?.ok) ctx.log.warn({ handle }, "could not fund the new account; the faucet can top it up");
  }
  return userId;
}
