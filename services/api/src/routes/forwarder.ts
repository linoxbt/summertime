import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  CAMPAIGN_META_KEY,
  I,
  T,
  extraArgsFrom,
  formatCbm,
  formatUsdc,
  parseUnits,
  phaseOf,
  toTokenDecimal,
  type CampaignStatus,
  type CampaignTerms,
  type ForwarderCampaignDetail,
  type ForwarderCampaignSummary,
  type ReservationRow,
  type ReservationStage,
  type SettleLeg,
} from "@summertime/ledger";
import type { AppContext } from "../context.ts";
import { me, requireUser } from "../auth.ts";
import { ApiError, conflict, invalid, notFound } from "../errors.ts";
import { idempotent } from "../idempotency.ts";
import {
  amount,
  balance,
  campaignLabels,
  capacity,
  liveAllocations,
  outcomeDto,
  partyLedger,
  selectHoldings,
  termsDto,
  updateIdFor,
  bookingDto,
  disputeDtos,
  type CampaignLabel,
  type PartyLedger,
} from "../reads.ts";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "must be a decimal number");

const NewCampaign = z.object({
  title: z.string().trim().min(3).max(120),
  route: z.string().trim().max(120).optional(),
  capacityCbm: decimal,
  thresholdCbm: decimal,
  ratePerCbm: decimal,
  minCbm: decimal,
  maxCbm: decimal,
  lockTime: z.string().datetime({ offset: true }),
  deadline: z.string().datetime({ offset: true }),
  bondUsdc: decimal,
  claimWindowDays: z.number().int().min(1).max(365).default(90),
});

/** Build ledger terms from the wizard input, applying the same rules as the Daml ensure clause. */
export function buildTerms(input: z.infer<typeof NewCampaign>, instrument: { admin: string; id: string; decimals: number }): CampaignTerms {
  const cap = parseUnits(input.capacityCbm, 3);
  const threshold = parseUnits(input.thresholdCbm, 3);
  const min = parseUnits(input.minCbm, 3);
  const max = parseUnits(input.maxCbm, 3);
  const ratePerCbmMicro = parseUnits(input.ratePerCbm, 6);
  const bond = parseUnits(input.bondUsdc, 6);
  if (ratePerCbmMicro % 1000n !== 0n) throw invalid("INVALID_TERMS", "Rate per CBM must be a multiple of 0.001 USDCx.");
  const rate = ratePerCbmMicro / 1000n;
  const lock = new Date(input.lockTime);
  const deadline = new Date(input.deadline);
  const claimEnd = new Date(deadline.getTime() + input.claimWindowDays * 86_400_000);
  const full = cap * rate;
  const problems: string[] = [];
  if (cap <= 0n) problems.push("capacity must be positive");
  if (threshold <= 0n || threshold > cap) problems.push("threshold must be between 0 and the container capacity");
  if (rate <= 0n) problems.push("rate must be positive");
  if (min < 1000n) problems.push("minimum reservation must be at least 1 CBM");
  if (min > max) problems.push("minimum reservation must not exceed the maximum");
  if (max > cap) problems.push("maximum reservation must not exceed the container capacity");
  if (lock.getTime() <= Date.now()) problems.push("lock time must be in the future");
  if (lock >= deadline) problems.push("lock time must be before the deadline");
  if (bond * 100n < full || bond * 100n > full * 5n) problems.push(`bond must be 1–5% of the full-capacity value (${formatUsdc(full / 100n)}–${formatUsdc(full / 20n)} USDCx)`);
  if (problems.length) throw invalid("INVALID_TERMS", problems.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(". ") + ".");
  return {
    containerCapacityMilliCbm: cap.toString(),
    thresholdMilliCbm: threshold.toString(),
    rateMicroUsdcPerMilliCbm: rate.toString(),
    minReservationMilliCbm: min.toString(),
    maxReservationMilliCbm: max.toString(),
    lockTime: lock.toISOString(),
    deadline: deadline.toISOString(),
    instrumentId: { admin: instrument.admin, id: instrument.id },
    tokenDecimals: instrument.decimals.toString(),
    bondMicroUsdc: bond.toString(),
    claimWindowEnd: claimEnd.toISOString(),
  };
}

interface CampaignState {
  id: string;
  label: CampaignLabel;
  status: CampaignStatus;
  terms: CampaignTerms;
  proposal?: PartyLedger["proposals"][number];
  campaign?: PartyLedger["campaigns"][number];
  bond?: PartyLedger["bonds"][number];
  outcome?: PartyLedger["outcomes"][number];
  committed: bigint;
  committedCount: number;
}

