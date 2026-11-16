// summertime-worker: offset-tracked, level-triggered automation for the operator and every
// pilot-hosted forwarder (spec 19.1, 19.3, 19.4).
//
// Each pass reads current ledger state and performs whatever is due. Every action has a
// deterministic command ID, so a crash or restart at any point resumes without double
// submission (NFR-4, NFR-6). A Postgres advisory lock keeps exactly one active instance.

import { RegistryClient } from "@summertime/ledger";
import { CommandRunner, acquireLeaderLock, createDb, createLedger, createLogger, getDeployment, loadConfig, migrate, pilotParties } from "@summertime/platform";
import { custodyPass } from "./custody.ts";
import { forwarderPass } from "./forwarder.ts";
import { operatorPass } from "./operator.ts";
import { opsPass } from "./ops.ts";
import type { WorkerContext } from "./shared.ts";

const WORKER_ID = "summertime-worker";

const config = loadConfig();
const log = createLogger(WORKER_ID);
const db = createDb(config.databaseUrl);
const ledger = createLedger(config);
await migrate(db);

const lock = await acquireLeaderLock(db, WORKER_ID);
if (!lock) {
  log.error("another worker instance holds the leader lock; exiting");
  process.exit(1);
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
  });
}

async function storedOffset(): Promise<number> {
  const r = await db.query<{ offset: string }>('SELECT "offset" FROM ledger_offsets WHERE worker_id = $1', [WORKER_ID]);
  return Number(r.rows[0]?.offset ?? 0);
}

async function storeOffset(offset: number): Promise<void> {
  await db.query(
    `INSERT INTO ledger_offsets (worker_id, "offset", updated_at, last_pass_at) VALUES ($1, $2, now(), now())
     ON CONFLICT (worker_id) DO UPDATE SET "offset" = EXCLUDED."offset", updated_at = now(), last_pass_at = now()`,
    [WORKER_ID, offset],
  );
}

log.info({ ledger: config.ledgerUrl, registry: config.registryUrl, tick: config.workerTickSeconds }, "worker started");
let lastFullPass = 0;
let lastOpsPass = 0;
const OPS_INTERVAL_MS = Number(process.env.OPS_INTERVAL_SECONDS ?? "60") * 1000;

while (!stopping) {
  const started = Date.now();
  try {
    const deployment = await getDeployment(db);
    const w: WorkerContext = {
      config,
      db,
      ledger,
      registry: new RegistryClient(config.registryUrl),
      commands: new CommandRunner(ledger, db, log),
      log,
      deployment,
      now: () => new Date(),
    };
    const end = await ledger.ledgerEnd();
    const from = await storedOffset();
    // Run on new ledger activity, and at least every 5 seconds for time-based triggers.
    if (end !== from || Date.now() - lastFullPass >= 5000) {
      const pilots = await pilotParties(db);
      await operatorPass(w);
      for (const f of pilots.filter((p) => p.role === "forwarder")) await forwarderPass(w, f);
      await custodyPass(w, pilots.filter((p) => p.role !== "operator"));
      await storeOffset(end);
      lastFullPass = Date.now();
      if (end !== from) log.debug({ from, end, ms: Date.now() - started }, "pass complete");
    }
    if (Date.now() - lastOpsPass >= OPS_INTERVAL_MS) {
      await opsPass(w, (await pilotParties(db)).filter((p) => p.role === "forwarder"));
      lastOpsPass = Date.now();
    }
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message.slice(0, 500) : String(e) }, "pass failed; retrying");
  }
  await new Promise((r) => setTimeout(r, config.workerTickSeconds * 1000));
}

await lock.release();
await db.end();
log.info("worker stopped");
