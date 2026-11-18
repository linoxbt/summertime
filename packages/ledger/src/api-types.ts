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

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationList {
  items: NotificationDto[];
  unread: number;
}

export interface Preferences {
  notifyEmail: boolean;
  /** False when the server cannot send email (no provider configured). */
  emailAvailable: boolean;
}

export interface ContactMessageDto {
  id: string;
  name: string;
  email: string;
  company: string | null;
  topic: string;
  message: string;
  createdAt: string;
  handled: boolean;
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
  /** Settle automatically as soon as the threshold is met (worker, before the deadline). */
  autoSettle: boolean;
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

export interface BookingDto {
  contractId: string;
  importer: PartyRef;
  reservationId: string;
  bookingRef: string;
  etd: string;
  containerNo: string | null;
  acknowledgedAt: string | null;
}

export interface DisputeDto {
  contractId: string;
  importer: PartyRef;
  reservationId: string;
  subject: string;
  /** Off-ledger evidence text; its SHA-256 hash is what the ledger records. */
  details: string | null;
  evidenceHash: string;
  /** True if the off-ledger details still match the hash on the ledger. */
  evidenceVerified: boolean;
  openedAt: string;
  status: "open" | "resolved";
  resolution?: string;
  resolvedAt?: string;
}

export interface ForwarderCampaignDetail extends ForwarderCampaignSummary {
  reservations: ReservationRow[];
  bookings: BookingDto[];
  disputes: DisputeDto[];
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
  booking?: BookingDto;
  disputes: DisputeDto[];
  ids: {
    request?: string;
    reservation?: string;
    commitment?: string;
    ticket?: string;
    entitlement?: string;
    payout?: string;
    allocation?: string;
    settledReceipt?: string;
  };
  actions: { canCommit: boolean; canWithdraw: boolean; canClaim: boolean; canRelease: boolean; canDispute: boolean };
}

export interface BalanceDto {
  available: Amount;
  locked: Amount;
  instrument: string;
  /** Where the ledger runs; the test faucet exists only on our own test ledger ("sandbox"). */
  network: "sandbox" | "localnet" | "devnet" | "testnet" | "mainnet";
}

export interface SessionUser {
  id: string;
  handle: string;
  displayName: string;
  role: "forwarder" | "importer" | "operator";
  party: string;
  mode: "pilot" | "wallet";
  /** "demo": a seeded demo account (demo sign-in only). "member": a real account. */
  kind: "demo" | "member";
  email: string | null;
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

/** Operational status for the operator (GET /ops/status, spec 28). */
export interface OpsStatus {
  overall: "ok" | "warn" | "alert";
  checkedAt: string;
  worker: { lastPassAt: string | null; secondsSincePass: number | null; offset: number | null; ledgerEnd: number | null; status: "ok" | "alert" };
  checks: { name: string; status: "ok" | "warn" | "alert"; summary: string; checkedAt: string; detail: unknown }[];
  alerts: { id: string; name: string; severity: "warn" | "alert"; summary: string; raisedAt: string; resolvedAt: string | null }[];
  commands: { last24h: number; failed24h: number };
}