function stateOf(L: PartyLedger, id: string, label: CampaignLabel, now = new Date()): CampaignState {
  const proposal = L.proposals.find((c) => c.payload.campaignId === id);
  const campaign = L.campaigns.find((c) => c.payload.campaignId === id);
  const bond = L.bonds.find((c) => c.payload.campaignId === id);
  const outcome = L.outcomes.find((c) => c.payload.campaignId === id);
  const terms = campaign?.payload.terms ?? proposal?.payload.terms ?? bond?.payload.terms ?? label.terms;
  const commitments = L.commitments.filter((c) => c.payload.campaignId === id);
  let status: CampaignStatus;
  if (outcome) status = outcome.payload.result.toLowerCase() as CampaignStatus;
  else if (campaign) status = phaseOf(terms, now) === "open" ? "open" : phaseOf(terms, now) === "locked" ? "locked" : "expired";
  else if (proposal) status = "proposed";
  else status = "withdrawn";
  return {
    id,
    label,
    status,
    terms,
    proposal,
    campaign,
    bond,
    outcome,
    // Settled commitments are archived; after success, report what settled.
    committed:
      outcome?.payload.result === "Succeeded"
        ? BigInt(outcome.payload.settledMilliCbm)
        : commitments.reduce((a, c) => a + BigInt(c.payload.reservedMilliCbm), 0n),
    committedCount: outcome?.payload.result === "Succeeded" ? Number(outcome.payload.legCount) : commitments.length,
  };
}

async function summary(ctx: AppContext, s: CampaignState): Promise<ForwarderCampaignSummary> {
  return {
    campaignId: s.id,
    title: s.label.title,
    route: s.label.route,
    status: s.status,
    terms: termsDto(s.terms),
    held: capacity(s.campaign?.payload.heldMilliCbm ?? "0"),
    committed: capacity(s.committed),
    committedCount: s.committedCount,
    thresholdMet: s.committed >= BigInt(s.terms.thresholdMilliCbm),
    outcome: s.outcome ? await outcomeDto(ctx, s.outcome.payload) : undefined,
    createdAt: s.label.createdAt,
  };
}

async function ownedCampaign(ctx: AppContext, party: string, id: string): Promise<{ L: PartyLedger; s: CampaignState }> {
  const labels = await campaignLabels(ctx, [id]);
  const label = labels.get(id);
  if (!label || label.forwarderParty !== party) throw notFound("Campaign");
  const L = await partyLedger(ctx, party);
  return { L, s: stateOf(L, id, label) };
}

