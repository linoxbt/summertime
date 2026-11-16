// Operator automation (spec 19.4). The operator co-signs campaigns, holds the bond in
// custody, runs the bond lock and pays bonuses. It never acts as the forwarder.

import {
  CAMPAIGN_META_KEY,
  I,
  T,
  extraArgsFrom,
  formatUsdc,
  fromTokenDecimal,
  toTokenDecimal,
  type BondTicket,
  type BonusEntitlement,
  type BonusPayout,
  type Campaign,
  type CampaignOutcome,
  type CampaignProposal,
  type OrganizerBond,
  type TransferInstructionView,
} from "@summertime/ledger";
import { acs, incomingTransfers, pick, step, unlockedHoldings, type WorkerContext } from "./shared.ts";

const OPERATOR_USER = "u-operator";
const FAIL_GRACE_MS = 120_000;

export async function operatorPass(w: WorkerContext): Promise<void> {
  const op = w.deployment.operatorParty;
  await acceptBondTransfers(w, op);

  const [proposals, campaigns, bonds, tickets, entitlements, payouts, outcomes] = await Promise.all([
    acs<CampaignProposal>(w, op, "CampaignProposal"),
    acs<Campaign>(w, op, "Campaign"),
    acs<OrganizerBond>(w, op, "OrganizerBond"),
    acs<BondTicket>(w, op, "BondTicket"),
    acs<BonusEntitlement>(w, op, "BonusEntitlement"),
    acs<BonusPayout>(w, op, "BonusPayout"),
    acs<CampaignOutcome>(w, op, "CampaignOutcome"),
  ]);
  const now = w.now();
  const usedIds = new Set([...campaigns, ...bonds, ...outcomes].map((c) => c.payload.campaignId));

  // While bond custody does not reconcile, accept no new campaigns (spec 28: pause new
  // campaigns). Proposals wait; they are rejected only if their lock time passes.
  const custody = await w.db.query<{ status: string }>("SELECT status FROM ops_checks WHERE name = 'bond_custody'");
  const custodyAlert = custody.rows[0]?.status === "alert";
  if (custodyAlert && proposals.length) w.log.warn({ waiting: proposals.length }, "bond custody alert open: holding new campaign proposals");

  // Proposals: accept once the bond has arrived; reject on duplicate IDs or a missed lock time.
  for (const p of proposals) {
    const id = p.payload.campaignId;
    const received = await receivedBond(w, id);
    if (usedIds.has(id) || proposals.filter((x) => x.payload.campaignId === id).length > 1) {
      await step(w, `reject ${id}`, () => reject(w, p.contractId, id, "campaign ID already in use"));
      continue;
    }
    if (now.getTime() >= Date.parse(p.payload.terms.lockTime)) {
      await step(w, `reject ${id}`, () => reject(w, p.contractId, id, "no bond received before the lock time"));
      continue;
    }
    if (custodyAlert) continue;
    if (received && received.amount === BigInt(p.payload.terms.bondMicroUsdc)) {
      const ok = await step(w, `accept ${id}`, () =>
        w.commands.run(
          "operator.accept-proposal",
          {
            commandId: `accept:${p.contractId}`,
            actAs: [op],
            userId: OPERATOR_USER,
            commands: [{ ExerciseCommand: { templateId: T.CampaignProposal, contractId: p.contractId, choice: "CampaignProposal_Accept", choiceArgument: { bondHoldingCids: received.holdings } } }],
          },
          id,
        ),
      );
      if (ok) await w.db.query("INSERT INTO bond_ledger (campaign_id, kind, amount_micro, reference) VALUES ($1, 'escrowed', $2, $3) ON CONFLICT DO NOTHING", [id, received.amount.toString(), p.contractId]);
    }
  }

  // Bond received for a campaign that no longer has a proposal and never opened: refund it.
  const pending = await w.db.query<{ campaign_id: string; amount: string; counterparty: string }>(
    `SELECT r.campaign_id, SUM(r.amount_micro)::text AS amount, MIN(r.counterparty) AS counterparty FROM bond_ledger r
      WHERE r.kind = 'received'
        AND NOT EXISTS (SELECT 1 FROM bond_ledger x WHERE x.campaign_id = r.campaign_id AND x.kind IN ('escrowed', 'refunded'))
      GROUP BY r.campaign_id`,
  );
  for (const row of pending.rows) {
    const stillProposed = proposals.some((p) => p.payload.campaignId === row.campaign_id);
    if (!stillProposed && !usedIds.has(row.campaign_id)) {
      await step(w, `refund ${row.campaign_id}`, () => transferOut(w, row.campaign_id, row.counterparty, BigInt(row.amount), "refunded", `refund:${row.campaign_id}`));
    }
  }

  // Lock each bond at lock time with every live ticket (F-7). The forwarder takes no part.
  for (const b of bonds) {
    if (b.payload.locked || now.getTime() < Date.parse(b.payload.terms.lockTime)) continue;
    const ticketCids = tickets.filter((t) => t.payload.campaignId === b.payload.campaignId).map((t) => t.contractId);
    await step(w, `lock ${b.payload.campaignId}`, () =>
      w.commands.run(
        "operator.lock",
        {
          commandId: `lock:${b.contractId}`,
          actAs: [op],
          userId: OPERATOR_USER,
          commands: [{ ExerciseCommand: { templateId: T.OrganizerBond, contractId: b.contractId, choice: "OrganizerBond_Lock", choiceArgument: { ticketCids } } }],
        },
        b.payload.campaignId,
      ),
    );
  }

  // Pay validated bonus claims from the bond holdings.
  for (const p of payouts) {
    await step(w, `pay ${p.payload.campaignId}/${p.payload.reservationId}`, async () => {
      const micro = BigInt(p.payload.bonusMicroUsdc);
      let inputHoldingCids: string[] = [];
      let factoryId = "";
      let disclosed: Awaited<ReturnType<typeof w.registry.transferFactory>>["choiceContext"]["disclosedContracts"] = [];
      let extraArgs = extraArgsFrom(undefined);
      if (micro > 0n) {
        const holdings = await spendableHoldings(w, op);
        const chosen = pick(holdings, micro);
        if (!chosen) throw new Error(`operator holdings cannot cover a ${formatUsdc(micro)} USDCx payout`);
        inputHoldingCids = chosen;
        const factory = await w.registry.transferFactory({ expectedAdmin: p.payload.instrumentId.admin });
        factoryId = factory.factoryId;
        disclosed = factory.choiceContext.disclosedContracts;
        extraArgs = extraArgsFrom(factory.choiceContext.choiceContextData);
      } else {
        // Zero bonus: no transfer happens; any factory reference satisfies the choice signature.
        const factory = await w.registry.transferFactory({ expectedAdmin: p.payload.instrumentId.admin });
        factoryId = factory.factoryId;
      }
      await w.commands.run(
        "operator.pay",
        {
          commandId: `pay:${p.contractId}`,
          actAs: [op],
          userId: OPERATOR_USER,
          commands: [{ ExerciseCommand: { templateId: T.BonusPayout, contractId: p.contractId, choice: "BonusPayout_Pay", choiceArgument: { transferFactoryCid: factoryId, inputHoldingCids, extraArgs } } }],
          disclosedContracts: disclosed,
        },
        p.payload.campaignId,
      );
      await w.db.query("INSERT INTO bond_ledger (campaign_id, kind, amount_micro, reference, counterparty) VALUES ($1, 'paid', $2, $3, $4) ON CONFLICT DO NOTHING", [
        p.payload.campaignId,
        micro.toString(),
        p.contractId,
        p.payload.importer,
      ]);
    });
  }

  // Return what remains of each bond once the campaign is final and nothing is owed.
  for (const b of bonds) {
    const id = b.payload.campaignId;
    const final = outcomes.some((o) => o.payload.campaignId === id) && !campaigns.some((c) => c.payload.campaignId === id);
    const owed =
      tickets.some((t) => t.payload.campaignId === id) || entitlements.some((e) => e.payload.campaignId === id) || payouts.some((p) => p.payload.campaignId === id);
    if (!final || owed) continue;
    await step(w, `return ${id}`, async () => {
      const paid = await w.db.query<{ total: string | null }>("SELECT SUM(amount_micro)::text AS total FROM bond_ledger WHERE campaign_id = $1 AND kind = 'paid'", [id]);
      const remaining = BigInt(b.payload.terms.bondMicroUsdc) - BigInt(paid.rows[0]?.total ?? "0");
      const holdings = remaining > 0n ? pick(await spendableHoldings(w, op), remaining) : [];
      if (!holdings) throw new Error("operator holdings cannot cover the bond return");
      const factory = await w.registry.transferFactory({ expectedAdmin: b.payload.terms.instrumentId.admin });
      await w.commands.run(
        "operator.return-bond",
        {
          commandId: `return:${b.contractId}`,
          actAs: [op],
          userId: OPERATOR_USER,
          commands: [
            {
              ExerciseCommand: {
                templateId: T.OrganizerBond,
                contractId: b.contractId,
                choice: "OrganizerBond_Return",
                choiceArgument: {
                  amountMicroUsdc: remaining.toString(),
                  transferFactoryCid: factory.factoryId,
                  inputHoldingCids: holdings,
                  extraArgs: extraArgsFrom(factory.choiceContext.choiceContextData),
                },
              },
            },
          ],
          disclosedContracts: factory.choiceContext.disclosedContracts,
        },
        id,
      );
      await w.db.query("INSERT INTO bond_ledger (campaign_id, kind, amount_micro, reference, counterparty) VALUES ($1, 'returned', $2, $3, $4) ON CONFLICT DO NOTHING", [
        id,
        remaining.toString(),
        b.contractId,
        b.payload.forwarder,
      ]);
    });
  }

  // Fallback: record failure if the forwarder has not, shortly after the deadline.
  for (const c of campaigns) {
    if (now.getTime() < Date.parse(c.payload.terms.deadline) + FAIL_GRACE_MS) continue;
    await step(w, `fail ${c.payload.campaignId}`, () =>
      w.commands.run(
        "operator.fail",
        {
          commandId: `fail-op:${c.payload.campaignId}`,
          actAs: [op],
          userId: OPERATOR_USER,
          commands: [{ ExerciseCommand: { templateId: T.Campaign, contractId: c.contractId, choice: "Campaign_Fail", choiceArgument: { actor: op } } }],
        },
        c.payload.campaignId,
      ),
    );
  }

  // Unclaimed entitlements lapse after the claim window.
  for (const e of entitlements) {
    if (now.getTime() < Date.parse(e.payload.claimWindowEnd)) continue;
    await step(w, `expire ${e.contractId}`, () =>
      w.commands.run("operator.expire", {
        commandId: `expire-ent:${e.contractId}`,
        actAs: [op],
        userId: OPERATOR_USER,
        commands: [{ ExerciseCommand: { templateId: T.BonusEntitlement, contractId: e.contractId, choice: "BonusEntitlement_Expire", choiceArgument: {} } }],
      }),
    );
  }
}

