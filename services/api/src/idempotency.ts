// Idempotency-Key handling for every mutating endpoint (spec section 20).
//
// The first request with a key runs and its response is stored; repeats return the stored
// response. The key also seeds the deterministic ledger command ID, so even a repeat that
// races the first one cannot submit twice (the ledger deduplicates by command ID).

import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AppContext } from "./context.ts";
import { ApiError, invalid } from "./errors.ts";
import { me } from "./auth.ts";

export interface Idempotent {
  key: string;
  /** Deterministic command ID for this user action. */
  commandId: (kind: string) => string;
}

export async function idempotent<T>(ctx: AppContext, req: FastifyRequest, run: (i: Idempotent) => Promise<T>): Promise<{ status: number; body: unknown }> {
  const user = me(req);
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || key.length < 8 || key.length > 128) {
    throw invalid("IDEMPOTENCY_KEY_REQUIRED", "Send a unique Idempotency-Key header (8–128 characters) with every change.");
  }
  const requestHash = createHash("sha256").update(req.method).update(req.url).update(JSON.stringify(req.body ?? {})).digest("hex");
  const inserted = await ctx.db.query(
    "INSERT INTO idempotency_keys (user_id, key, request_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [user.id, key, requestHash],
  );
  if (inserted.rowCount === 0) {
    const prior = await ctx.db.query<{ request_hash: string; status_code: number | null; response: unknown }>(
      "SELECT request_hash, status_code, response FROM idempotency_keys WHERE user_id = $1 AND key = $2",
      [user.id, key],
    );
    const row = prior.rows[0]!;
    if (row.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used for a different request.");
    if (row.status_code !== null) return { status: row.status_code, body: row.response };
    throw new ApiError(409, "IN_PROGRESS", "This request is already being processed.");
  }
  const keyDigest = createHash("sha256").update(user.id).update(key).digest("hex").slice(0, 24);
  try {
    const data = await run({ key, commandId: (kind) => `${kind}:${keyDigest}` });
    const body = { data };
    await ctx.db.query("UPDATE idempotency_keys SET status_code = 200, response = $3 WHERE user_id = $1 AND key = $2", [user.id, key, JSON.stringify(body)]);
    return { status: 200, body };
  } catch (e) {
    // Failed requests may be retried with the same key.
    await ctx.db.query("DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2", [user.id, key]);
    throw e;
  }
}
