// Local development registry.
//
// Implements the CIP-56 registry off-ledger API (Splice token-standard V1 OpenAPI specs) for
// Splice's reference TestTokenV1, so the app uses exactly the same registry client in the
// sandbox as against a real registry (USDCx Registry Utility) on DevNet.
//
// Never deploy this: it also exposes a mint endpoint for test funds.

import Fastify, { type FastifyBaseLogger } from "fastify";
import { TestToken, type ActiveContract } from "@summertime/ledger";
import { createDb, createLedger, createLogger, getDeployment, loadConfig, migrate, CommandRunner } from "@summertime/platform";
import { randomUUID } from "node:crypto";

const config = loadConfig();
const log = createLogger("dev-registry");
const db = createDb(config.databaseUrl);
const ledger = createLedger(config);
const commands = new CommandRunner(ledger, db, log);
await migrate(db);

const app = Fastify({ loggerInstance: log as unknown as FastifyBaseLogger, maxParamLength: 512 });

async function admin(): Promise<string> {
  return (await getDeployment(db)).registryAdmin;
}

async function rules(): Promise<ActiveContract> {
  const a = await admin();
  const [r] = await ledger.activeContracts([a], { templates: [TestToken.TokenRules] }, { includeBlob: true });
  if (!r) throw new Error("TokenRules not found: run bootstrap");
  return r;
}

function disclosure(c: ActiveContract) {
  return { templateId: c.templateId, contractId: c.contractId, createdEventBlob: c.createdEventBlob!, synchronizerId: c.synchronizerId };
}

// The test token needs no choice-context data; real registries return their own.
const emptyContext = { values: {} };

app.get("/registry/metadata/v1/info", async () => ({
  adminId: await admin(),
  supportedApis: { "splice-api-token-metadata-v1": 1 },
}));

app.get("/registry/metadata/v1/instruments", async () => {
  const d = await getDeployment(db);
  return { instruments: [{ id: d.instrument.id, name: "USD Coin (test)", symbol: d.instrument.symbol, decimals: d.instrument.decimals, supportedApis: {} }] };
});

app.get<{ Params: { id: string } }>("/registry/metadata/v1/instruments/:id", async (req, reply) => {
  const d = await getDeployment(db);
  if (req.params.id !== d.instrument.id) return reply.code(404).send({ error: "unknown instrument" });
  return { id: d.instrument.id, name: "USD Coin (test)", symbol: d.instrument.symbol, decimals: d.instrument.decimals, supportedApis: {} };
});

app.post("/registry/allocation-instruction/v1/allocation-factory", async () => {
  const r = await rules();
  return { factoryId: r.contractId, choiceContext: { choiceContextData: emptyContext, disclosedContracts: [disclosure(r)] } };
});

app.post("/registry/transfer-instruction/v1/transfer-factory", async () => {
  const r = await rules();
  return { factoryId: r.contractId, transferKind: "offer", choiceContext: { choiceContextData: emptyContext, disclosedContracts: [disclosure(r)] } };
});

for (const choice of ["execute-transfer", "withdraw", "cancel"]) {
  app.post(`/registry/allocations/v1/:id/choice-contexts/${choice}`, async () => ({ choiceContextData: emptyContext, disclosedContracts: [] }));
}
for (const choice of ["accept", "reject", "withdraw"]) {
  app.post(`/registry/transfer-instruction/v1/:id/choice-contexts/${choice}`, async () => ({ choiceContextData: emptyContext, disclosedContracts: [] }));
}

/** Development faucet: the instrument admin mints test USDCx to a party hosted on this participant. */
app.post<{ Body: { owner: string; amount: string } }>("/dev/mint", async (req, reply) => {
  const { owner, amount } = req.body ?? ({} as { owner: string; amount: string });
  if (!owner || !/^\d+(\.\d+)?$/.test(amount ?? "")) return reply.code(400).send({ error: "owner and decimal amount required" });
  const d = await getDeployment(db);
  const out = await commands.run("dev.mint", {
    commandId: `mint:${randomUUID()}`,
    actAs: [d.registryAdmin, owner],
    commands: [
      {
        CreateCommand: {
          templateId: TestToken.Token,
          createArguments: { holding: { owner, instrumentId: { admin: d.registryAdmin, id: d.instrument.id }, amount, lock: null, meta: { values: {} } } },
        },
      },
    ],
  });
  return { contractId: out.created[0]?.contractId, updateId: out.updateId };
});

app.get("/healthz", async () => ({ ok: true }));

await app.listen({ port: config.registryPort, host: "127.0.0.1" });
