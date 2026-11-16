import { pino, type Logger } from "pino";
import { LedgerClient } from "@summertime/ledger";
import type { Config } from "./config.ts";
import type { Db } from "./db.ts";

export * from "./config.ts";
export * from "./db.ts";
export * from "./commands.ts";

export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
    // NFR-9: never log another party's amounts; command payloads are not logged.
    redact: ["req.headers.cookie", "req.headers.authorization"],
  });
}

export function createLedger(config: Config): LedgerClient {
  // Sandbox and LocalNet run without Ledger API auth. For DevNet and beyond, set
  // LEDGER_TOKEN (or replace with an OAuth client-credentials provider).
  const token = process.env.LEDGER_TOKEN;
  return new LedgerClient({ baseUrl: config.ledgerUrl, userId: config.ledgerUserId, token: async () => token });
}

/**
 * Hold a Postgres advisory lock for the life of the process: at most one active worker per
 * automated party set (spec 19.3). Returns false if another instance holds it.
 */
export async function acquireLeaderLock(db: Db, name: string): Promise<{ release: () => Promise<void> } | undefined> {
  const client = await db.connect();
  const key = hashKey(name);
  const r = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [key]);
  if (!r.rows[0]?.ok) {
    client.release();
    return undefined;
  }
  return {
    release: async () => {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
      client.release();
    },
  };
}

function hashKey(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return h;
}

export type { Logger };
