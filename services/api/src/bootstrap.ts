// Bootstrap a development or demo deployment on a fresh ledger:
//   - allocate the registry admin, operator, forwarder and importer parties;
//   - create one Ledger API user per party (forwarder and operator never share one);
//   - create the reference token's rules (the local registry);
//   - seed demo accounts and test balances;
//   - record the deployment in the application database.
//
// Idempotent: if the recorded parties still exist on the ledger, nothing happens. If the
// ledger was reset (the sandbox is in-memory), the application database is reset too.

import { LedgerError, T, TestToken } from "@summertime/ledger";
import { CommandRunner, createDb, createLedger, createLogger, getSystemConfig, loadConfig, migrate, setSystemConfig, type Deployment } from "@summertime/platform";

const config = loadConfig();
const log = createLogger("bootstrap");
const db = createDb(config.databaseUrl);
const ledger = createLedger(config);
const commands = new CommandRunner(ledger, db, log);

interface Account {
  handle: string;
  displayName: string;
  role: "forwarder" | "importer" | "operator";
  usdc: string;
}

// Fictional demo accounts.
const accounts: Account[] = [
  { handle: "harbor-bridge", displayName: "Harbor Bridge Freight", role: "forwarder", usdc: "5000" },
  { handle: "ada", displayName: "Ada Phone Accessories", role: "importer", usdc: "20000" },
  { handle: "bola", displayName: "Bola Textiles", role: "importer", usdc: "20000" },
  { handle: "chidi", displayName: "Chidi Auto Parts", role: "importer", usdc: "20000" },
  { handle: "dami", displayName: "Dami Beauty Supplies", role: "importer", usdc: "20000" },
  { handle: "emeka", displayName: "Emeka Electronics", role: "importer", usdc: "20000" },
  { handle: "funmi", displayName: "Funmi Home Goods", role: "importer", usdc: "20000" },
  { handle: "operator", displayName: "Summertime (operator)", role: "operator", usdc: "0" },
];

await migrate(db);

const existing = await getSystemConfig<Deployment>(db, "deployment");
const onLedger = new Set(await ledger.listParties());
if (existing && onLedger.has(existing.operatorParty) && onLedger.has(existing.registryAdmin) && !process.argv.includes("--reset")) {
  log.info({ operator: existing.operatorParty }, "deployment already bootstrapped");
  await db.end();
  process.exit(0);
}

if (existing) log.warn("ledger was reset or --reset given: clearing application data");
await db.query(
  "TRUNCATE users, party_links, sessions, login_codes, campaign_index, campaign_invitees, command_log, idempotency_keys, ledger_offsets, bond_ledger, capacity_holds, system_config CASCADE",
);

/** Allocate a party, waiting for the participant to finish connecting to its synchronizer. */
async function allocate(hint: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ledger.allocateParty(hint);
    } catch (e) {
      if (e instanceof LedgerError && e.code === "PARTY_ALLOCATION_WITHOUT_CONNECTED_SYNCHRONIZER" && attempt < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
}

const suffix = Date.now().toString(36);
const registryAdmin = await allocate(`SummertimeTestRegistry-${suffix}`);
await ledger.createUser(`u-registry-${suffix}`, registryAdmin, [registryAdmin]);

// DARs passed to the sandbox are uploaded and vetted asynchronously after it reports ready.
// Wait until both packages answer a query before seeding.
for (let attempt = 0; ; attempt++) {
  try {
    await ledger.activeContracts([registryAdmin], { templates: [TestToken.TokenRules, T.Campaign] });
    break;
  } catch (e) {
    if (attempt >= 60) throw e;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

await commands.run("bootstrap.token-rules", {
  commandId: `bootstrap:rules:${suffix}`,
  actAs: [registryAdmin],
  userId: `u-registry-${suffix}`,
  commands: [{ CreateCommand: { templateId: TestToken.TokenRules, createArguments: { admin: registryAdmin } } }],
});

const instrument = { admin: registryAdmin, id: "USDCx", decimals: 6, symbol: "USDCx" };
let operatorParty = "";

for (const a of accounts) {
  const party = await allocate(`${a.handle}-${suffix}`);
  // One Ledger API user per party. In the sandbox there is no auth; on DevNet these users
  // carry exactly CanActAs(party), so the API and worker can only act as intended.
  await ledger.createUser(`u-${a.handle}`, party, [party]);
  const u = await db.query<{ id: string }>("INSERT INTO users (handle, display_name, role, email) VALUES ($1, $2, $3, $4) RETURNING id", [
    a.handle,
    a.displayName,
    a.role,
    `${a.handle}@summertime.demo`,
  ]);
  await db.query("INSERT INTO party_links (user_id, party_id, mode) VALUES ($1, $2, 'pilot')", [u.rows[0]!.id, party]);
  if (a.role === "operator") operatorParty = party;
  if (a.usdc !== "0") {
    await commands.run("bootstrap.mint", {
      commandId: `bootstrap:mint:${a.handle}:${suffix}`,
      actAs: [registryAdmin, party],
      userId: `u-registry-${suffix}`,
      commands: [
        {
          CreateCommand: {
            templateId: TestToken.Token,
            createArguments: { holding: { owner: party, instrumentId: { admin: registryAdmin, id: "USDCx" }, amount: `${a.usdc}.0`, lock: null, meta: { values: {} } } },
          },
        },
      ],
    });
  }
  log.info({ handle: a.handle, role: a.role }, "account ready");
}

const deployment: Deployment = { operatorParty, registryAdmin, instrument, network: "sandbox" };
await setSystemConfig(db, "deployment", deployment);
log.info({ templates: Object.keys(T).length }, "bootstrap complete");
await db.end();
