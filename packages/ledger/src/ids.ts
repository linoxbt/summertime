// Template and interface identifiers, in package-name reference format.

const core = (module: string, entity: string) => `#summertime-core:Summertime.${module}:${entity}`;

export const T = {
  CampaignProposal: core("Campaign", "CampaignProposal"),
  Campaign: core("Campaign", "Campaign"),
  OrganizerBond: core("Campaign", "OrganizerBond"),
  CapacityHold: core("Capacity", "CapacityHold"),
  CapacityRelease: core("Capacity", "CapacityRelease"),
  Invitation: core("Reservation", "Invitation"),
  ReservationRequest: core("Reservation", "ReservationRequest"),
  CapacityReservation: core("Reservation", "CapacityReservation"),
  SummertimeAllocationRequest: core("Reservation", "SummertimeAllocationRequest"),
  Commitment: core("Settlement", "Commitment"),
  BondTicket: core("Settlement", "BondTicket"),
  BonusEntitlement: core("Settlement", "BonusEntitlement"),
  BonusPayout: core("Settlement", "BonusPayout"),
  CampaignOutcome: core("Records", "CampaignOutcome"),
  Receipt: core("Records", "Receipt"),
  ProgressView: core("Records", "ProgressView"),
  BookingConfirmation: core("Records", "BookingConfirmation"),
  DisputeRecord: core("Records", "DisputeRecord"),
  DisputeResolution: core("Records", "DisputeResolution"),
} as const;

export type TemplateName = keyof typeof T;

/** Token-standard V1 interfaces (CIP-56). */
export const I = {
  Holding: "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding",
  Allocation: "#splice-api-token-allocation-v1:Splice.Api.Token.AllocationV1:Allocation",
  AllocationFactory: "#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory",
  TransferFactory: "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory",
  TransferInstruction: "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction",
  AllocationRequest: "#splice-api-token-allocation-request-v1:Splice.Api.Token.AllocationRequestV1:AllocationRequest",
} as const;

/** Splice's reference token, used as the local development registry. */
export const TestToken = {
  Token: "#splice-test-token-v1:Splice.Testing.Tokens.TestTokenV1:Token",
  TokenRules: "#splice-test-token-v1:Splice.Testing.Tokens.TestTokenV1:TokenRules",
} as const;

/** Match an event's template ID (package-id format) against a package-name reference. */
export function sameTemplate(eventTemplateId: string, ref: string): boolean {
  const suffix = ref.slice(ref.indexOf(":") + 1);
  return eventTemplateId.endsWith(":" + suffix) || eventTemplateId === ref;
}
