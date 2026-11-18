// Onboard Summertime onto an external participant: DevNet, TestNet or MainNet, self-hosted or
// node-as-a-service. The counterpart of bootstrap.ts, which builds our own test ledger.
//
// What it does (idempotent; safe to run on every start):
//   - uploads the Summertime package (UPLOAD_DARS, default: the built summertime-core DAR);
//   - allocates the operator party, or adopts OPERATOR_PARTY if the provider created it;
//   - grants the Ledger API service user the rights it needs (single-user mode, see
//     packages/platform/src/ledger-auth.ts);
//   - records the deployment: network and the real instrument (no test token, no faucet,
//     no demo accounts);
//   - creates the operator's sign-in from OPERATOR_EMAIL and OPERATOR_PASSWORD.
//
// Required: NETWORK (devnet | testnet | mainnet), INSTRUMENT_ADMIN, INSTRUMENT_ID.
// Optional: INSTRUMENT_DECIMALS (6), INSTRUMENT_SYMBOL (USDCx), OPERATOR_PARTY,
//           OPERATOR_PARTY_HINT (summertime-operator), UPLOAD_DARS.
// The instrument admin must come from an official source (Circle / Digital Asset for USDCx,
// the DSO party for Canton Coin); REGISTRY_URL must point at that instrument's registry.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LedgerError } from "@summertime/ledger";
import { createDb, createLedger, createLogger, getSystemConfig, loadConfig, migrate, setSystemConfig, type Deployment } from "@summertime/platform";
import { hashPassword } from "./passwords.ts";

const NETWORKS = ["devnet", "testnet", "mainnet"] as const;
type Network = (typeof NETWORKS)[number];

const config = loadConfig();
const log = createLogger("onboard");

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} must be set for onboarding`);
  return v;
}

const network = need("NETWORK") as Network;
if (!NETWORKS.includes(network)) throw new Error(`NETWORK must be one of ${NETWORKS.join(", ")}`);
const instrument = {
  admin: need("INSTRUMENT_ADMIN"),
  id: need("INSTRUMENT_ID"),
  decimals: Number(process.env.INSTRUMENT_DECIMALS ?? "6"),
  symbol: process.env.INSTRUMENT_SYMBOL?.trim() || "USDCx",
};
if (!Number.isInteger(instrument.decimals) || instrument.decimals < 0 || instrument.decimals > 10) throw new Error("INSTRUMENT_DECIMALS must be 0–10");
if (config.demoMode) log.warn("DEMO_MODE is on: set DEMO_MODE=false on a real network (demo sign-in and the explorer stay off for real accounts anyway)");

const db = createDb(config.databaseUrl);
const ledger = createLedger(config);
await migrate(db);

// 1. Packages.
const defaultDar = fileURLToPath(new URL("../../../daml/summertime-core/.daml/dist/summertime-core-0.1.0.dar", import.meta.url));
for (const path of (process.env.UPLOAD_DARS ?? defaultDar).split(",").filter(Boolean)) {
  await ledger.uploadDar(new Uint8Array(await readFile(path)));
  log.info({ dar: path }, "package uploaded (a no-op if already there)");
}

// 2. Operator party.
const existing = await getSystemConfig<Deployment>(db, "deployment");
const onLedger = new Set(await ledger.listParties());
let operatorParty = process.env.OPERATOR_PARTY?.trim() || (existing && onLedger.has(existing.operatorParty) ? existing.operatorParty : "");
if (existing && existing.network !== network) throw new Error(`This database belongs to a ${existing.network} deployment; use a fresh database for ${network}`);
if (!operatorParty) {
  const hint = process.env.OPERATOR_PARTY_HINT?.trim() || "summertime-operator";
  for (let attempt = 0; ; attempt++) {
    try {
      operatorParty = await ledger.allocateParty(hint);
      break;
    } catch (e) {
      // Already allocated under this hint (an earlier run): adopt it.
      const found = (await ledger.listParties()).find((p) => p.startsWith(`${hint}::`));
      if (found) {
        operatorParty = found;
        break;
      }
      if (e instanceof LedgerError && e.code === "PARTY_ALLOCATION_WITHOUT_CONNECTED_SYNCHRONIZER" && attempt < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
  log.info({ operatorParty }, "operator party allocated");
} else if (!onLedger.has(operatorParty)) {
  throw new Error(`OPERATOR_PARTY ${operatorParty} is not known to this participant`);
}
await ledger.createUser("u-operator", operatorParty, [operatorParty]);

// 3. The operator's account in the application.
const op = await db.query<{ id: string }>("SELECT u.id FROM users u JOIN party_links p ON p.user_id = u.id WHERE p.party_id = $1", [operatorParty]);
if (op.rows.length === 0) {
  const email = process.env.OPERATOR_EMAIL?.trim().toLowerCase() || null;
  const password = process.env.OPERATOR_PASSWORD;
  const u = await db.query<{ id: string }>(
    `INSERT INTO users (handle, display_name, role, email, kind, password_hash, password_changed_at)
     VALUES ('operator', 'Summertime (operator)', 'operator', $1, 'member', $2, now())
     ON CONFLICT (handle) DO UPDATE SET role = 'operator' RETURNING id`,
    [email, password ? await hashPassword(password) : null],
  );
  await db.query("INSERT INTO party_links (user_id, party_id, mode) VALUES ($1, $2, 'pilot') ON CONFLICT (user_id) DO UPDATE SET party_id = EXCLUDED.party_id", [
    u.rows[0]!.id,
    operatorParty,
  ]);
  if (!email || !password) log.warn("OPERATOR_EMAIL and OPERATOR_PASSWORD are not set: the operator can't sign in to Operations yet");
}

// 4. The deployment record the API and worker read.
const deployment: Deployment = { operatorParty, registryAdmin: instrument.admin, instrument, network };
await setSystemConfig(db, "deployment", deployment);
log.info({ network, operatorParty, instrument: `${instrument.symbol} (${instrument.id}, admin ${instrument.admin.slice(0, 24)}…)`, registry: config.registryUrl }, "onboarding complete");
await db.end();
