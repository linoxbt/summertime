import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  I,
  T,
  extraArgsFrom,
  formatCbm,
  formatUsdc,
  parseUnits,
  phaseOf,
  type InvitationDto,
  type PositionDto,
  type PositionStage,
  type ProgressDto,
} from "@summertime/ledger";
import type { AppContext } from "../context.ts";
import { me, requireUser } from "../auth.ts";
import { conflict, invalid, notFound } from "../errors.ts";
import { idempotent } from "../idempotency.ts";
import { amount, balance, bookingDto, campaignLabels, capacity, disputeDtos, liveAllocations, partyLedger, receiptDto, selectHoldings, sha256, termsDto, type PartyLedger } from "../reads.ts";

function progressDto(L: PartyLedger, campaignId: string, terms: { containerCapacityMilliCbm: string; thresholdMilliCbm: string }): ProgressDto | undefined {
  const p = L.progress.find((x) => x.payload.campaignId === campaignId);
  if (!p) return undefined;
  return {
    hidden: p.payload.hidden,
    reservedCbm: Number(p.payload.reservedCbmRounded),
    participantCount: p.payload.participantCount === null ? null : Number(p.payload.participantCount),
    asOf: p.payload.asOf,
    capacityCbm: Number(BigInt(terms.containerCapacityMilliCbm) / 1000n),
    thresholdCbm: Number(BigInt(terms.thresholdMilliCbm) / 1000n),
  };
}

async function positions(ctx: AppContext, party: string): Promise<PositionDto[]> {
  const L = await partyLedger(ctx, party);
  const live = await liveAllocations(ctx, party);
  const ids = new Set<string>();
  for (const list of [L.requests, L.reservations, L.commitments, L.entitlements, L.payouts, L.receipts]) for (const c of list) ids.add(c.payload.campaignId);
  const labels = await campaignLabels(ctx, [...ids]);
  const now = new Date();
  const out: PositionDto[] = [];
  for (const id of ids) {
    const label = labels.get(id);
    const request = L.requests.find((c) => c.payload.campaignId === id);
    const reservation = L.reservations.find((c) => c.payload.campaignId === id);
    const commitment = L.commitments.find((c) => c.payload.campaignId === id);
    const ticket = L.tickets.find((c) => c.payload.campaignId === id);
    const entitlement = L.entitlements.find((c) => c.payload.campaignId === id);
    const payout = L.payouts.find((c) => c.payload.campaignId === id);
    const receipts = L.receipts.filter((c) => c.payload.campaignId === id);
    const settledReceipt = receipts.find((r) => r.payload.kind === "Settled");
    const booking = L.bookings.find((b) => b.payload.campaignId === id);
    const terms = commitment?.payload.terms ?? reservation?.payload.terms ?? request?.payload.terms ?? label?.terms;
    if (!terms) continue;
    const phase = phaseOf(terms, now);
    const kinds = new Set(receipts.map((r) => r.payload.kind));
    let stage: PositionStage;
    if (payout) stage = "bonus-pending";
    else if (kinds.has("BonusPaid")) stage = "bonus-paid";
    else if (kinds.has("Settled")) stage = "settled";
    else if (commitment) {
      if (!live.has(commitment.payload.allocationCid)) stage = "lapsed";
      else if (entitlement && phase === "expired") stage = "claimable";
      else stage = "committed";
    } else if (reservation) stage = phase === "open" ? "awaiting-signature" : "lapsed";
    else if (request) stage = "requested";
    else if (kinds.has("Withdrawn")) stage = "withdrawn";
    else if (kinds.has("Released")) stage = "released";
    else stage = "lapsed";
    const forwarder = commitment?.payload.forwarder ?? reservation?.payload.forwarder ?? request?.payload.forwarder ?? label?.forwarderParty ?? "";
    const sizedReceipt = receipts.find((r) => r.payload.reservedMilliCbm !== "0");
    const reserved =
      commitment?.payload.reservedMilliCbm ??
      reservation?.payload.reservedMilliCbm ??
      request?.payload.reservedMilliCbm ??
      payout?.payload.reservedMilliCbm ??
      sizedReceipt?.payload.reservedMilliCbm;
    out.push({
      campaignId: id,
      title: label?.title ?? id,
      route: label?.route ?? null,
      forwarder: await ctx.directory.ref(forwarder),
      stage,
      phase,
      terms: termsDto(terms),
      reserved: reserved ? capacity(reserved) : undefined,
      locked: reserved ? amount(BigInt(reserved) * BigInt(terms.rateMicroUsdcPerMilliCbm)) : undefined,
      bonus: entitlement ? amount(entitlement.payload.bonusMicroUsdc) : payout ? amount(payout.payload.bonusMicroUsdc) : undefined,
      progress: progressDto(L, id, terms),
      receipts: await Promise.all(receipts.map((r) => receiptDto(ctx, r))),
      booking: booking ? await bookingDto(ctx, booking) : undefined,
      disputes: await disputeDtos(ctx, L, id, party),
      ids: {
        request: request?.contractId,
        reservation: reservation?.contractId,
        commitment: commitment?.contractId,
        ticket: ticket?.contractId,
        entitlement: entitlement?.contractId,
        payout: payout?.contractId,
        allocation: commitment?.payload.allocationCid,
        settledReceipt: settledReceipt?.contractId,
      },
      actions: {
        canCommit: stage === "awaiting-signature",
        canWithdraw: stage === "committed" && phase === "open" && !!ticket,
        canClaim: stage === "claimable",
        canRelease: !!commitment && phase !== "open" && phase !== "locked" && stage !== "claimable" && live.has(commitment.payload.allocationCid),
        canDispute: !!settledReceipt && !L.disputes.some((d) => d.payload.campaignId === id),
      },
    });
  }
  return out.sort((a, b) => b.terms.deadline.localeCompare(a.terms.deadline));
}

