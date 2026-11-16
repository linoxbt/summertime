import { LedgerError, RegistryError } from "@summertime/ledger";
import { rejectionReason } from "@summertime/platform";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`);
export const forbidden = (msg = "Not allowed for this account") => new ApiError(403, "FORBIDDEN", msg);
export const conflict = (code: string, msg: string) => new ApiError(409, code, msg);
export const invalid = (code: string, msg: string) => new ApiError(400, code, msg);

/**
 * Map ledger rejections of known Summertime requirements to the error codes in spec section 20.
 * Unknown rejections become LEDGER_REJECTED with the requirement text.
 */
const requirementCodes: [RegExp, string, number][] = [
  [/threshold is met/, "BELOW_THRESHOLD", 409],
  [/settlement before the deadline/, "PAST_DEADLINE", 409],
  [/campaign fails only at or after the deadline/, "NOT_EXPIRED", 409],
  [/no capacity is held/, "CAPACITY_HELD", 409],
  [/container capacity is not exceeded/, "OVER_CAPACITY", 409],
  [/within the campaign's bounds/, "OUT_OF_BOUNDS", 400],
  [/invitation has not expired|before lockTime|only before lockTime/, "LOCKED", 409],
  [/withdrawal through Summertime is only possible before lockTime/, "LOCKED", 409],
  [/claim window is open/, "NOT_CLAIMABLE", 409],
  [/importer may release only at or after the deadline/, "NOT_EXPIRED", 409],
  [/allocation|settleBefore|allocateBefore|executor|receiver|sender|amount equals|transfer leg|settlement reference|requestedAt|instrument matches/, "ALLOCATION_MISMATCH", 422],
];

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof ZodError) return new ApiError(400, "VALIDATION", e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  if (e instanceof LedgerError) {
    const reason = rejectionReason(e);
    if (reason) {
      if (reason === "contract no longer active") return new ApiError(409, "STALE", "That item changed on the ledger. Refresh and try again.");
      for (const [re, code, status] of requirementCodes) if (re.test(reason)) return new ApiError(status, code, capitalize(reason));
      return new ApiError(422, "LEDGER_REJECTED", capitalize(reason));
    }
    if (e.status >= 500 || e.status === 0) return new ApiError(502, "LEDGER_UNAVAILABLE", "The ledger is not responding. Try again shortly.");
    return new ApiError(422, "LEDGER_REJECTED", "The ledger rejected this action.");
  }
  if (e instanceof RegistryError) return new ApiError(502, "REGISTRY_UNAVAILABLE", "The token registry is not responding. Try again shortly.");
  return new ApiError(500, "INTERNAL", "Something went wrong.");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith(".") ? "" : ".");
}

export function errorHandler(error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  const fastifyErr = error as FastifyError;
  if (fastifyErr.validation) {
    return reply.code(400).send({ error: { code: "VALIDATION", message: fastifyErr.message } });
  }
  const api = toApiError(error);
  if (api.status >= 500) req.log.error({ err: error }, "request failed");
  else req.log.info({ code: api.code }, "request rejected");
  return reply.code(api.status).send({ error: { code: api.code, message: api.message } });
}
