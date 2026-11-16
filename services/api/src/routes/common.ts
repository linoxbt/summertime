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

  // ---- Authentication (demo mode) ---------------------------------------------------------

  app.get("/auth/demo-accounts", async () => {
    if (!ctx.config.demoMode) throw forbidden("Demo sign-in is disabled.");
    const r = await ctx.db.query<{ handle: string; display_name: string; role: string }>(
      "SELECT handle, display_name, role FROM users ORDER BY CASE role WHEN 'forwarder' THEN 0 WHEN 'importer' THEN 1 ELSE 2 END, display_name",
    );
    return { data: r.rows.map((x) => ({ handle: x.handle, displayName: x.display_name, role: x.role })) };
  });

  app.post("/auth/demo-login", async (req, reply) => {
    if (!ctx.config.demoMode) throw forbidden("Demo sign-in is disabled.");
    const { handle } = z.object({ handle: z.string().min(1) }).parse(req.body);
    const r = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE handle = $1", [handle]);
    const row = r.rows[0];
    if (!row) throw notFound("Account");
    await createSession(ctx, row.id, reply);
    const r2 = await ctx.db.query<{ id: string; handle: string; display_name: string; role: string; party_id: string; mode: string }>(
      "SELECT u.id, u.handle, u.display_name, u.role, p.party_id, p.mode FROM users u JOIN party_links p ON p.user_id = u.id WHERE u.id = $1",
      [row.id],
    );
    const u = r2.rows[0]!;
    return { data: { id: u.id, handle: u.handle, displayName: u.display_name, role: u.role, party: u.party_id, mode: u.mode } };
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
  if (terms?.thresholdMilliCbm && !out.reserved) out.threshold = `${formatCbm(terms.thresholdMilliCbm)} CBM`;
  if (terms?.bondMicroUsdc && "bondCid" in p) out.bond = `${formatUsdc(terms.bondMicroUsdc)} USDCx`;
  return out;
}
