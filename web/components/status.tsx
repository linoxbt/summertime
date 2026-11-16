import type { CampaignStatus, PositionStage, ReservationStage, BondStatus } from "@summertime/ledger";
import { Badge } from "./ui";

const CAMPAIGN: Record<CampaignStatus, { label: string; tone: "neutral" | "accent" | "success" | "danger" | "info" }> = {
  proposed: { label: "Awaiting bond", tone: "neutral" },
  open: { label: "Open", tone: "info" },
  locked: { label: "Locked", tone: "accent" },
  expired: { label: "Deadline passed", tone: "neutral" },
  succeeded: { label: "Settled", tone: "success" },
  failed: { label: "Did not fill", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = CAMPAIGN[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const RESERVATION: Record<ReservationStage | "invited" | "declined", { label: string; tone: "neutral" | "accent" | "success" | "danger" | "info" }> = {
  invited: { label: "Invited", tone: "neutral" },
  declined: { label: "Declined", tone: "neutral" },
  requested: { label: "Requested", tone: "info" },
  reserved: { label: "Awaiting signature", tone: "accent" },
  committed: { label: "Committed", tone: "success" },
  "allocation-withdrawn": { label: "Funds withdrawn", tone: "danger" },
  settled: { label: "Settled", tone: "success" },
};

export function ReservationStageBadge({ stage }: { stage: ReservationStage | "invited" | "declined" }) {
  const s = RESERVATION[stage] ?? { label: stage, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const POSITION: Record<PositionStage, { label: string; tone: "neutral" | "accent" | "success" | "danger" | "info" }> = {
  invited: { label: "Invited", tone: "neutral" },
  requested: { label: "Awaiting countersignature", tone: "info" },
  "awaiting-signature": { label: "Sign to commit", tone: "accent" },
  committed: { label: "Committed", tone: "success" },
  settled: { label: "Settled", tone: "success" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  claimable: { label: "Bonus to claim", tone: "accent" },
  "bonus-pending": { label: "Bonus being paid", tone: "info" },
  "bonus-paid": { label: "Bonus paid", tone: "success" },
  released: { label: "Released", tone: "neutral" },
  lapsed: { label: "Lapsed", tone: "neutral" },
};

export function PositionStageBadge({ stage }: { stage: PositionStage }) {
  const s = POSITION[stage] ?? { label: stage, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const BOND: Record<BondStatus["stage"], string> = {
  "awaiting-transfer": "Not sent yet",
  "transfer-sent": "Sent, awaiting Summertime",
  escrowed: "Held by Summertime",
  locked: "Locked for bonuses",
  settled: "Settled",
};

export function bondStageLabel(stage: BondStatus["stage"]): string {
  return BOND[stage] ?? stage;
}
