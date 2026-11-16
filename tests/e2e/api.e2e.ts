// End-to-end test through summertime-api against a live ledger, registry and worker.
//
//   1. Success: six importers reserve 60 CBM, sign and commit; the forwarder settles all six
//      legs in one transaction; the bond goes back to the forwarder.
//   2. Failure: five importers reserve 54 CBM; the deadline passes; the operator locks the
//      bond, every importer claims, and each is paid exactly the section 17.6 bonus.
//   3. Privacy: no importer can read another importer's position.
//
// Usage: npx tsx tests/e2e/api.e2e.ts   (needs `scripts/dev.sh` running)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ForwarderCampaignDetail, PositionDto, BalanceDto } from "@summertime/ledger";

const API = process.env.API_URL ?? "http://localhost:7580";

class Client {
  private cookie = "";
  constructor(readonly handle: string) {}
  async login() {
    const res = await fetch(`${API}/auth/demo-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: this.handle }) });
    assert.equal(res.status, 200, `login ${this.handle}`);
    this.cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
    return this;
  }
  async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; data?: T; error?: { code: string; message: string } }> {
    const headers: Record<string, string> = { cookie: this.cookie };
    if (method === "POST") {
      headers["idempotency-key"] = randomUUID();
      headers["content-type"] = "application/json";
    }
    const res = await fetch(`${API}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
    const json = (await res.json()) as { data?: T; error?: { code: string; message: string } };
    return { status: res.status, ...json };
  }
  async ok<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const r = await this.call<T>(method, path, body);
    if (r.status !== 200) throw new Error(`${this.handle} ${method} ${path} → ${r.status} ${JSON.stringify(r.error)}`);
    return r.data as T;
  }
}