export function importerRoutes(app: FastifyInstance, ctx: AppContext) {
  const guard = { preHandler: requireUser(ctx, "importer") };

  app.get("/invitations", guard, async (req) => {
    const user = me(req);
    const L = await partyLedger(ctx, user.party);
    const labels = await campaignLabels(ctx, L.invitations.map((i) => i.payload.campaignId));
    const data: InvitationDto[] = await Promise.all(
      L.invitations
        .filter((i) => Date.parse(i.payload.terms.lockTime) > Date.now())
        .map(async (i) => ({
          contractId: i.contractId,
          campaignId: i.payload.campaignId,
          title: labels.get(i.payload.campaignId)?.title ?? "Shared container",
          route: labels.get(i.payload.campaignId)?.route ?? null,
          forwarder: await ctx.directory.ref(i.payload.forwarder),
          terms: termsDto(i.payload.terms),
          expiresAt: i.payload.terms.lockTime,
        })),
    );
    return { data };
  });

  app.get<{ Params: { cid: string } }>("/invitations/:cid", guard, async (req) => {
    const user = me(req);
    const L = await partyLedger(ctx, user.party);
    const i = L.invitations.find((x) => x.contractId === req.params.cid);
    if (!i) throw notFound("Invitation");
    const label = (await campaignLabels(ctx, [i.payload.campaignId])).get(i.payload.campaignId);
    const data: InvitationDto = {
      contractId: i.contractId,
      campaignId: i.payload.campaignId,
      title: label?.title ?? "Shared container",
      route: label?.route ?? null,
      forwarder: await ctx.directory.ref(i.payload.forwarder),
      terms: termsDto(i.payload.terms),
      expiresAt: i.payload.terms.lockTime,
    };
    return { data };
  });

  app.post<{ Params: { cid: string } }>("/invitations/:cid/reserve", guard, async (req, reply) => {
    const user = me(req);
    const body = z.object({ reservedCbm: z.string().regex(/^\d+(\.\d+)?$/) }).parse(req.body);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const inv = L.invitations.find((x) => x.contractId === req.params.cid);
      if (!inv) throw notFound("Invitation");
      const size = parseUnits(body.reservedCbm, 3);
      const t = inv.payload.terms;
      if (Date.now() >= Date.parse(t.lockTime)) throw conflict("EXPIRED", "This invitation expired at the lock time.");
      if (size < BigInt(t.minReservationMilliCbm)) throw invalid("BELOW_MIN", `The minimum reservation is ${formatCbm(t.minReservationMilliCbm)} CBM.`);
      if (size > BigInt(t.maxReservationMilliCbm)) throw invalid("ABOVE_MAX", `The maximum reservation is ${formatCbm(t.maxReservationMilliCbm)} CBM.`);
      const out = await ctx.commands.run(
        "importer.reserve",
        {
          commandId: i.commandId("reserve"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.Invitation, contractId: inv.contractId, choice: "Invitation_RequestReservation", choiceArgument: { reservedMilliCbm: size.toString() } } }],
        },
        inv.payload.campaignId,
      );
      return { requestCid: out.result as string, updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { cid: string } }>("/invitations/:cid/decline", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const out = await ctx.commands.run("importer.decline", {
        commandId: i.commandId("decline"),
        actAs: [user.party],
        userId: `u-${user.handle}`,
        commands: [{ ExerciseCommand: { templateId: T.Invitation, contractId: req.params.cid, choice: "Invitation_Decline", choiceArgument: {} } }],
      });
      return { ok: true, updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.get("/positions", guard, async (req) => ({ data: await positions(ctx, me(req).party) }));

  app.get<{ Params: { campaignId: string } }>("/positions/:campaignId", guard, async (req) => {
    const p = (await positions(ctx, me(req).party)).find((x) => x.campaignId === req.params.campaignId);
    if (!p) throw notFound("Position");
    return { data: p };
  });

  app.get<{ Params: { campaignId: string } }>("/campaigns/:campaignId/progress", guard, async (req) => {
    const user = me(req);
    const L = await partyLedger(ctx, user.party);
    const p = L.progress.find((x) => x.payload.campaignId === req.params.campaignId);
    if (!p) throw notFound("Progress");
    const label = (await campaignLabels(ctx, [req.params.campaignId])).get(req.params.campaignId);
    return { data: progressDto(L, req.params.campaignId, label?.terms ?? { containerCapacityMilliCbm: "0", thresholdMilliCbm: "0" }) };
  });

  app.get<{ Params: { cid: string } }>("/reservations/:cid/allocation-intent", guard, async (req) => {
    const user = me(req);
    const L = await partyLedger(ctx, user.party);
    const r = L.reservations.find((x) => x.contractId === req.params.cid);
    if (!r) throw notFound("Reservation");
    if (Date.now() >= Date.parse(r.payload.terms.lockTime)) throw conflict("EXPIRED", "This reservation expired at the lock time.");
    const areq = (await ctx.ledger.activeContracts<{ settlement: unknown; transferLegId: string; transferLeg: unknown }>([user.party], { templates: [T.SummertimeAllocationRequest] })).find(
      (x) => x.payload.transferLegId === r.payload.transferLegId,
    );
    if (!areq) throw notFound("Allocation request");
    return { data: { settlement: areq.payload.settlement, transferLegId: areq.payload.transferLegId, transferLeg: areq.payload.transferLeg, amount: amount(r.payload.lockedMicroUsdc) } };
  });

  // Pilot mode: allocate the importer's USDCx through the registry, then commit (F-4).
  app.post<{ Params: { cid: string } }>("/reservations/:cid/commit", guard, async (req, reply) => {
    const user = me(req);
    if (user.mode !== "pilot") throw conflict("WALLET_MODE", "Sign the allocation in your wallet, then commit.");
    const res = await idempotent(ctx, req, async () => {
      const L = await partyLedger(ctx, user.party);
      const r = L.reservations.find((x) => x.contractId === req.params.cid);
      if (!r) throw notFound("Reservation");
      if (Date.now() >= Date.parse(r.payload.terms.lockTime)) throw conflict("LOCKED", "Commitments closed at the lock time.");
      const areq = (await ctx.ledger.activeContracts<{ settlement: unknown; transferLegId: string; transferLeg: unknown }>([user.party], { templates: [T.SummertimeAllocationRequest] })).find(
        (x) => x.payload.transferLegId === r.payload.transferLegId,
      );
      if (!areq) throw notFound("Allocation request");
      const needed = BigInt(r.payload.lockedMicroUsdc);
      const bal = await balance(ctx, user.party);
      const inputs = selectHoldings(bal.holdings, needed);
      if (!inputs) throw conflict("INSUFFICIENT_BALANCE", `You need ${formatUsdc(needed)} USDCx available; you have ${formatUsdc(bal.available)}.`);
      const choiceArgument = {
        expectedAdmin: r.payload.terms.instrumentId.admin,
        allocation: { settlement: areq.payload.settlement, transferLegId: areq.payload.transferLegId, transferLeg: areq.payload.transferLeg },
        requestedAt: new Date(Date.now() - 1000).toISOString(),
        inputHoldingCids: inputs,
        extraArgs: { context: { values: {} }, meta: { values: {} } } as ReturnType<typeof extraArgsFrom>,
      };
      const factory = await ctx.registry.allocationFactory(choiceArgument);
      choiceArgument.extraArgs = extraArgsFrom(factory.choiceContext.choiceContextData);
      const alloc = await ctx.commands.run<{ output: { tag: string; value: { allocationCid?: string } } }>(
        "importer.allocate",
        {
          commandId: `allocate:${r.contractId}`,
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: I.AllocationFactory, contractId: factory.factoryId, choice: "AllocationFactory_Allocate", choiceArgument } }],
          disclosedContracts: factory.choiceContext.disclosedContracts,
        },
        r.payload.campaignId,
      );
      const allocationCid = alloc.result.output.value.allocationCid;
      if (alloc.result.output.tag !== "AllocationInstructionResult_Completed" || !allocationCid) {
        throw conflict("ALLOCATION_PENDING", "The registry is still processing your allocation. Try committing again shortly.");
      }
      const out = await ctx.commands.run<{ _1: string; _2: string }>(
        "importer.commit",
        {
          commandId: `commit:${r.contractId}`,
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.CapacityReservation, contractId: r.contractId, choice: "CapacityReservation_Commit", choiceArgument: { allocationCid } } }],
        },
        r.payload.campaignId,
      );
      return { commitmentCid: out.result._1, allocationCid, updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { cid: string } }>("/commitments/:cid/withdraw", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const c = L.commitments.find((x) => x.contractId === req.params.cid);
      if (!c) throw notFound("Commitment");
      if (Date.now() >= Date.parse(c.payload.terms.lockTime)) throw conflict("LOCKED", "Withdrawals through Summertime closed at the lock time.");
      const ticket = L.tickets.find((t) => t.payload.commitmentCid === c.contractId);
      if (!ticket) throw conflict("LOCKED", "The bond has already been locked for this campaign.");
      const context = await ctx.registry.allocationContext(c.payload.allocationCid, "withdraw");
      const out = await ctx.commands.run(
        "importer.withdraw",
        {
          commandId: i.commandId("withdraw"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [
            {
              ExerciseCommand: {
                templateId: T.Commitment,
                contractId: c.contractId,
                choice: "Commitment_Withdraw",
                choiceArgument: { ticketCid: ticket.contractId, extraArgs: extraArgsFrom(context.choiceContextData) },
              },
            },
          ],
          disclosedContracts: context.disclosedContracts,
        },
        c.payload.campaignId,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { cid: string } }>("/commitments/:cid/release", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const c = L.commitments.find((x) => x.contractId === req.params.cid);
      if (!c) throw notFound("Commitment");
      if (Date.now() < Date.parse(c.payload.terms.deadline)) throw conflict("NOT_EXPIRED", "Funds can be released after the deadline.");
      const live = await liveAllocations(ctx, user.party);
      const cancelAllocation = live.has(c.payload.allocationCid);
      const context = cancelAllocation ? await ctx.registry.allocationContext(c.payload.allocationCid, "cancel") : undefined;
      const out = await ctx.commands.run(
        "importer.release",
        {
          commandId: i.commandId("release"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [
            {
              ExerciseCommand: {
                templateId: T.Commitment,
                contractId: c.contractId,
                choice: "Commitment_Release",
                choiceArgument: { actor: user.party, cancelAllocation, extraArgs: extraArgsFrom(context?.choiceContextData) },
              },
            },
          ],
          disclosedContracts: context?.disclosedContracts ?? [],
        },
        c.payload.campaignId,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  // ---- After settlement: bookings and disputes (F-10) -------------------------------------

  app.post<{ Params: { cid: string } }>("/bookings/:cid/acknowledge", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const b = L.bookings.find((x) => x.contractId === req.params.cid);
      if (!b) throw notFound("Booking");
      if (b.payload.acknowledgedAt) throw conflict("ALREADY_ACKNOWLEDGED", "You have already acknowledged this booking.");
      const out = await ctx.commands.run(
        "importer.acknowledge-booking",
        {
          commandId: i.commandId("ack-booking"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.BookingConfirmation, contractId: b.contractId, choice: "BookingConfirmation_Acknowledge", choiceArgument: {} } }],
        },
        b.payload.campaignId,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  /** Open a dispute about a settled shipment. Details stay off-ledger; the ledger gets their hash. */
  app.post<{ Params: { cid: string } }>("/receipts/:cid/disputes", guard, async (req, reply) => {
    const user = me(req);
    const body = z.object({ subject: z.string().trim().min(3).max(140), details: z.string().trim().min(10).max(5000) }).parse(req.body);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const r = L.receipts.find((x) => x.contractId === req.params.cid);
      if (!r || r.payload.kind !== "Settled") throw conflict("NOT_SETTLED", "Disputes can be opened only about a settled shipment.");
      // Salt with the receipt so identical texts in different disputes hash differently.
      const evidence = `${body.details}\n\n— ${r.payload.campaignId}/${r.payload.reservationId}`;
      const evidenceHash = sha256(evidence);
      await ctx.db.query(
        "INSERT INTO dispute_evidence (evidence_hash, importer_party, campaign_id, details) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [evidenceHash, user.party, r.payload.campaignId, evidence],
      );
      const out = await ctx.commands.run(
        "importer.open-dispute",
        {
          commandId: i.commandId("open-dispute"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.Receipt, contractId: r.contractId, choice: "Receipt_OpenDispute", choiceArgument: { subject: body.subject, evidenceHash } } }],
        },
        r.payload.campaignId,
      );
      return { disputeCid: out.result as string, evidenceHash, updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { cid: string } }>("/disputes/:cid/withdraw", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const d = L.disputes.find((x) => x.contractId === req.params.cid && x.payload.importer === user.party);
      if (!d) throw notFound("Dispute");
      const out = await ctx.commands.run(
        "importer.withdraw-dispute",
        {
          commandId: i.commandId("withdraw-dispute"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.DisputeRecord, contractId: d.contractId, choice: "DisputeRecord_Withdraw", choiceArgument: {} } }],
        },
        d.payload.campaignId,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { cid: string } }>("/entitlements/:cid/claim", guard, async (req, reply) => {
    const user = me(req);
    const res = await idempotent(ctx, req, async (i) => {
      const L = await partyLedger(ctx, user.party);
      const e = L.entitlements.find((x) => x.contractId === req.params.cid);
      if (!e) {
        if (L.payouts.some((p) => p.payload.importer === user.party)) throw conflict("ALREADY_CLAIMED", "This bonus has already been claimed.");
        throw notFound("Bonus entitlement");
      }
      if (Date.now() < Date.parse(e.payload.claimableAfter)) throw conflict("NOT_CLAIMABLE", "Bonuses can be claimed after the deadline.");
      if (Date.now() >= Date.parse(e.payload.claimWindowEnd)) throw conflict("WINDOW_CLOSED", "The claim window has closed.");
      const c = L.commitments.find((x) => x.contractId === e.payload.commitmentCid);
      if (!c) throw conflict("NOT_CLAIMABLE", "This commitment was settled or closed, so no bonus is due.");
      const live = await liveAllocations(ctx, user.party);
      if (!live.has(c.payload.allocationCid)) throw conflict("ALLOCATION_WITHDRAWN", "Your allocation was withdrawn after the lock time, so the bonus is forfeited.");
      const context = await ctx.registry.allocationContext(c.payload.allocationCid, "withdraw");
      const out = await ctx.commands.run(
        "importer.claim",
        {
          commandId: i.commandId("claim"),
          actAs: [user.party],
          userId: `u-${user.handle}`,
          commands: [{ ExerciseCommand: { templateId: T.BonusEntitlement, contractId: e.contractId, choice: "BonusEntitlement_Claim", choiceArgument: { extraArgs: extraArgsFrom(context.choiceContextData) } } }],
          disclosedContracts: context.disclosedContracts,
        },
        e.payload.campaignId,
      );
      return { updateId: out.updateId };
    });
    return reply.code(res.status).send(res.body);
  });
}
