import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { T, formatCbm, formatUsdc, type ExplorerContract, type ExplorerPane, type TemplateName } from "@summertime/ledger";
import type { AppContext } from "../context.ts";
import { me, requireUser } from "../auth.ts";
import { ApiError, forbidden, notFound } from "../errors.ts";
import { idempotent } from "../idempotency.ts";
import { amount, balance, partyLedger, receiptDto } from "../reads.ts";

export function commonRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/healthz", async () => ({ ok: true }));

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

  // Shows other parties' ledger views, so it is limited to demo accounts and demo campaigns.
  const demoOnly = (req: { user?: { kind: string } }) => {
    if (!ctx.config.demoMode || req.user?.kind !== "demo") throw new ApiError(403, "DISABLED", "The privacy explorer is part of the demo.");
  };

  app.get("/explorer/campaigns", { preHandler: requireUser(ctx) }, async (req) => {
    demoOnly(req);
    const r = await ctx.db.query<{ campaign_id: string; title: string }>(
      `SELECT c.campaign_id, c.title FROM campaign_index c
         JOIN party_links p ON p.party_id = c.forwarder_party JOIN users u ON u.id = p.user_id
        WHERE u.kind = 'demo' ORDER BY c.created_at DESC LIMIT 50`,
    );
    return { data: r.rows.map((x) => ({ campaignId: x.campaign_id, title: x.title })) };
  });

  app.get<{ Params: { campaignId: string }; Querystring: { as?: string } }>("/explorer/:campaignId", { preHandler: requireUser(ctx) }, async (req) => {
    demoOnly(req);
    const handle = req.query.as;
    if (!handle) throw new ApiError(400, "VALIDATION", "Choose a party to view as.");
    const acct = (await ctx.db.query<{ role: string }>("SELECT role FROM users WHERE handle = $1 AND kind = 'demo'", [handle])).rows[0];
    const viewer = acct ? await ctx.directory.byHandle(handle) : undefined;
    if (!viewer || !acct) throw notFound("Demo account");
    const role = acct.role;
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
    if ((await ctx.deployment()).network !== "sandbox") throw forbidden("Test USDCx is available only on the test network.");
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

