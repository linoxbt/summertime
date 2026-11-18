// Forwarder automation (spec 19.4), run for each forwarder hosted in pilot mode.

import {
  I,
  T,
  extraArgsFrom,
  type BondTicket,
  type BonusEntitlement,
  type Campaign,
  type CapacityHold,
  type CapacityRelease,
  type CapacityReservation,
  type Commitment,
  type ProgressView,
  type ReservationRequest,
  type SettleLeg,
  type SummertimeAllocationRequest,
} from "@summertime/ledger";
import { rejectionReason } from "@summertime/platform";
import { notifyPass } from "./notify.ts";
import { acs, step, userFor, type WorkerContext } from "./shared.ts";

const PROGRESS_MIN_PARTICIPANTS = 3;

export async function forwarderPass(w: WorkerContext, forwarder: { party: string; handle: string }): Promise<void> {
  const party = forwarder.party;
  const user = userFor(forwarder.handle);
  const now = w.now();
  const run = (kind: string, commandId: string, command: Parameters<WorkerContext["commands"]["run"]>[1]["commands"][number], subject?: string) =>
    w.commands.run(kind, { commandId, actAs: [party], userId: user, commands: [command] }, subject);

  const [campaigns, requests] = await Promise.all([acs<Campaign>(w, party, "Campaign"), acs<ReservationRequest>(w, party, "ReservationRequest")]);
  const campaignCid = new Map(campaigns.map((c) => [c.payload.campaignId, c.contractId]));
  const campaignOf = new Map(campaigns.map((c) => [c.payload.campaignId, c]));

  // 1. Requests: hold capacity on the campaign (a transaction the importer cannot see), then
  //    countersign with the hold. Over-capacity and out-of-bounds requests are rejected.
  for (const r of requests) {
    const id = r.payload.campaignId;
    const t = r.payload.terms;
    const size = BigInt(r.payload.reservedMilliCbm);
    const rejectWith = (reason: string) =>
      step(w, `reject request ${r.contractId}`, () =>
        run("forwarder.reject-request", `reject-req:${r.contractId}`, { ExerciseCommand: { templateId: T.ReservationRequest, contractId: r.contractId, choice: "ReservationRequest_Reject", choiceArgument: { reason } } }, id),
      );
    if (now.getTime() >= Date.parse(t.lockTime)) {
      await rejectWith("The lock time has passed.");
      continue;
    }
    const campaign = campaignOf.get(id);
    if (!campaign) {
      await rejectWith("The campaign is not open.");
      continue;
    }
    if (size < BigInt(t.minReservationMilliCbm) || size > BigInt(t.maxReservationMilliCbm)) {
      await rejectWith("The reservation is outside the campaign's bounds.");
      continue;
    }
    const existing = await w.db.query<{ hold_cid: string }>("SELECT hold_cid FROM capacity_holds WHERE request_cid = $1", [r.contractId]);
    let holdCid = existing.rows[0]?.hold_cid;
    if (!holdCid) {
      try {
        const out = await run(
          "forwarder.hold-capacity",
          `hold:${r.contractId}`,
          { ExerciseCommand: { templateId: T.Campaign, contractId: campaignCid.get(id)!, choice: "Campaign_HoldCapacity", choiceArgument: { size: size.toString() } } },
          id,
        );
        const result = out.result as { _1: string; _2: string };
        campaignCid.set(id, result._1);
        holdCid = result._2;
        await w.db.query("INSERT INTO capacity_holds (request_cid, campaign_id, hold_cid) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [r.contractId, id, holdCid]);
      } catch (e) {
        const reason = rejectionReason(e);
        if (reason?.includes("container capacity is not exceeded")) {
          await rejectWith("The container is full.");
          continue;
        }
        if (reason) {
          w.log.warn({ request: r.contractId, reason }, "capacity hold rejected");
          continue;
        }
        throw e;
      }
    }
    await step(w, `countersign ${r.contractId}`, () =>
      run("forwarder.countersign", `countersign:${r.contractId}`, { ExerciseCommand: { templateId: T.ReservationRequest, contractId: r.contractId, choice: "ReservationRequest_Countersign", choiceArgument: { holdCid } } }, id),
    );
  }

  // 2. Return capacity: importer-co-signed releases, and holds whose request is gone.
  const [releases, holds] = await Promise.all([acs<CapacityRelease>(w, party, "CapacityRelease"), acs<CapacityHold>(w, party, "CapacityHold")]);
  const liveRequests = new Set((await acs<ReservationRequest>(w, party, "ReservationRequest")).map((r) => r.contractId));
  const holdRequests = await w.db.query<{ request_cid: string; hold_cid: string }>("SELECT request_cid, hold_cid FROM capacity_holds");
  const requestOfHold = new Map(holdRequests.rows.map((x) => [x.hold_cid, x.request_cid]));
  const sources: { campaignId: string; source: { tag: string; value: string }; key: string }[] = [
    ...releases.map((x) => ({ campaignId: x.payload.campaignId, source: { tag: "FromRelease", value: x.contractId }, key: x.contractId })),
    ...holds
      .filter((h) => {
        const req = requestOfHold.get(h.contractId);
        return req !== undefined && !liveRequests.has(req);
      })
      .map((h) => ({ campaignId: h.payload.campaignId, source: { tag: "FromUnusedHold", value: h.contractId }, key: h.contractId })),
  ];
  for (const s of sources) {
    const cid = campaignCid.get(s.campaignId);
    if (!cid) continue;
    await step(w, `release capacity ${s.key}`, async () => {
      const out = await run("forwarder.release-capacity", `release-cap:${s.key}`, { ExerciseCommand: { templateId: T.Campaign, contractId: cid, choice: "Campaign_ReleaseCapacity", choiceArgument: { source: s.source } } }, s.campaignId);
      campaignCid.set(s.campaignId, out.result as string);
    });
  }

  // 3. Uncommitted reservations lapse at lock time; withdraw allocation requests no longer needed.
  const reservations = await acs<CapacityReservation>(w, party, "CapacityReservation");
  for (const r of reservations) {
    if (now.getTime() < Date.parse(r.payload.terms.lockTime)) continue;
    await step(w, `expire reservation ${r.contractId}`, () =>
      run("forwarder.expire-reservation", `expire-res:${r.contractId}`, { ExerciseCommand: { templateId: T.CapacityReservation, contractId: r.contractId, choice: "CapacityReservation_Expire", choiceArgument: { actor: party } } }, r.payload.campaignId),
    );
  }
  const liveLegIds = new Set((await acs<CapacityReservation>(w, party, "CapacityReservation")).map((r) => r.payload.transferLegId));
  for (const a of await acs<SummertimeAllocationRequest>(w, party, "SummertimeAllocationRequest")) {
    if (liveLegIds.has(a.payload.transferLegId)) continue;
    await step(w, `withdraw allocation request ${a.contractId}`, () =>
      run("forwarder.withdraw-allocation-request", `areq-withdraw:${a.contractId}`, { ExerciseCommand: { templateId: I.AllocationRequest, contractId: a.contractId, choice: "AllocationRequest_Withdraw", choiceArgument: { extraArgs: extraArgsFrom(undefined) } } }),
    );
  }

  // 4. Scheduled, rounded progress: one view per invited importer (F-6, privacy rule P-4).
  const commitments = await acs<Commitment>(w, party, "Commitment");
  const views = await acs<ProgressView>(w, party, "ProgressView");
  for (const c of campaigns) {
    const id = c.payload.campaignId;
    if (now.getTime() >= Date.parse(c.payload.terms.deadline)) continue;
    const mine = commitments.filter((x) => x.payload.campaignId === id);
    const committed = mine.reduce((a, x) => a + BigInt(x.payload.reservedMilliCbm), 0n);
    const hidden = mine.length < PROGRESS_MIN_PARTICIPANTS;
    const snapshot = {
      reservedCbmRounded: hidden ? "0" : (committed / 1000n).toString(),
      participantCount: hidden ? null : mine.length.toString(),
      hidden,
      asOf: now.toISOString(),
    };
    const invitees = await w.db.query<{ importer_party: string }>("SELECT importer_party FROM campaign_invitees WHERE campaign_id = $1", [id]);
    const lockTime = Date.parse(c.payload.terms.lockTime);
    for (const { importer_party: importer } of invitees.rows) {
      const view = views.find((v) => v.payload.campaignId === id && v.payload.importer === importer);
      if (!view) {
        await step(w, `create progress ${id}/${importer}`, () =>
          run("forwarder.progress", `progress-create:${id}:${importer}`, { CreateCommand: { templateId: T.ProgressView, createArguments: { forwarder: party, importer, campaignId: id, ...snapshot } } }, id),
        );
        continue;
      }
      const changed =
        view.payload.hidden !== snapshot.hidden || view.payload.reservedCbmRounded !== snapshot.reservedCbmRounded || view.payload.participantCount !== snapshot.participantCount;
      const lastAt = Date.parse(view.payload.asOf);
      const due = now.getTime() - lastAt >= w.config.progressIntervalSeconds * 1000 || (lastAt < lockTime && now.getTime() >= lockTime);
      if (!changed || !due) continue;
      await step(w, `supersede progress ${view.contractId}`, () =>
        run("forwarder.progress", `progress:${view.contractId}`, { ExerciseCommand: { templateId: T.ProgressView, contractId: view.contractId, choice: "ProgressView_Supersede", choiceArgument: { snapshot } } }, id),
      );
    }
  }

  // 5. Record failure at the deadline (the campaign can no longer settle).
  for (const c of campaigns) {
    if (now.getTime() < Date.parse(c.payload.terms.deadline)) continue;
    const cid = campaignCid.get(c.payload.campaignId) ?? c.contractId;
    await step(w, `fail ${c.payload.campaignId}`, () =>
      run("forwarder.fail", `fail:${c.payload.campaignId}`, { ExerciseCommand: { templateId: T.Campaign, contractId: cid, choice: "Campaign_Fail", choiceArgument: { actor: party } } }, c.payload.campaignId),
    );
  }
}

/**
 * Auto-settle (spec 19.4: "Threshold met: MAY auto-execute if the forwarder enabled it").
 * For each open campaign the forwarder opted in, settle as soon as the committed space reaches
 * the threshold, before the deadline. Same rules and command as the forwarder's own Settle.
 */
export async function autoSettlePass(w: WorkerContext, forwarder: { party: string; handle: string }): Promise<void> {
  const party = forwarder.party;
  const optedIn = new Set(
    (await w.db.query<{ campaign_id: string }>("SELECT campaign_id FROM campaign_index WHERE forwarder_party = $1 AND auto_execute", [party])).rows.map((r) => r.campaign_id),
  );
  if (optedIn.size === 0) return;
  const now = w.now().getTime();
  const campaigns = (await acs<Campaign>(w, party, "Campaign")).filter((c) => optedIn.has(c.payload.campaignId) && now < Date.parse(c.payload.terms.deadline));
  if (campaigns.length === 0) return;
  const [commitments, tickets, entitlements, allocations] = await Promise.all([
    acs<Commitment>(w, party, "Commitment"),
    acs<BondTicket>(w, party, "BondTicket"),
    acs<BonusEntitlement>(w, party, "BonusEntitlement"),
    w.ledger.activeContracts([party], { interfaces: [I.Allocation] }),
  ]);
  const live = new Set(allocations.map((a) => a.contractId));
  for (const c of campaigns) {
    const id = c.payload.campaignId;
    const mine = commitments.filter((x) => x.payload.campaignId === id && live.has(x.payload.allocationCid));
    const total = mine.reduce((a, x) => a + BigInt(x.payload.reservedMilliCbm), 0n);
    if (mine.length === 0 || total < BigInt(c.payload.terms.thresholdMilliCbm)) continue;
    const legs: SettleLeg[] = [];
    const disclosed: Awaited<ReturnType<WorkerContext["registry"]["allocationContext"]>>["disclosedContracts"] = [];
    let ready = true;
    for (const x of mine) {
      const ent = entitlements.find((e) => e.payload.commitmentCid === x.contractId);
      const ticket = tickets.find((t) => t.payload.commitmentCid === x.contractId);
      const bonusRef = ent ? { tag: "EntitlementRef" as const, value: ent.contractId } : ticket ? { tag: "TicketRef" as const, value: ticket.contractId } : undefined;
      if (!bonusRef) {
        ready = false; // the bond lock is moving this commitment's record; try next pass
        break;
      }
      const context = await w.registry.allocationContext(x.payload.allocationCid, "execute-transfer");
      disclosed.push(...context.disclosedContracts);
      legs.push({ commitmentCid: x.contractId, bonusRef, extraArgs: extraArgsFrom(context.choiceContextData) });
    }
    if (!ready) continue;
    // Settling archives the commitments: record "funds locked" notifications for them first.
    await notifyPass(w, party).catch((e) => w.log.warn({ err: String(e).slice(0, 200) }, "pre-settle notifications failed"));
    const ok = await step(w, `auto-settle ${id}`, () =>
      w.commands.run(
        "campaign.execute",
        {
          commandId: `auto-execute:${id}:${legs.length}`,
          actAs: [party],
          userId: userFor(forwarder.handle),
          commands: [{ ExerciseCommand: { templateId: T.Campaign, contractId: c.contractId, choice: "Campaign_Execute", choiceArgument: { included: legs } } }],
          disclosedContracts: disclosed,
        },
        id,
      ),
    );
    if (ok) w.log.info({ campaign: id, legs: legs.length }, "auto-settled");
  }
}