/** Accept bond transfers addressed to the operator and tagged with a campaign ID. */
async function acceptBondTransfers(w: WorkerContext, op: string): Promise<void> {
  for (const t of await incomingTransfers(w, op)) {
    const view = t.interfaceView as TransferInstructionView;
    const campaignId = view.transfer.meta.values[CAMPAIGN_META_KEY];
    if (!campaignId) continue;
    await step(w, `accept bond ${campaignId}`, async () => {
      const context = await w.registry.transferInstructionContext(t.contractId, "accept");
      const out = await w.commands.run<{ output: { tag: string; value: { receiverHoldingCids?: string[] } } }>(
        "operator.accept-bond",
        {
          commandId: `bond-accept:${t.contractId}`,
          actAs: [op],
          userId: OPERATOR_USER,
          commands: [{ ExerciseCommand: { templateId: I.TransferInstruction, contractId: t.contractId, choice: "TransferInstruction_Accept", choiceArgument: { extraArgs: extraArgsFrom(context.choiceContextData) } } }],
          disclosedContracts: context.disclosedContracts,
        },
        campaignId,
      );
      const holdings = out.result.output.value.receiverHoldingCids ?? [];
      await w.db.query(
        "INSERT INTO bond_ledger (campaign_id, kind, amount_micro, holding_cids, reference, counterparty) VALUES ($1, 'received', $2, $3, $4, $5) ON CONFLICT DO NOTHING",
        [campaignId, fromTokenDecimal(view.transfer.amount).toString(), holdings, t.contractId, view.transfer.sender],
      );
    });
  }
}

