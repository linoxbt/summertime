// Operations test: the bond custody reconciliation detects an operator that moves bond funds
// outside Summertime's contracts — the custody risk disclosed in specification section 10.4.
//
//   1. A campaign opens; the operator holds its 200 USDCx bond. Custody check: OK.
//   2. Simulated misuse: the operator transfers 50 USDCx of its holdings away directly through
//      the token registry, bypassing every Summertime contract. Custody check: ALERT.
//   3. The shortfall is made good. Custody check: OK again; the alert episode is resolved.
//
// Usage: npx tsx tests/e2e/ops.e2e.ts   (needs `scripts/dev.sh` running; uses the sandbox's
// unauthenticated Ledger API to act as the operator directly)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { I, LedgerClient, RegistryClient, extraArgsFrom, fromTokenDecimal, type HoldingView, type OpsStatus, type ForwarderCampaignDetail } from "@summertime/ledger";

const API = process.env.API_URL ?? "http://localhost:7580";
const ledger = new LedgerClient({ baseUrl: process.env.LEDGER_URL ?? "http://localhost:7575", userId: "u-operator" });
const registry = new RegistryClient(process.env.REGISTRY_URL ?? "http://localhost:7590");

async function login(handle: string) {
  const res = await fetch(`${API}/auth/demo-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
  const json = (await res.json()) as { data: { party: string } };
  return { cookie: (res.headers.get("set-cookie") ?? "").split(";")[0]!, party: json.data.party };
}
async function call<T>(cookie: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { cookie };
  if (method === "POST") Object.assign(headers, { "content-type": "application/json", "idempotency-key": randomUUID() });
  const res = await fetch(`${API}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  const json = (await res.json()) as { data?: T; error?: unknown };
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.error)}`);
  return json.data as T;
}
async function until<T>(what: string, fn: () => Promise<T | undefined | false>, timeoutMs = 120_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const custody = async (cookie: string) => (await call<OpsStatus>(cookie, "GET", "/ops/status")).checks.find((c) => c.name === "bond_custody");

async function main() {
  const fwd = await login("harbor-bridge");
  const op = await login("operator");

  const { campaignId } = await call<{ campaignId: string }>(fwd.cookie, "POST", "/campaigns", {
    title: "Ops test",
    capacityCbm: "60",
    thresholdCbm: "60",
    ratePerCbm: "150",
    minCbm: "1",
    maxCbm: "15",
    lockTime: new Date(Date.now() + 20 * 60_000).toISOString(),
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    bondUsdc: "200",
  });
  await call(fwd.cookie, "POST", `/campaigns/${campaignId}/bond`);
  await until("campaign open", async () => (await call<ForwarderCampaignDetail>(fwd.cookie, "GET", `/campaigns/${campaignId}`)).status === "open");
  await until("custody OK with bond held", async () => {
    const c = await custody(op.cookie);
    return c?.status === "ok" && BigInt((c.detail as { owedMicro: string }).owedMicro) >= 200_000_000n;
  });
  log("campaign open; custody check OK with the bond held");

  // Simulated misuse: move 50 USDCx of operator holdings straight through the registry.
  const holdings = (await ledger.activeContracts<unknown>([op.party], { interfaces: [I.Holding] })).filter((h) => {
    const v = h.interfaceView as HoldingView;
    return v.owner === op.party && !v.lock;
  });
  const admin = (holdings[0]!.interfaceView as HoldingView).instrumentId.admin;
  const now = Date.now();
  const choiceArgument = {
    expectedAdmin: admin,
    transfer: {
      sender: op.party,
      receiver: fwd.party,
      amount: "50.0",
      instrumentId: { admin, id: "USDCx" },
      requestedAt: new Date(now - 1000).toISOString(),
      executeBefore: new Date(now + 86_400_000).toISOString(),
      inputHoldingCids: holdings.map((h) => h.contractId),
      meta: { values: {} },
    },
    extraArgs: extraArgsFrom(undefined),
  };
  const factory = await registry.transferFactory(choiceArgument);
  await ledger.submit({
    commandId: `ops-test-misuse-${randomUUID()}`,
    actAs: [op.party],
    commands: [{ ExerciseCommand: { templateId: I.TransferFactory, contractId: factory.factoryId, choice: "TransferFactory_Transfer", choiceArgument } }],
    disclosedContracts: factory.choiceContext.disclosedContracts,
  });
  log("simulated misuse: operator moved 50 USDCx outside Summertime's contracts");

  const alert = await until("custody alert", async () => {
    const c = await custody(op.cookie);
    return c?.status === "alert" ? c : undefined;
  });
  const status = await call<OpsStatus>(op.cookie, "GET", "/ops/status");
  assert.equal(status.overall, "alert");
  assert.ok(status.alerts.some((a) => a.name === "bond_custody" && a.resolvedAt === null), "an open alert episode exists");
  log(`custody ALERT raised: ${alert.summary}`);

  // While the alert is open, no new campaign is accepted.
  const second = await call<{ campaignId: string }>(fwd.cookie, "POST", "/campaigns", {
    title: "Ops test (proposed during alert)",
    capacityCbm: "60",
    thresholdCbm: "60",
    ratePerCbm: "150",
    minCbm: "1",
    maxCbm: "15",
    lockTime: new Date(Date.now() + 20 * 60_000).toISOString(),
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    bondUsdc: "200",
  });
  await call(fwd.cookie, "POST", `/campaigns/${second.campaignId}/bond`);
  await new Promise((r) => setTimeout(r, 15_000));
  assert.equal((await call<ForwarderCampaignDetail>(fwd.cookie, "GET", `/campaigns/${second.campaignId}`)).status, "proposed", "new campaigns wait during a custody alert");
  log("a campaign proposed during the alert is held, not accepted");

  // Make the shortfall good (in the demo, from the test faucet).
  const held = (await ledger.activeContracts<unknown>([op.party], { interfaces: [I.Holding] }))
    .map((h) => h.interfaceView as HoldingView)
    .filter((v) => v.owner === op.party && !v.lock)
    .reduce((a, v) => a + fromTokenDecimal(v.amount), 0n);
  log(`operator now holds ${held / 1_000_000n} USDCx; restoring 50`);
  await call(op.cookie, "POST", "/dev/faucet", { amountUsdc: "50" });
  await until("custody OK again", async () => (await custody(op.cookie))?.status === "ok");
  const after = await call<OpsStatus>(op.cookie, "GET", "/ops/status");
  assert.ok(after.alerts.some((a) => a.name === "bond_custody" && a.resolvedAt !== null), "the alert episode is resolved");
  log("custody OK again; alert episode resolved");

  await until("held campaign opens once custody reconciles", async () => (await call<ForwarderCampaignDetail>(fwd.cookie, "GET", `/campaigns/${second.campaignId}`)).status === "open");
  log("the held campaign opened once custody reconciled");

  // Leave the stack clean: cancel both test campaigns (no capacity held).
  await call(fwd.cookie, "POST", `/campaigns/${campaignId}/cancel`);
  await call(fwd.cookie, "POST", `/campaigns/${second.campaignId}/cancel`);
  console.log("OPS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
