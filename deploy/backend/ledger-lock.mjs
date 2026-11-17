// Hold an exclusive Postgres advisory lock for the life of the container, so two containers
// (an old and a new deploy) never run the ledger against the same databases at once.
// Writes "locked" to the file named by argv[2] once acquired; exits if the connection drops.

import { writeFileSync } from "node:fs";
import pg from "pg";

const LOCK_KEY = 0x53_75_6d_6d; // "Summ"
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
client.on("error", (e) => {
  console.error(`[ledger-lock] connection lost: ${e.message}`);
  process.exit(1);
});
await client.connect();
const t0 = Date.now();
const waiting = setInterval(() => console.error(`[ledger-lock] waiting for the previous ledger to stop (${Math.round((Date.now() - t0) / 1000)}s)`), 10_000);
await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
clearInterval(waiting);
writeFileSync(process.argv[2], "locked");
console.error("[ledger-lock] acquired");
const stop = async () => {
  await client.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setInterval(() => client.query("SELECT 1").catch(() => process.exit(1)), 30_000);