/** Bond received for a campaign and not yet escrowed, with the holdings it arrived as. */
async function receivedBond(w: WorkerContext, campaignId: string): Promise<{ amount: bigint; holdings: string[] } | undefined> {
  const r = await w.db.query<{ amount_micro: string; holding_cids: string[] }>("SELECT amount_micro, holding_cids FROM bond_ledger WHERE campaign_id = $1 AND kind = 'received'", [campaignId]);
  if (r.rows.length === 0) return undefined;
  return { amount: r.rows.reduce((a, x) => a + BigInt(x.amount_micro), 0n), holdings: r.rows.flatMap((x) => x.holding_cids) };
}

/** Operator holdings that are not earmarked for a proposal still awaiting acceptance. */
async function spendableHoldings(w: WorkerContext, op: string): Promise<{ cid: string; micro: bigint }[]> {
  const earmarked = await w.db.query<{ holding_cids: string[] }>(
    `SELECT holding_cids FROM bond_ledger r WHERE kind = 'received'
       AND NOT EXISTS (SELECT 1 FROM bond_ledger x WHERE x.campaign_id = r.campaign_id AND x.kind IN ('escrowed', 'refunded'))`,
  );
  const reserved = new Set(earmarked.rows.flatMap((r) => r.holding_cids));
  return (await unlockedHoldings(w, op)).filter((h) => !reserved.has(h.cid));
}