async function until<T>(what: string, fn: () => Promise<T | undefined | false>, timeoutMs = 120_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function openCampaign(fwd: Client, title: string, lockInMs: number, deadlineInMs: number): Promise<string> {
  const { campaignId } = await fwd.ok<{ campaignId: string }>("POST", "/campaigns", {
    title,
    route: "Guangzhou → Lagos (Apapa)",
    capacityCbm: "60",
    thresholdCbm: "60",
    ratePerCbm: "150",
    minCbm: "1",
    maxCbm: "15",
    lockTime: iso(lockInMs),
    deadline: iso(deadlineInMs),
    bondUsdc: "200",
  });
  await fwd.ok("POST", `/campaigns/${campaignId}/bond`);
  await until("campaign accepted by operator", async () => (await fwd.ok<ForwarderCampaignDetail>("GET", `/campaigns/${campaignId}`)).status === "open");
  log(`campaign ${campaignId} open (bond escrowed with operator)`);
  return campaignId;
}

async function joinAll(fwd: Client, importers: Client[], campaignId: string, sizes: string[]): Promise<void> {
  await fwd.ok("POST", `/campaigns/${campaignId}/invitations`, { importers: importers.map((i) => i.handle) });
  for (const [i, imp] of importers.entries()) {
    const invitation = await until("invitation visible", async () =>
      (await imp.ok<{ contractId: string; campaignId: string }[]>("GET", "/invitations")).find((x) => x.campaignId === campaignId),
    );
    await imp.ok("POST", `/invitations/${invitation.contractId}/reserve`, { reservedCbm: sizes[i] });
    const pos = await until("countersigned", async () => {
      const p = await imp.ok<PositionDto>("GET", `/positions/${campaignId}`).catch(() => undefined);
      return p?.stage === "awaiting-signature" ? p : undefined;
    });
    await imp.ok("POST", `/reservations/${pos.ids.reservation}/commit`);
    log(`${imp.handle} committed ${sizes[i]} CBM`);
  }
}

async function main() {
  const fwd = await new Client("harbor-bridge").login();
  const handles = ["ada", "bola", "chidi", "dami", "emeka", "funmi"];
  const importers = await Promise.all(handles.map((h) => new Client(h).login()));
  const sizes = ["14", "12", "11", "9", "8", "6"];

  // Make sure everyone can fund their reservations and the bonds.
  for (const c of [fwd, ...importers]) await c.ok("POST", "/dev/faucet", { amountUsdc: "10000" });

  // ---- 1. Success ----------------------------------------------------------------------------
  const ok = await openCampaign(fwd, "E2E success", 150_000, 210_000);
  const fwdBefore = BigInt((await fwd.ok<BalanceDto>("GET", "/me/balance")).available.micro);
  await joinAll(fwd, importers, ok, sizes);
  const detail = await fwd.ok<ForwarderCampaignDetail>("GET", `/campaigns/${ok}`);
  assert.equal(detail.committed.milliCbm, "60000");
  assert.equal(detail.reservations.filter((r) => r.stage === "committed").length, 6, "forwarder sees every reservation");
  assert.ok(detail.canExecute, `can execute: ${detail.executeBlockers.join(" ")}`);

  // Privacy: importer B cannot read A's position or the campaign.
  const bPositions = await importers[1]!.ok<PositionDto[]>("GET", "/positions");
  assert.ok(bPositions.every((p) => p.reserved?.milliCbm !== "14000"), "B never sees A's 14 CBM");
  const bReadsCampaign = await importers[1]!.call("GET", `/campaigns/${ok}`);
  assert.equal(bReadsCampaign.status, 403, "importers cannot use forwarder endpoints");

  const exec = await fwd.ok<{ updateId: string; legCount: number }>("POST", `/campaigns/${ok}/execute`);
  assert.equal(exec.legCount, 6);
  log(`settled 6 legs atomically in update ${exec.updateId.slice(0, 16)}…`);
  const after = await fwd.ok<ForwarderCampaignDetail>("GET", `/campaigns/${ok}`);
  assert.equal(after.status, "succeeded");
  assert.equal(after.outcome?.settledAmount.micro, "9000000000");
  assert.equal(after.outcome?.updateId, exec.updateId);
  for (const imp of importers) {
    const p = await imp.ok<PositionDto>("GET", `/positions/${ok}`);
    assert.equal(p.stage, "settled", `${imp.handle} settled`);
    assert.ok(p.receipts.some((r) => r.kind === "Settled"));
  }
  // Bond comes back to the forwarder (operator returns it; custody accepts it).
  const fwdAfter = await until("bond returned", async () => {
    const b = BigInt((await fwd.ok<BalanceDto>("GET", "/me/balance")).available.micro);
    return b === fwdBefore + 9_200_000_000n ? b : undefined;
  });
  log(`forwarder received 9,000.00 USDCx and its 200.00 USDCx bond back (balance ${fwdAfter / 1_000_000n})`);

  // ---- 2. Failure ----------------------------------------------------------------------------
  const failId = await openCampaign(fwd, "E2E failure", 100_000, 150_000);
  await joinAll(fwd, importers.slice(0, 5), failId, sizes.slice(0, 5));
  const before = await Promise.all(importers.slice(0, 5).map(async (i) => BigInt((await i.ok<BalanceDto>("GET", "/me/balance")).available.micro)));
  const notYet = await fwd.call("POST", `/campaigns/${failId}/execute`);
  assert.equal(notYet.error?.code, "BELOW_THRESHOLD", "cannot settle 54 of 60 CBM");
  log("waiting for lock time and deadline…");
  const expected = [51_851_851n, 44_444_444n, 40_740_740n, 33_333_333n, 29_629_629n];
  for (const [i, imp] of importers.slice(0, 5).entries()) {
    const pos = await until(`${imp.handle} claimable`, async () => {
      const p = await imp.ok<PositionDto>("GET", `/positions/${failId}`);
      return p.stage === "claimable" ? p : undefined;
    }, 240_000);
    assert.equal(pos.bonus?.micro, expected[i]!.toString(), `${imp.handle} bonus per section 17.6`);
    await imp.ok("POST", `/entitlements/${pos.ids.entitlement}/claim`);
  }
  for (const [i, imp] of importers.slice(0, 5).entries()) {
    await until(`${imp.handle} paid`, async () => (await imp.ok<PositionDto>("GET", `/positions/${failId}`)).stage === "bonus-paid");
    const locked = BigInt(sizes[i]!) * 150_000_000n;
    // The payout is a token transfer the importer's custody accepts on its next pass.
    await until(`${imp.handle} funds released plus bonus`, async () => {
      const bal = BigInt((await imp.ok<BalanceDto>("GET", "/me/balance")).available.micro);
      return bal === before[i]! + locked + expected[i]!;
    }, 30_000);
  }
  log("failed campaign: all five importers released and paid their bonuses (199.999997 USDCx; 0.000003 dust)");
  const failed = await fwd.ok<ForwarderCampaignDetail>("GET", `/campaigns/${failId}`);
  assert.equal(failed.status, "failed");
  log("E2E PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
