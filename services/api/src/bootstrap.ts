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
import { createHash } from "node:crypto";
import { hashPassword } from "./passwords.ts";
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
/**
 * The Summertime operator signs in for real when OPERATOR_EMAIL and OPERATOR_PASSWORD are
 * set: the operator account becomes a member account with that login and leaves the demo.
 * Without them it stays a demo persona. Applied on every start.
 */
async function syncOperatorLogin(): Promise<void> {
  const email = process.env.OPERATOR_EMAIL?.trim().toLowerCase();
  const password = process.env.OPERATOR_PASSWORD;
  if (email && password) {
    // Apply the variables only when they change, so a password the operator later changes in
    // the app is not overwritten on every restart.
    const fingerprint = createHash("sha256").update(config.sessionSecret).update("\0operator\0").update(email).update("\0").update(password).digest("hex");
    if ((await getSystemConfig<string>(db, "operator_login")) !== fingerprint) {
      await db.query(
        "UPDATE users SET kind = 'member', email = $1, password_hash = $2, password_changed_at = now() WHERE handle = 'operator'",
        [email, await hashPassword(password)],
      );
      await setSystemConfig(db, "operator_login", fingerprint);
      log.info("operator login set from OPERATOR_EMAIL and OPERATOR_PASSWORD");
    }
  } else {
    await db.query("UPDATE users SET kind = 'demo', email = 'operator@summertime.demo', password_hash = NULL WHERE handle = 'operator'");
  }
}

/**
 * A participant compiles each package the first time it is used after a start, which can
 * take longer than a request timeout. On an existing ledger, run one throwaway transaction
 * per package (create and archive in one command) before the API takes traffic.
 */
async function warmUp(d: Deployment): Promise<void> {
  const stamp = Date.now();
  const steps: { name: string; actAs: string; templateId: string; createArguments: unknown }[] = [
    {
      name: "summertime-core",
      actAs: d.operatorParty,
      templateId: T.ProgressView,
      createArguments: {
        forwarder: d.operatorParty,
        importer: d.operatorParty,
        campaignId: `warm-up-${stamp}`,
        reservedCbmRounded: "0",
        participantCount: null,
        hidden: true,
        asOf: new Date().toISOString(),
      },
    },
    {
      name: "token",
      actAs: d.registryAdmin,
      templateId: TestToken.Token,
      createArguments: {
        holding: { owner: d.registryAdmin, instrumentId: { admin: d.registryAdmin, id: d.instrument.id }, amount: "0.000001", lock: null, meta: { values: {} } },
      },
    },
  ];
  for (const s of steps) {
    const t0 = Date.now();
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await ledger.submit({
          commandId: `warm-up:${s.name}:${stamp}:${attempt}`,
          actAs: [s.actAs],
          commands: [{ CreateAndExerciseCommand: { templateId: s.templateId, createArguments: s.createArguments, choice: "Archive", choiceArgument: {} } }],
        });
        log.info({ pkg: s.name, ms: Date.now() - t0 }, "warmed up");
        break;
      } catch (e) {
        if (attempt === 6) log.warn({ pkg: s.name, err: e instanceof Error ? e.message.slice(0, 200) : String(e) }, "warm-up failed; continuing");
      }
    }
  }
}

if (existing && onLedger.has(existing.operatorParty) && onLedger.has(existing.registryAdmin) && !process.argv.includes("--reset")) {
  log.info({ operator: existing.operatorParty }, "deployment already bootstrapped");
  await warmUp(existing);
  await syncOperatorLogin();
  await db.end();
  process.exit(0);
}

if (existing) log.warn("ledger was reset or --reset given: clearing application data");
await db.query(
  "TRUNCATE users, party_links, sessions, login_codes, auth_attempts, mail_outbox, campaign_index, campaign_invitees, command_log, idempotency_keys, ledger_offsets, bond_ledger, capacity_holds, system_config CASCADE",
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
  const u = await db.query<{ id: string }>("INSERT INTO users (handle, display_name, role, email, kind) VALUES ($1, $2, $3, $4, 'demo') RETURNING id", [
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
await syncOperatorLogin();
log.info({ templates: Object.keys(T).length }, "bootstrap complete");
await db.end();
