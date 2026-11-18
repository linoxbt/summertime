// Party-scoped ledger reads and DTO mapping. Every read is made as one party, so a caller
// only ever receives what that party's own ledger view contains (NFR-2, NFR-3).

import {
  I,
  T,
  bothUnits,
  formatCbm,
  formatUsdc,
  fromTokenDecimal,
  phaseOf,
  type ActiveContract,
  type Amount,
  type BondTicket,
  type BonusEntitlement,
  type BonusPayout,
  type Campaign,
  type CampaignOutcome,
  type CampaignProposal,
  type CampaignTerms,
  type Capacity,
  type CapacityReservation,
  type Commitment,
  type HoldingView,
  type Invitation,
  type OrganizerBond,
  type OutcomeDto,
  type ProgressView,
  type Receipt,
  type ReceiptDto,
  type BookingConfirmation,
  type BookingDto,
  type DisputeDto,
  type DisputeRecord,
  type DisputeResolution,
  type ReservationRequest,
  type TermsDto,
  type TemplateName,
} from "@summertime/ledger";
import { createHash } from "node:crypto";
import type { AppContext } from "./context.ts";

export const amount = (micro: string | bigint): Amount => ({ micro: micro.toString(), display: formatUsdc(micro) });
// Display strings carry no unit, matching Amount; clients add "CBM" / "USDCx".
export const capacity = (milli: string | bigint): Capacity => ({ milliCbm: milli.toString(), display: formatCbm(milli) });

export function termsDto(t: CampaignTerms): TermsDto {
  const rate = BigInt(t.rateMicroUsdcPerMilliCbm);
  return {
    capacity: capacity(t.containerCapacityMilliCbm),
    threshold: capacity(t.thresholdMilliCbm),
    minReservation: capacity(t.minReservationMilliCbm),
    maxReservation: capacity(t.maxReservationMilliCbm),
    rateMicroUsdcPerMilliCbm: t.rateMicroUsdcPerMilliCbm,
    ratePerCbm: amount(rate * 1000n),
    bond: amount(t.bondMicroUsdc),
    fullCapacityValue: amount(BigInt(t.containerCapacityMilliCbm) * rate),
    lockTime: t.lockTime,
    deadline: t.deadline,
    claimWindowEnd: t.claimWindowEnd,
    instrument: t.instrumentId,
    tokenDecimals: Number(t.tokenDecimals),
  };
}

export { bothUnits };

/** Active contracts of one template visible to one party. */
export function acs<P>(ctx: AppContext, party: string, template: TemplateName): Promise<ActiveContract<P>[]> {
  return ctx.ledger.activeContracts<P>([party], { templates: [T[template]] });
}

export interface PartyLedger {
  proposals: ActiveContract<CampaignProposal>[];
  campaigns: ActiveContract<Campaign>[];
  bonds: ActiveContract<OrganizerBond>[];
  invitations: ActiveContract<Invitation>[];
  requests: ActiveContract<ReservationRequest>[];
  reservations: ActiveContract<CapacityReservation>[];
  commitments: ActiveContract<Commitment>[];
  tickets: ActiveContract<BondTicket>[];
  entitlements: ActiveContract<BonusEntitlement>[];
  payouts: ActiveContract<BonusPayout>[];
  outcomes: ActiveContract<CampaignOutcome>[];
  receipts: ActiveContract<Receipt>[];
  progress: ActiveContract<ProgressView>[];
  bookings: ActiveContract<BookingConfirmation>[];
  disputes: ActiveContract<DisputeRecord>[];
  resolutions: ActiveContract<DisputeResolution>[];
}

/** One snapshot of everything Summertime-related that a party can see. */
export async function partyLedger(ctx: AppContext, party: string): Promise<PartyLedger> {
  const all = await ctx.ledger.activeContracts<unknown>([party], { templates: Object.values(T) });
  const pick = <P>(name: TemplateName) => all.filter((c) => c.templateId.endsWith(T[name].slice(T[name].indexOf(":")))) as ActiveContract<P>[];
  return {
    proposals: pick("CampaignProposal"),
    campaigns: pick("Campaign"),
    bonds: pick("OrganizerBond"),
    invitations: pick("Invitation"),
    requests: pick("ReservationRequest"),
    reservations: pick("CapacityReservation"),
    commitments: pick("Commitment"),
    tickets: pick("BondTicket"),
    entitlements: pick("BonusEntitlement"),
    payouts: pick("BonusPayout"),
    outcomes: pick("CampaignOutcome"),
    receipts: pick("Receipt"),
    progress: pick("ProgressView"),
    bookings: pick("BookingConfirmation"),
    disputes: pick("DisputeRecord"),
    resolutions: pick("DisputeResolution"),
  };
}

export async function bookingDto(ctx: AppContext, b: ActiveContract<BookingConfirmation>): Promise<BookingDto> {
  const p = b.payload;
  return {
    contractId: b.contractId,
    importer: await ctx.directory.ref(p.importer),
    reservationId: p.reservationId,
    bookingRef: p.bookingRef,
    etd: p.etd,
    containerNo: p.containerNo,
    acknowledgedAt: p.acknowledgedAt,
  };
}

/**
 * Open and resolved disputes for a campaign from one party's view. Evidence text comes from
 * the application database only for disputes this party can see on the ledger, and is
 * checked against the hash the ledger holds.
 */
