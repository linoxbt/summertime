// Daml-JSON payload types for summertime-core and the token-standard interfaces.
// Daml Int and Decimal are JSON strings; Time is an ISO-8601 string; Optional is value-or-null.

export type Party = string;
export type ContractId = string;
export type DInt = string;
export type DDecimal = string;
export type DTime = string;

export interface InstrumentId {
  admin: Party;
  id: string;
}

export interface Metadata {
  values: Record<string, string>;
}

export interface ExtraArgs {
  context: { values: Record<string, unknown> };
  meta: Metadata;
}

export const emptyMetadata: Metadata = { values: {} };
export const noExtraArgs: ExtraArgs = { context: { values: {} }, meta: emptyMetadata };

/** Build ExtraArgs from a registry choice context (CIP-56 off-ledger API). */
export function extraArgsFrom(choiceContextData: unknown): ExtraArgs {
  const ctx = (choiceContextData ?? { values: {} }) as { values?: Record<string, unknown> };
  return { context: { values: ctx.values ?? {} }, meta: emptyMetadata };
}

export interface CampaignTerms {
  containerCapacityMilliCbm: DInt;
  thresholdMilliCbm: DInt;
  rateMicroUsdcPerMilliCbm: DInt;
  minReservationMilliCbm: DInt;
  maxReservationMilliCbm: DInt;
  lockTime: DTime;
  deadline: DTime;
  instrumentId: InstrumentId;
  tokenDecimals: DInt;
  bondMicroUsdc: DInt;
  claimWindowEnd: DTime;
}

export interface CampaignProposal {
  forwarder: Party;
  operator: Party;
  auditor: Party | null;
  campaignId: string;
  terms: CampaignTerms;
}

export interface Campaign {
  forwarder: Party;
  operator: Party;
  auditor: Party | null;
  campaignId: string;
  terms: CampaignTerms;
  heldMilliCbm: DInt;
  bondCid: ContractId;
}

export interface OrganizerBond {
  forwarder: Party;
  operator: Party;
  campaignId: string;
  terms: CampaignTerms;
  locked: boolean;
}

export interface CapacityHold {
  forwarder: Party;
  operator: Party;
  campaignId: string;
  reservedMilliCbm: DInt;
}

export interface CapacityRelease {
  importer: Party;
  forwarder: Party;
  operator: Party;
  campaignId: string;
  reservedMilliCbm: DInt;
}

export interface Invitation {
  forwarder: Party;
  operator: Party;
  importer: Party;
  campaignId: string;
  invitationId: string;
  terms: CampaignTerms;
}

export interface ReservationRequest {
  importer: Party;
  forwarder: Party;
  operator: Party;
  campaignId: string;
  reservationId: string;
  terms: CampaignTerms;
  reservedMilliCbm: DInt;
}

export interface CapacityReservation {
  forwarder: Party;
  importer: Party;
  operator: Party;
  campaignId: string;
  reservationId: string;
  reservedMilliCbm: DInt;
  lockedMicroUsdc: DInt;
  transferLegId: string;
  requestedAt: DTime;
  terms: CampaignTerms;
}

export interface SettlementInfo {
  executor: Party;
  settlementRef: { id: string; cid: ContractId | null };
  requestedAt: DTime;
  allocateBefore: DTime;
  settleBefore: DTime;
  meta: Metadata;
}

export interface TransferLeg {
  sender: Party;
  receiver: Party;
  amount: DDecimal;
  instrumentId: InstrumentId;
  meta: Metadata;
}

export interface SummertimeAllocationRequest {
  forwarder: Party;
  importer: Party;
  settlement: SettlementInfo;
  transferLegId: string;
  transferLeg: TransferLeg;
}

export interface Commitment {
  importer: Party;
  forwarder: Party;
  operator: Party;
  campaignId: string;
  reservationId: string;
  reservedMilliCbm: DInt;
  lockedMicroUsdc: DInt;
  allocationCid: ContractId;
  terms: CampaignTerms;
}

export interface BondTicket {
  importer: Party;
  forwarder: Party;
  operator: Party;
  campaignId: string;
  reservationId: string;
  commitmentCid: ContractId;
  reservedMilliCbm: DInt;
  terms: CampaignTerms;
}

export interface BonusEntitlement {
  operator: Party;
  forwarder: Party;
  importer: Party;
  campaignId: string;
  reservationId: string;
  commitmentCid: ContractId;
  reservedMilliCbm: DInt;
  bonusMicroUsdc: DInt;
  instrumentId: InstrumentId;
  tokenDecimals: DInt;
  claimableAfter: DTime;
  claimWindowEnd: DTime;
}

export interface BonusPayout {
  operator: Party;
  forwarder: Party;
  importer: Party;
  campaignId: string;
  reservationId: string;
  reservedMilliCbm: DInt;
  bonusMicroUsdc: DInt;
  instrumentId: InstrumentId;
  tokenDecimals: DInt;
}

export type Outcome = "Succeeded" | "Failed" | "Cancelled";

export interface CampaignOutcome {
  forwarder: Party;
  operator: Party;
  auditor: Party | null;
  campaignId: string;
  result: Outcome;
  settledMilliCbm: DInt;
  settledMicroUsdc: DInt;
  legCount: DInt;
}

export type ReceiptKind = "Settled" | "Released" | "Withdrawn" | "BonusPaid";

export interface Receipt {
  forwarder: Party;
  importer: Party;
  campaignId: string;
  reservationId: string;
  kind: ReceiptKind;
  reservedMilliCbm: DInt;
  amountMicroUsdc: DInt;
  note: string;
}

export interface ProgressView {
  forwarder: Party;
  importer: Party;
  campaignId: string;
  reservedCbmRounded: DInt;
  participantCount: DInt | null;
  hidden: boolean;
  asOf: DTime;
}

export interface HoldingView {
  owner: Party;
  instrumentId: InstrumentId;
  amount: DDecimal;
  lock: unknown | null;
  meta: Metadata;
}

export interface TransferInstructionView {
  originalInstructionCid: ContractId | null;
  transfer: {
    sender: Party;
    receiver: Party;
    amount: DDecimal;
    instrumentId: InstrumentId;
    requestedAt: DTime;
    executeBefore: DTime;
    inputHoldingCids: ContractId[];
    meta: Metadata;
  };
  status: unknown;
  meta: Metadata;
}

export interface AllocationView {
  allocation: { settlement: SettlementInfo; transferLegId: string; transferLeg: TransferLeg };
  holdingCids: ContractId[];
  meta: Metadata;
}

export type BonusRef = { tag: "TicketRef"; value: ContractId } | { tag: "EntitlementRef"; value: ContractId };

export interface SettleLeg {
  commitmentCid: ContractId;
  bonusRef: BonusRef;
  extraArgs: ExtraArgs;
}

export type TransferInstructionResultOutput =
  | { tag: "TransferInstructionResult_Pending"; value: { transferInstructionCid: ContractId } }
  | { tag: "TransferInstructionResult_Completed"; value: { receiverHoldingCids: ContractId[] } }
  | { tag: "TransferInstructionResult_Failed"; value: Record<string, never> };

export interface TransferInstructionResult {
  output: TransferInstructionResultOutput;
  senderChangeCids: ContractId[];
  meta: Metadata;
}

/** Metadata key linking a bond transfer to its campaign. */
export const CAMPAIGN_META_KEY = "summertime.campaignId";
