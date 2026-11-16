// Response types of summertime-api, shared with the web app.
// Amounts are integer sub-unit strings plus a display string (spec section 20).

export interface Amount {
  micro: string;
  display: string;
}

export interface Capacity {
  milliCbm: string;
  display: string;
}

export interface PartyRef {
  party: string;
  displayName: string;
  handle?: string;
}

export interface TermsDto {
  capacity: Capacity;
  threshold: Capacity;
  minReservation: Capacity;
  maxReservation: Capacity;
  rateMicroUsdcPerMilliCbm: string;
  ratePerCbm: Amount;
  bond: Amount;
  fullCapacityValue: Amount;
  lockTime: string;
  deadline: string;
  claimWindowEnd: string;
  instrument: { admin: string; id: string };
  tokenDecimals: number;
}

export type CampaignStatus =
  | "proposed"
  | "open"
  | "locked"
  | "expired"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "withdrawn";

export interface OutcomeDto {
  result: "Succeeded" | "Failed" | "Cancelled";
  settled: Capacity;
  settledAmount: Amount;
  legCount: number;
  updateId?: string;
}

export interface ForwarderCampaignSummary {
  campaignId: string;
  title: string;
  route: string | null;
  status: CampaignStatus;
  terms: TermsDto;
  held: Capacity;
  committed: Capacity;
  committedCount: number;
  thresholdMet: boolean;
  outcome?: OutcomeDto;
  createdAt: string;
}

export type ReservationStage = "requested" | "reserved" | "committed" | "allocation-withdrawn" | "settled";

export interface ReservationRow {
  reservationId: string;
  importer: PartyRef;
  stage: ReservationStage;
  reserved: Capacity;
  locked: Amount;
  contractId: string;
  bonus?: Amount;
}

export interface BondStatus {
  stage: "awaiting-transfer" | "transfer-sent" | "escrowed" | "locked" | "settled";
  amount: Amount;
  transferUpdateId?: string;
}

export interface ForwarderCampaignDetail extends ForwarderCampaignSummary {
  reservations: ReservationRow[];
  invitees: (PartyRef & { invitedAt: string; stage: ReservationStage | "invited" | "declined" })[];
  bond: BondStatus;
  canExecute: boolean;
  executeBlockers: string[];
}

export type PositionStage =
  | "invited"
  | "requested"
  | "awaiting-signature"
  | "committed"
  | "settled"
  | "withdrawn"
  | "claimable"
  | "bonus-pending"
  | "bonus-paid"
  | "released"
  | "lapsed";

export interface ProgressDto {
  hidden: boolean;
  reservedCbm: number;
  participantCount: number | null;
  asOf: string;
  capacityCbm: number;
  thresholdCbm: number;
}

export interface ReceiptDto {
  contractId: string;
  campaignId: string;
  kind: "Settled" | "Released" | "Withdrawn" | "BonusPaid";
  reserved: Capacity;
  amount: Amount;
  note: string;
  createdAt: string;
  updateId?: string;
}

export interface InvitationDto {
  contractId: string;
  campaignId: string;
  title: string;
  route: string | null;
  forwarder: PartyRef;
  terms: TermsDto;
  expiresAt: string;
}

export interface PositionDto {
  campaignId: string;
  title: string;
  route: string | null;
  forwarder: PartyRef;
  stage: PositionStage;
  phase: "open" | "locked" | "expired" | "claimWindowClosed";
  terms: TermsDto;
  reserved?: Capacity;
  locked?: Amount;
  bonus?: Amount;
  progress?: ProgressDto;
  receipts: ReceiptDto[];
  ids: {
    request?: string;
    reservation?: string;
    commitment?: string;
    ticket?: string;
    entitlement?: string;
    payout?: string;
    allocation?: string;
  };
  actions: { canCommit: boolean; canWithdraw: boolean; canClaim: boolean; canRelease: boolean };
}

export interface BalanceDto {
  available: Amount;
  locked: Amount;
  instrument: string;
}

export interface SessionUser {
  id: string;
  handle: string;
  displayName: string;
  role: "forwarder" | "importer" | "operator";
  party: string;
  mode: "pilot" | "wallet";
}

export interface ExplorerContract {
  contractId: string;
  template: string;
  signatories: string[];
  observers: string[];
  summary: Record<string, string>;
}

export interface ExplorerPane {
  viewer: PartyRef & { role: string };
  contracts: ExplorerContract[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type ApiResponse<T> = { data: T } | ApiErrorBody;
