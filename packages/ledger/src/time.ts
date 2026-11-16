// Campaign phase derived from terms and the current time (section 14).

import type { CampaignTerms } from "./daml.ts";

export type Phase = "open" | "locked" | "expired" | "claimWindowClosed";

export function phaseOf(terms: Pick<CampaignTerms, "lockTime" | "deadline" | "claimWindowEnd">, now: Date = new Date()): Phase {
  const t = now.getTime();
  if (t < Date.parse(terms.lockTime)) return "open";
  if (t < Date.parse(terms.deadline)) return "locked";
  if (t < Date.parse(terms.claimWindowEnd)) return "expired";
  return "claimWindowClosed";
}

/** Daml Time accepts ISO-8601 UTC strings. */
export function damlTime(d: Date): string {
  return d.toISOString();
}
