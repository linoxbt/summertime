// Typed client for summertime-api, reached through the /api proxy on the web origin.

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Plain-language messages for API error codes (spec 23.2). */
const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  FORBIDDEN: "This account cannot do that.",
  NOT_FOUND: "We couldn't find that. It may have been completed or removed.",
  VALIDATION: "Some of the details aren't valid. Check the form and try again.",
  INVALID_TERMS: "These campaign terms aren't valid. Check capacity, threshold, reservation limits, times and bond.",
  BOND_OUT_OF_RANGE: "The bond must be between 1% and 5% of the full container value.",
  INSUFFICIENT_BALANCE: "There isn't enough USDCx in this account.",
  ALREADY_SENT: "The bond has already been sent for this campaign.",
  NOT_OPEN: "This campaign isn't open for that right now.",
  BELOW_THRESHOLD: "The committed capacity hasn't reached the threshold yet, so nothing can settle.",
  PAST_DEADLINE: "The deadline has passed, so this campaign can no longer settle.",
  ALREADY_FINAL: "This campaign has already ended.",
  NOT_EXPIRED: "This can only be done after the deadline.",
  CAPACITY_HELD: "Importers have already reserved space, so the campaign must run to its deadline.",
  BELOW_MIN: "That's below the smallest reservation this campaign allows.",
  ABOVE_MAX: "That's above the largest reservation this campaign allows.",
  OVER_CAPACITY: "There isn't enough space left in the container for that reservation.",
  EXPIRED: "This invitation or reservation has expired: the lock time has passed.",
  ALLOCATION_MISMATCH: "The funds you allocated don't match your reservation, so nothing was committed.",
  LOCKED: "The lock time has passed, so this can no longer be changed.",
  NOT_CLAIMABLE: "The bonus can be claimed only after the deadline.",
  ALREADY_CLAIMED: "This bonus has already been claimed.",
  WINDOW_CLOSED: "The claim window has closed.",
  ALLOCATION_WITHDRAWN: "Your funds were withdrawn after the lock time, so no bonus is due.",
  HIDDEN: "Progress appears once three importers have committed.",
  DISABLED: "This is only available in the demo environment.",
  IDEMPOTENCY_KEY_REUSED: "That request was already sent with different details. Please try again.",
  LEDGER_UNAVAILABLE: "The ledger isn't reachable right now. Nothing was changed; please try again shortly.",
  LEDGER_REJECTED: "The ledger rejected this action. Nothing was changed.",
  NETWORK: "We couldn't reach Summertime. Check your connection and try again.",
  BACKEND_OFFLINE: "Demo backend offline.",
  NO_ACCOUNT: "No account uses that email. Try a demo account below.",
  INVALID_CODE: "That code isn't right. Check it and try again.",
  CODE_EXPIRED: "That code has expired. Request a new one.",
  TOO_MANY_CODES: "Too many codes requested. Try again in a few minutes.",
  TOO_MANY_ATTEMPTS: "Too many wrong codes. Request a new one.",
  CODE_DELIVERY_UNAVAILABLE: "Email sign-in isn't available yet. Use a demo account.",
};

export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] ?? e.message ?? "Something went wrong.";
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

/** A new idempotency key; create one per user action and reuse it for retries of that action. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // crypto.randomUUID needs a secure context; fall back to getRandomValues.
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  let payload: string | undefined;
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = idempotencyKey ?? newIdempotencyKey();
    payload = JSON.stringify(body ?? {});
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError("NETWORK", MESSAGES.NETWORK!, 0);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status === 401 ? "UNAUTHENTICATED" : "NETWORK", MESSAGES.NETWORK!, res.status);
  }
  if (json && typeof json === "object" && "error" in json) {
    const err = (json as { error: { code?: string; message?: string } }).error;
    throw new ApiError(err.code ?? "ERROR", err.message ?? "Request failed", res.status);
  }
  if (!res.ok) throw new ApiError(res.status === 401 ? "UNAUTHENTICATED" : "ERROR", `Request failed (${res.status})`, res.status);
  return (json as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) => request<T>("POST", path, body, idempotencyKey),
};