async function reject(w: WorkerContext, proposalCid: string, campaignId: string, reason: string): Promise<void> {
  await w.commands.run(
    "operator.reject-proposal",
    {
      commandId: `reject:${proposalCid}`,
      actAs: [w.deployment.operatorParty],
      userId: OPERATOR_USER,
      commands: [{ ExerciseCommand: { templateId: T.CampaignProposal, contractId: proposalCid, choice: "CampaignProposal_Reject", choiceArgument: { reason } } }],
    },
    campaignId,
  );
}

/** Send bond funds from the operator to a party through the registry (refunds). */
async function transferOut(w: WorkerContext, campaignId: string, to: string, micro: bigint, kind: "refunded", commandId: string): Promise<void> {
  const op = w.deployment.operatorParty;
  const r = await w.db.query<{ holding_cids: string[] }>("SELECT holding_cids FROM bond_ledger WHERE campaign_id = $1 AND kind = 'received'", [campaignId]);
  const live = new Set((await unlockedHoldings(w, op)).map((h) => h.cid));
  const inputs = r.rows.flatMap((x) => x.holding_cids).filter((c) => live.has(c));
  if (inputs.length === 0) throw new Error(`no bond holdings left to refund for ${campaignId}`);
  const now = w.now();
  const choiceArgument = {
    expectedAdmin: w.deployment.instrument.admin,
    transfer: {
      sender: op,
      receiver: to,
      amount: toTokenDecimal(micro, w.deployment.instrument.decimals),
      instrumentId: { admin: w.deployment.instrument.admin, id: w.deployment.instrument.id },
      requestedAt: new Date(now.getTime() - 1000).toISOString(),
      executeBefore: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      inputHoldingCids: inputs,
      meta: { values: { [CAMPAIGN_META_KEY]: campaignId, "summertime.reason": "bond refund" } },
    },
    extraArgs: extraArgsFrom(undefined),
  };
  const factory = await w.registry.transferFactory(choiceArgument);
  choiceArgument.extraArgs = extraArgsFrom(factory.choiceContext.choiceContextData);
  await w.commands.run(
    "operator.refund-bond",
    {
      commandId,
      actAs: [op],
      userId: OPERATOR_USER,
      commands: [{ ExerciseCommand: { templateId: I.TransferFactory, contractId: factory.factoryId, choice: "TransferFactory_Transfer", choiceArgument } }],
      disclosedContracts: factory.choiceContext.disclosedContracts,
    },
    campaignId,
  );
  await w.db.query("INSERT INTO bond_ledger (campaign_id, kind, amount_micro, reference, counterparty) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [
    campaignId,
    kind,
    micro.toString(),
    commandId,
    to,
  ]);
}