export async function disputeDtos(ctx: AppContext, L: PartyLedger, campaignId: string, importer?: string): Promise<DisputeDto[]> {
  const mine = <T extends { campaignId: string; importer: string }>(c: ActiveContract<T>) =>
    c.payload.campaignId === campaignId && (!importer || c.payload.importer === importer);
  const records = [...L.disputes.filter(mine), ...L.resolutions.filter(mine)];
  const hashes = records.map((r) => r.payload.evidenceHash);
  const ev = hashes.length
    ? await ctx.db.query<{ evidence_hash: string; details: string }>("SELECT evidence_hash, details FROM dispute_evidence WHERE evidence_hash = ANY($1)", [hashes])
    : { rows: [] };
  const details = new Map(ev.rows.map((r) => [r.evidence_hash, r.details]));
  const out: DisputeDto[] = [];
  for (const r of records) {
    const p = r.payload as DisputeRecord & Partial<DisputeResolution>;
    const text = details.get(p.evidenceHash) ?? null;
    out.push({
      contractId: r.contractId,
      importer: await ctx.directory.ref(p.importer),
      reservationId: p.reservationId,
      subject: p.subject,
      details: text,
      evidenceHash: p.evidenceHash,
      evidenceVerified: text !== null && sha256(text) === p.evidenceHash,
      openedAt: p.openedAt,
      status: p.resolution !== undefined ? "resolved" : "open",
      resolution: p.resolution,
      resolvedAt: p.resolvedAt,
    });
  }
  return out.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Allocation contract IDs that still exist in the party's view (executor or sender). */
export async function liveAllocations(ctx: AppContext, party: string): Promise<Set<string>> {
  const allocs = await ctx.ledger.activeContracts([party], { interfaces: [I.Allocation] });
  return new Set(allocs.map((a) => a.contractId));
}

export async function balance(ctx: AppContext, party: string): Promise<{ available: bigint; locked: bigint; holdings: { cid: string; micro: bigint }[] }> {
  const d = await ctx.deployment();
  const hs = await ctx.ledger.activeContracts<unknown>([party], { interfaces: [I.Holding] });
  let available = 0n;
  let locked = 0n;
  const holdings: { cid: string; micro: bigint }[] = [];
  for (const h of hs) {
    const v = h.interfaceView as HoldingView | undefined;
    if (!v || v.owner !== party || v.instrumentId.admin !== d.instrument.admin || v.instrumentId.id !== d.instrument.id) continue;
    const micro = fromTokenDecimal(v.amount);
    if (v.lock) locked += micro;
    else {
      available += micro;
      holdings.push({ cid: h.contractId, micro });
    }
  }
  return { available, locked, holdings };
}

/** Pick unlocked holdings covering an amount (largest first). */
export function selectHoldings(holdings: { cid: string; micro: bigint }[], needed: bigint): string[] | undefined {
  const sorted = [...holdings].sort((a, b) => (b.micro > a.micro ? 1 : b.micro < a.micro ? -1 : 0));
  const picked: string[] = [];
  let total = 0n;
  for (const h of sorted) {
    if (total >= needed) break;
    picked.push(h.cid);
    total += h.micro;
  }
  return total >= needed ? picked : undefined;
}

export async function outcomeDto(ctx: AppContext, o: CampaignOutcome): Promise<OutcomeDto> {
  return {
    result: o.result,
    settled: capacity(o.settledMilliCbm),
    settledAmount: amount(o.settledMicroUsdc),
    legCount: Number(o.legCount),
    updateId: o.result === "Succeeded" ? await updateIdFor(ctx, `campaign.execute`, o.campaignId) : undefined,
  };
}

/** The ledger update ID of the most recent successful command of a kind for a campaign. */
export async function updateIdFor(ctx: AppContext, kind: string, campaignId: string): Promise<string | undefined> {
  const r = await ctx.db.query<{ update_id: string }>(
    `SELECT update_id FROM command_log WHERE kind = $1 AND status = 'succeeded' AND subject = $2 ORDER BY updated_at DESC LIMIT 1`,
    [kind, campaignId],
  );
  return r.rows[0]?.update_id;
}

export async function receiptDto(ctx: AppContext, r: ActiveContract<Receipt>): Promise<ReceiptDto> {
  const p = r.payload;
  return {
    contractId: r.contractId,
    campaignId: p.campaignId,
    kind: p.kind,
    reserved: capacity(p.reservedMilliCbm),
    amount: amount(p.amountMicroUsdc),
    note: p.note,
    createdAt: r.createdAt,
    updateId: await updateIdForContract(ctx, r.contractId),
  };
}

/** Update ID of the command that created a contract, from the command log. */
export async function updateIdForContract(ctx: AppContext, contractId: string): Promise<string | undefined> {
  const r = await ctx.db.query<{ update_id: string }>(
    `SELECT update_id FROM command_log WHERE status = 'succeeded' AND result->'created' @> $1::jsonb LIMIT 1`,
    [JSON.stringify([{ contractId }])],
  );
  return r.rows[0]?.update_id;
}

export interface CampaignLabel {
  title: string;
  route: string | null;
  createdAt: string;
  forwarderParty: string;
  terms: CampaignTerms;
  autoSettle: boolean;
}

export async function campaignLabels(ctx: AppContext, ids: string[]): Promise<Map<string, CampaignLabel>> {
  if (ids.length === 0) return new Map();
  const r = await ctx.db.query<{ campaign_id: string; title: string; route: string | null; created_at: Date; forwarder_party: string; terms_snapshot: CampaignTerms; auto_execute: boolean }>(
    "SELECT campaign_id, title, route, created_at, forwarder_party, terms_snapshot, auto_execute FROM campaign_index WHERE campaign_id = ANY($1)",
    [ids],
  );
  return new Map(
    r.rows.map((x) => [x.campaign_id, { title: x.title, route: x.route, createdAt: x.created_at.toISOString(), forwarderParty: x.forwarder_party, terms: x.terms_snapshot, autoSettle: x.auto_execute }]),
  );
}

export { phaseOf };