export function forwarderRoutes(app: FastifyInstance, ctx: AppContext) {
  const guard = { preHandler: requireUser(ctx, "forwarder") };

  app.get("/campaigns", guard, async (req) => {
    const user = me(req);
    const r = await ctx.db.query<{ campaign_id: string }>(
      "SELECT campaign_id FROM campaign_index WHERE forwarder_party = $1 ORDER BY created_at DESC",
      [user.party],
    );
    const ids = r.rows.map((x) => x.campaign_id);
    const [labels, L] = await Promise.all([campaignLabels(ctx, ids), partyLedger(ctx, user.party)]);
    const out = await Promise.all(ids.map((id) => summary(ctx, stateOf(L, id, labels.get(id)!))));
    return { data: out };
  });

  app.post("/campaigns", guard, async (req, reply) => {
    const user = me(req);
    const input = NewCampaign.parse(req.body);
    const d = await ctx.deployment();
    const terms = buildTerms(input, d.instrument);
    const res = await idempotent(ctx, req, async (i) => {
      const campaignId = `cmp-${randomBytes(5).toString("hex")}`;
      await ctx.db.query(
        "INSERT INTO campaign_index (campaign_id, forwarder_party, title, route, terms_snapshot) VALUES ($1, $2, $3, $4, $5)",
        [campaignId, user.party, input.title, input.route ?? null, JSON.stringify(terms)],
      );
      const out = await ctx.commands.run(
        "campaign.propose",
        {
          commandId: i.commandId("propose"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [
            {
              CreateCommand: {
                templateId: T.CampaignProposal,
                createArguments: { forwarder: user.party, operator: d.operatorParty, auditor: null, campaignId, terms },
              },
            },
          ],
        },
        campaignId,
      );
      return { campaignId, updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.get<{ Params: { id: string } }>("/campaigns/:id", guard, async (req) => {
    const user = me(req);
    const { L, s } = await ownedCampaign(ctx, user.party, req.params.id);
    const live = await liveAllocations(ctx, user.party);
    const rows: ReservationRow[] = [];
    const ref = (p: string) => ctx.directory.ref(p);
    for (const r of L.requests.filter((c) => c.payload.campaignId === s.id)) {
      rows.push({
        reservationId: r.payload.reservationId,
        importer: await ref(r.payload.importer),
        stage: "requested",
        reserved: capacity(r.payload.reservedMilliCbm),
        locked: amount(BigInt(r.payload.reservedMilliCbm) * BigInt(s.terms.rateMicroUsdcPerMilliCbm)),
        contractId: r.contractId,
      });
    }
    for (const r of L.reservations.filter((c) => c.payload.campaignId === s.id)) {
      rows.push({
        reservationId: r.payload.reservationId,
        importer: await ref(r.payload.importer),
        stage: "reserved",
        reserved: capacity(r.payload.reservedMilliCbm),
        locked: amount(r.payload.lockedMicroUsdc),
        contractId: r.contractId,
      });
    }
    for (const c of L.commitments.filter((x) => x.payload.campaignId === s.id)) {
      const ent = L.entitlements.find((e) => e.payload.commitmentCid === c.contractId);
      rows.push({
        reservationId: c.payload.reservationId,
        importer: await ref(c.payload.importer),
        stage: live.has(c.payload.allocationCid) ? "committed" : "allocation-withdrawn",
        reserved: capacity(c.payload.reservedMilliCbm),
        locked: amount(c.payload.lockedMicroUsdc),
        contractId: c.contractId,
        bonus: ent ? amount(ent.payload.bonusMicroUsdc) : undefined,
      });
    }
    for (const r of L.receipts.filter((x) => x.payload.campaignId === s.id && x.payload.kind === "Settled")) {
      rows.push({
        reservationId: r.payload.reservationId,
        importer: await ref(r.payload.importer),
        stage: "settled",
        reserved: capacity(r.payload.reservedMilliCbm),
        locked: amount(r.payload.amountMicroUsdc),
        contractId: r.contractId,
      });
    }
    const inv = await ctx.db.query<{ importer_party: string; invited_at: Date }>(
      "SELECT importer_party, invited_at FROM campaign_invitees WHERE campaign_id = $1 ORDER BY invited_at",
      [s.id],
    );
    const invitees = await Promise.all(
      inv.rows.map(async (row) => {
        const own = rows.filter((r) => r.importer.party === row.importer_party);
        const stillInvited = L.invitations.some((x) => x.payload.campaignId === s.id && x.payload.importer === row.importer_party);
        const stage: ReservationStage | "invited" | "declined" = own.at(-1)?.stage ?? (stillInvited ? "invited" : "declined");
        return { ...(await ref(row.importer_party)), invitedAt: row.invited_at.toISOString(), stage };
      }),
    );
    const liveCommitted = L.commitments
      .filter((c) => c.payload.campaignId === s.id && live.has(c.payload.allocationCid))
      .reduce((a, c) => a + BigInt(c.payload.reservedMilliCbm), 0n);
    const blockers: string[] = [];
    if (!s.campaign) blockers.push(s.status === "proposed" ? "The campaign is not open yet." : "The campaign is already final.");
    if (s.campaign && Date.now() >= Date.parse(s.terms.deadline)) blockers.push("The deadline has passed.");
    if (liveCommitted < BigInt(s.terms.thresholdMilliCbm))
      blockers.push(`Committed capacity (${formatCbm(liveCommitted)} CBM) is below the threshold (${formatCbm(s.terms.thresholdMilliCbm)} CBM).`);
    const bondSent = await updateIdFor(ctx, "campaign.bond", s.id);
    const bondStage: ForwarderCampaignDetail["bond"]["stage"] = s.bond
      ? s.bond.payload.locked
        ? "locked"
        : "escrowed"
      : s.campaign || s.outcome
        ? "settled"
        : bondSent
          ? "transfer-sent"
          : "awaiting-transfer";
    const detail: ForwarderCampaignDetail = {
      ...(await summary(ctx, s)),
      reservations: rows,
      bookings: await Promise.all(L.bookings.filter((b) => b.payload.campaignId === s.id).map((b) => bookingDto(ctx, b))),
      disputes: await disputeDtos(ctx, L, s.id),
      invitees,
      bond: { stage: bondStage, amount: amount(s.terms.bondMicroUsdc), transferUpdateId: bondSent },
      canExecute: blockers.length === 0,
      executeBlockers: blockers,
    };
    return { data: detail };
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/bond", guard, async (req, reply) => {
    const user = me(req);
    const { s } = await ownedCampaign(ctx, user.party, req.params.id);
    if (!s.proposal) throw conflict("ALREADY_FINAL", "The bond can only be sent while the campaign is awaiting acceptance.");
    const res = await idempotent(ctx, req, async () => {
      const d = await ctx.deployment();
      const bondMicro = BigInt(s.terms.bondMicroUsdc);
      const bal = await balance(ctx, user.party);
      const inputs = selectHoldings(bal.holdings, bondMicro);
      if (!inputs) throw conflict("INSUFFICIENT_BALANCE", `You need ${formatUsdc(bondMicro)} USDCx available to post the bond.`);
      const now = new Date();
      const choiceArgument = {
        expectedAdmin: d.instrument.admin,
        transfer: {
          sender: user.party,
          receiver: d.operatorParty,
          amount: toTokenDecimal(bondMicro, d.instrument.decimals),
          instrumentId: { admin: d.instrument.admin, id: d.instrument.id },
          requestedAt: new Date(now.getTime() - 1000).toISOString(),
          executeBefore: new Date(Date.parse(s.terms.lockTime)).toISOString(),
          inputHoldingCids: inputs,
          meta: { values: { [CAMPAIGN_META_KEY]: s.id } },
        },
        extraArgs: { context: { values: {} }, meta: { values: {} } },
      };
      const factory = await ctx.registry.transferFactory(choiceArgument);
      choiceArgument.extraArgs = extraArgsFrom(factory.choiceContext.choiceContextData);
      // One bond transfer per campaign, whatever the idempotency key.
      const out = await ctx.commands.run(
        "campaign.bond",
        {
          commandId: `bond:${s.id}`,
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: I.TransferFactory, contractId: factory.factoryId, choice: "TransferFactory_Transfer", choiceArgument } }],
          disclosedContracts: factory.choiceContext.disclosedContracts,
        },
        s.id,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.get("/importers", guard, async () => {
    const r = await ctx.db.query<{ party_id: string; display_name: string; handle: string }>(
      "SELECT p.party_id, u.display_name, u.handle FROM users u JOIN party_links p ON p.user_id = u.id WHERE u.role = 'importer' ORDER BY u.display_name",
    );
    return { data: r.rows.map((x) => ({ party: x.party_id, displayName: x.display_name, handle: x.handle })) };
  });

  app.post<{ Params: { id: string }; Body: { importers: string[] } }>("/campaigns/:id/invitations", guard, async (req, reply) => {
    const user = me(req);
    const body = z.object({ importers: z.array(z.string().min(1)).min(1).max(50) }).parse(req.body);
    const { s } = await ownedCampaign(ctx, user.party, req.params.id);
    if (!s.campaign || s.status !== "open") throw conflict("NOT_OPEN", "Invitations can be sent only while the campaign is open.");
    const res = await idempotent(ctx, req, async (i) => {
      const parties: string[] = [];
      for (const h of body.importers) {
        const p = h.includes("::") ? h : (await ctx.directory.byHandle(h))?.party;
        if (!p) throw invalid("UNKNOWN_IMPORTER", `Unknown importer: ${h}`);
        if (p === user.party) throw invalid("UNKNOWN_IMPORTER", "You cannot invite yourself.");
        parties.push(p);
      }
      const already = new Set(
        (await ctx.db.query<{ importer_party: string }>("SELECT importer_party FROM campaign_invitees WHERE campaign_id = $1", [s.id])).rows.map(
          (x) => x.importer_party,
        ),
      );
      const fresh = [...new Set(parties)].filter((p) => !already.has(p));
      if (fresh.length === 0) return { invited: 0 };
      const invitees = fresh.map((importer) => ({ importer, invitationId: `inv-${randomBytes(4).toString("hex")}` }));
      await ctx.commands.run(
        "campaign.invite",
        {
          commandId: i.commandId("invite"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.Campaign, contractId: s.campaign!.contractId, choice: "Campaign_Invite", choiceArgument: { invitees } } }],
        },
        s.id,
      );
      for (const x of invitees) {
        await ctx.db.query(
          "INSERT INTO campaign_invitees (campaign_id, importer_party, invitation_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
          [s.id, x.importer, x.invitationId],
        );
      }
      return { invited: invitees.length };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/execute", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const { L, s } = await ownedCampaign(ctx, user.party, req.params.id);
      if (s.outcome) throw conflict("ALREADY_FINAL", "This campaign has already finished.");
      if (!s.campaign) throw conflict("NOT_OPEN", "The campaign is not open.");
      if (Date.now() >= Date.parse(s.terms.deadline)) throw conflict("PAST_DEADLINE", "The deadline has passed; the campaign can no longer settle.");
      const live = await liveAllocations(ctx, user.party);
      const commitments = L.commitments.filter((c) => c.payload.campaignId === s.id && live.has(c.payload.allocationCid));
      const total = commitments.reduce((a, c) => a + BigInt(c.payload.reservedMilliCbm), 0n);
      if (total < BigInt(s.terms.thresholdMilliCbm)) {
        throw conflict("BELOW_THRESHOLD", `Only ${formatCbm(total)} of ${formatCbm(s.terms.thresholdMilliCbm)} CBM is committed.`);
      }
      const legs: SettleLeg[] = [];
      const disclosed = [];
      for (const c of commitments) {
        const ent = L.entitlements.find((e) => e.payload.commitmentCid === c.contractId);
        const ticket = L.tickets.find((t) => t.payload.commitmentCid === c.contractId);
        const bonusRef = ent ? { tag: "EntitlementRef" as const, value: ent.contractId } : ticket ? { tag: "TicketRef" as const, value: ticket.contractId } : undefined;
        if (!bonusRef) throw new ApiError(409, "STALE", "A commitment's bond record is changing (the bond lock is running). Try again in a moment.");
        const context = await ctx.registry.allocationContext(c.payload.allocationCid, "execute-transfer");
        disclosed.push(...context.disclosedContracts);
        legs.push({ commitmentCid: c.contractId, bonusRef, extraArgs: extraArgsFrom(context.choiceContextData) });
      }
      const out = await ctx.commands.run(
        "campaign.execute",
        {
          commandId: i.commandId(`execute-${s.id}`),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.Campaign, contractId: s.campaign.contractId, choice: "Campaign_Execute", choiceArgument: { included: legs } } }],
          disclosedContracts: disclosed,
        },
        s.id,
      );
      return { updateId: out.updateId, legCount: legs.length };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/fail", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const { s } = await ownedCampaign(ctx, user.party, req.params.id);
      if (s.outcome || !s.campaign) throw conflict("ALREADY_FINAL", "This campaign has already finished.");
      if (Date.now() < Date.parse(s.terms.deadline)) throw conflict("NOT_EXPIRED", "A campaign can be marked failed only after its deadline.");
      const out = await ctx.commands.run(
        "campaign.fail",
        {
          commandId: i.commandId(`fail-${s.id}`),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.Campaign, contractId: s.campaign.contractId, choice: "Campaign_Fail", choiceArgument: { actor: user.party } } }],
        },
        s.id,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/cancel", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const { s } = await ownedCampaign(ctx, user.party, req.params.id);
      if (s.outcome) throw conflict("ALREADY_FINAL", "This campaign has already finished.");
      if (s.proposal) {
        // Not yet accepted: withdraw the proposal; the operator returns any bond received.
        const out = await ctx.commands.run(
          "campaign.withdraw-proposal",
          {
            commandId: i.commandId(`withdraw-${s.id}`),
            actAs: [user.party],
            userId: `u-${user.handle}`,
            commands: [{ ExerciseCommand: { templateId: T.CampaignProposal, contractId: s.proposal.contractId, choice: "CampaignProposal_Withdraw", choiceArgument: {} } }],
          },
          s.id,
        );
        return { updateId: out.updateId };
      }
      if (!s.campaign) throw conflict("ALREADY_FINAL", "This campaign has already finished.");
      if (BigInt(s.campaign.payload.heldMilliCbm) > 0n) throw conflict("CAPACITY_HELD", "Importers hold capacity in this campaign; it now runs to its deadline.");
      const out = await ctx.commands.run(
        "campaign.cancel",
        {
          commandId: i.commandId(`cancel-${s.id}`),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.Campaign, contractId: s.campaign.contractId, choice: "Campaign_Cancel", choiceArgument: {} } }],
        },
        s.id,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  // ---- After settlement: bookings and disputes (F-10) -------------------------------------

  const BookingInput = z.object({
    bookingRef: z.string().trim().min(2).max(64),
    etd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD"),
    containerNo: z.string().trim().max(32).optional(),
  });

  /** Issue the booking to every settled importer that does not have one yet. */
  app.post<{ Params: { id: string } }>("/campaigns/:id/bookings", guard, async (req, reply) => {
    const user = me(req);
    const body = BookingInput.parse(req.body);
    const res = await idempotent(ctx, req, async (i) => {
      const { L, s } = await ownedCampaign(ctx, user.party, req.params.id);
      const settled = L.receipts.filter((r) => r.payload.campaignId === s.id && r.payload.kind === "Settled");
      if (settled.length === 0) throw conflict("NOT_SETTLED", "Bookings can be issued once the campaign has settled.");
      const booked = new Set(L.bookings.filter((b) => b.payload.campaignId === s.id).map((b) => b.payload.reservationId));
      let issued = 0;
      for (const r of settled.filter((x) => !booked.has(x.payload.reservationId))) {
        await ctx.commands.run(
          "forwarder.booking",
          {
            commandId: i.commandId(`booking-${r.contractId.slice(0, 16)}`),
            actAs: [user.party],
            userId: `u-${user.handle}`,
            commands: [
              {
                ExerciseCommand: {
                  templateId: T.Receipt,
                  contractId: r.contractId,
                  choice: "Receipt_ConfirmBooking",
                  choiceArgument: { bookingRef: body.bookingRef, etd: body.etd, containerNo: body.containerNo || null },
                },
              },
            ],
          },
          s.id,
        );
        issued++;
      }
      return { issued };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { cid: string } }>("/bookings/:cid/amend", guard, async (req, reply) => {
    const user = me(req);
    const body = BookingInput.pick({ etd: true, containerNo: true }).parse(req.body);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const b = L.bookings.find((x) => x.contractId === req.params.cid && x.payload.forwarder === user.party);
      if (!b) throw notFound("Booking");
      const out = await ctx.commands.run(
        "forwarder.amend-booking",
        {
          commandId: i.commandId("amend-booking"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.BookingConfirmation, contractId: b.contractId, choice: "BookingConfirmation_Amend", choiceArgument: { newEtd: body.etd, newContainerNo: body.containerNo || null } } }],
        },
        b.payload.campaignId,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { cid: string } }>("/disputes/:cid/resolve", guard, async (req, reply) => {
    const user = me(req);
    const { resolution } = z.object({ resolution: z.string().trim().min(3).max(2000) }).parse(req.body);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const d = L.disputes.find((x) => x.contractId === req.params.cid && x.payload.forwarder === user.party);
      if (!d) throw notFound("Dispute");
      const out = await ctx.commands.run(
        "forwarder.resolve-dispute",
        {
          commandId: i.commandId("resolve-dispute"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.DisputeRecord, contractId: d.contractId, choice: "DisputeRecord_Resolve", choiceArgument: { resolution } } }],
        },
        d.payload.campaignId,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.get<{ Params: { id: string } }>("/campaigns/:id/export.csv", guard, async (req, reply) => {
    const user = me(req);
    const { L, s } = await ownedCampaign(ctx, user.party, req.params.id);
    const lines = [["stage", "reservation_id", "importer", "reserved_cbm", "locked_usdcx"].join(",")];
    const push = (stage: string, rid: string, party: string, milli: string, micro: string | bigint) =>
      lines.push([stage, rid, party, formatCbm(milli), formatUsdc(micro, 6).replace(/,/g, "")].map(csv).join(","));
    for (const r of L.reservations.filter((c) => c.payload.campaignId === s.id))
      push("reserved", r.payload.reservationId, (await ctx.directory.ref(r.payload.importer)).displayName, r.payload.reservedMilliCbm, r.payload.lockedMicroUsdc);
    for (const c of L.commitments.filter((x) => x.payload.campaignId === s.id))
      push("committed", c.payload.reservationId, (await ctx.directory.ref(c.payload.importer)).displayName, c.payload.reservedMilliCbm, c.payload.lockedMicroUsdc);
    for (const r of L.receipts.filter((x) => x.payload.campaignId === s.id && x.payload.kind === "Settled"))
      push("settled", r.payload.reservationId, (await ctx.directory.ref(r.payload.importer)).displayName, r.payload.reservedMilliCbm, r.payload.amountMicroUsdc);
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${s.id}-reservations.csv"`)
      .send(lines.join("\n") + "\n");
  });
}

function csv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
