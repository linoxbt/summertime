// API guard tests against the live stack: authentication, role checks, idempotency, and
// privacy of each party's view. Fast (about 30 seconds); no waiting for lock times.
//
// Usage: npx tsx tests/e2e/api-guards.e2e.ts   (needs `scripts/dev.sh` running)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { ExplorerPane, ForwarderCampaignDetail, PositionDto } from "@summertime/ledger";

const API = process.env.API_URL ?? "http://localhost:7580";

async function login(handle: string): Promise<string> {
  const res = await fetch(`${API}/auth/demo-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
  assert.equal(res.status, 200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://summertime:summertime@127.0.0.1:5432/summertime" });
let memberImporter = "";

/** POST to an auth endpoint; returns the session cookie it set, if any. */
async function auth(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as { data?: any; error?: { code: string } };
  return { status: res.status, data: json.data, code: json.error?.code, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0]! };
}

async function call(cookie: string | undefined, method: "GET" | "POST", path: string, body?: unknown, key: string | null = randomUUID()) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (method === "POST") {
    headers["content-type"] = "application/json";
    if (key) headers["idempotency-key"] = key;
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  const json = (await res.json()) as { data?: any; error?: { code: string } };
  return { status: res.status, data: json.data, code: json.error?.code };
}

async function until<T>(what: string, fn: () => Promise<T | undefined | false>, timeoutMs = 60_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const results: string[] = [];
const check = (name: string) => results.push(`✓ ${name}`);

async function main() {
  const fwd = await login("harbor-bridge");
  const ada = await login("ada");
  const bola = await login("bola");
  const op = await login("operator");

  // Real accounts: email and password, kept apart from the demo.
  const stamp = Date.now();
  const email = `guard-${stamp}@example.com`;
  const password = "correct horse battery";
  const profile = { displayName: "Guard Imports Ltd", role: "importer" };
  assert.equal((await call(undefined, "POST", "/auth/signup", { email, password: "short", ...profile })).code, "WEAK_PASSWORD");
  const signup = await auth("/auth/signup", { email, password, ...profile });
  assert.equal(signup.status, 201);
  assert.equal(signup.data.kind, "member");
  assert.equal((await call(undefined, "POST", "/auth/signup", { email: email.toUpperCase(), password, ...profile })).code, "EMAIL_TAKEN");
  check("sign-up: weak passwords and duplicate emails are refused; new accounts are members");

  for (const attempt of [
    { email, password: "wrong password!" },
    { email: `nobody-${stamp}@example.com`, password },
    { email: "ada@summertime.demo", password },
  ])
    assert.equal((await auth("/auth/login", attempt)).code, "INVALID_CREDENTIALS");
  const login1 = await auth("/auth/login", { email: email.toUpperCase(), password });
  assert.equal(login1.status, 200);
  assert.equal((await call(login1.cookie, "GET", "/auth/me")).data.email, email);
  assert.equal((await call(undefined, "POST", "/auth/demo-login", { handle: signup.data.handle })).status, 404);
  check("sign-in: one answer for wrong password, unknown email and demo accounts; demo sign-in refuses real accounts");

  const demoList = (await call(undefined, "GET", "/auth/demo-accounts")).data as { email: string }[];
  assert.ok(!demoList.some((a) => a.email === email));
  assert.ok(!((await call(fwd, "GET", "/importers")).data as { handle: string }[]).some((i) => i.handle === signup.data.handle));
  const realFwd = await auth("/auth/signup", { email: `guard-fwd-${stamp}@example.com`, password, displayName: "Guard Freight", role: "forwarder" });
  const realImporters = (await call(realFwd.cookie, "GET", "/importers")).data as { handle: string }[];
  assert.ok(realImporters.some((i) => i.handle === signup.data.handle));
  assert.ok(!realImporters.some((i) => i.handle === "ada"));
  assert.equal((await call(login1.cookie, "GET", "/explorer/campaigns")).code, "DISABLED");
  assert.equal((await call(ada, "GET", `/explorer/x?as=${signup.data.handle}`)).status, 404);
  check("separation: demo lists, importer lists and the privacy explorer never mix demo and real accounts");

  assert.equal((await call(login1.cookie, "POST", "/auth/password/change", { currentPassword: "nope nope nope", newPassword: "another good passphrase" })).code, "WRONG_PASSWORD");
  assert.equal((await call(login1.cookie, "POST", "/auth/password/change", { currentPassword: password, newPassword: "another good passphrase" })).status, 200);
  assert.equal((await call(signup.cookie, "GET", "/auth/me")).status, 401);
  assert.equal((await call(login1.cookie, "GET", "/auth/me")).status, 200);
  assert.equal((await auth("/auth/login", { email, password })).code, "INVALID_CREDENTIALS");
  check("password change: needs the current password, signs out other sessions, retires the old password");

  assert.equal((await call(undefined, "POST", "/auth/password/forgot", { email })).data.sent, true);
  assert.equal((await call(undefined, "POST", "/auth/password/forgot", { email: `nobody-${stamp}@example.com` })).data.sent, true);
  const mail = await db.query<{ subject: string }>("SELECT subject FROM mail_outbox WHERE to_email = $1 ORDER BY id DESC LIMIT 1", [email]);
  const resetCode = /(\d{6})/.exec(mail.rows[0]!.subject)![1]!;
  const wrongCode = resetCode === "000000" ? "111111" : "000000";
  assert.equal((await call(undefined, "POST", "/auth/password/reset", { email, code: wrongCode, password: "third good passphrase" })).code, "INVALID_CODE");
  const reset = await auth("/auth/password/reset", { email, code: resetCode, password: "third good passphrase" });
  assert.equal(reset.status, 200);
  assert.equal((await call(login1.cookie, "GET", "/auth/me")).status, 401);
  assert.equal((await call(undefined, "POST", "/auth/password/reset", { email, code: resetCode, password: "fourth good passphrase" })).code, "CODE_EXPIRED");
  assert.equal((await auth("/auth/login", { email, password: "third good passphrase" })).status, 200);
  check("password reset: emailed code, wrong code refused, single use, revokes old sessions");

  const target = `locked-${stamp}@example.com`;
  for (let i = 0; i < 8; i++) await auth("/auth/login", { email: target, password: "wrong wrong wrong" });
  assert.equal((await auth("/auth/login", { email: target, password: "wrong wrong wrong" })).code, "TOO_MANY_ATTEMPTS");
  check("sign-in is rate-limited per email");
  memberImporter = signup.data.handle;

  // Authentication and roles.
  assert.equal((await call(undefined, "GET", "/campaigns")).status, 401);
  check("unauthenticated requests are refused");
  assert.equal((await call(ada, "GET", "/campaigns")).status, 403);
  assert.equal((await call(fwd, "GET", "/invitations")).status, 403);
  assert.equal((await call(op, "POST", "/campaigns", {})).status, 403);
  check("each role can only use its own endpoints");

  // Idempotency.
  assert.equal((await call(fwd, "POST", "/campaigns", {}, null)).code, "IDEMPOTENCY_KEY_REQUIRED");
  const terms = {
    title: "Guards test",
    capacityCbm: "60",
    thresholdCbm: "60",
    ratePerCbm: "150",
    minCbm: "1",
    maxCbm: "15",
    lockTime: new Date(Date.now() + 10 * 60_000).toISOString(),
    deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
    bondUsdc: "200",
  };
  const key = randomUUID();
  const first = await call(fwd, "POST", "/campaigns", terms, key);
  const replay = await call(fwd, "POST", "/campaigns", terms, key);
  assert.equal(first.status, 200);
  assert.deepEqual(replay.data, first.data, "a replay returns the stored response");
  assert.equal((await call(fwd, "POST", "/campaigns", { ...terms, title: "Different" }, key)).code, "IDEMPOTENCY_KEY_REUSED");
  const list = (await call(fwd, "GET", "/campaigns")).data as { campaignId: string; title: string }[];
  assert.equal(list.filter((c) => c.campaignId === first.data.campaignId).length, 1, "no duplicate campaign from the replay");
  check("replays return the same response and never create a second campaign");

  // Terms validation mirrors the Daml ensure clause.
  assert.equal((await call(fwd, "POST", "/campaigns", { ...terms, bondUsdc: "1000" })).code, "INVALID_TERMS");
  assert.equal((await call(fwd, "POST", "/campaigns", { ...terms, minCbm: "0.5" })).code, "INVALID_TERMS");
  assert.equal((await call(fwd, "POST", "/campaigns", { ...terms, thresholdCbm: "61" })).code, "INVALID_TERMS");
  check("invalid terms are rejected before reaching the ledger");

  // Open the campaign, and have two importers commit.
  const id = first.data.campaignId as string;
  await call(fwd, "POST", `/campaigns/${id}/bond`);
  await until("campaign open", async () => ((await call(fwd, "GET", `/campaigns/${id}`)).data as ForwarderCampaignDetail).status === "open");
  await call(fwd, "POST", `/campaigns/${id}/invitations`, { importers: ["ada", "bola"] });
  for (const [cookie, size] of [[ada, "4"], [bola, "7"]] as const) {
    const inv = await until("invitation", async () => ((await call(cookie, "GET", "/invitations")).data as { contractId: string; campaignId: string }[]).find((x) => x.campaignId === id));
    assert.equal((await call(cookie, "POST", `/invitations/${inv.contractId}/reserve`, { reservedCbm: "16" })).code, "ABOVE_MAX");
    await call(cookie, "POST", `/invitations/${inv.contractId}/reserve`, { reservedCbm: size });
    const pos = await until("countersigned", async () => {
      const p = (await call(cookie, "GET", `/positions/${id}`)).data as PositionDto | undefined;
      return p?.stage === "awaiting-signature" ? p : undefined;
    });
    await call(cookie, "POST", `/reservations/${pos.ids.reservation}/commit`);
  }
  check("importers reserve, are countersigned and commit");

  // Importers cannot act on each other's contracts: IDs alone grant nothing.
  const adaPos = (await call(ada, "GET", `/positions/${id}`)).data as PositionDto;
  const bolaPos = (await call(bola, "GET", `/positions/${id}`)).data as PositionDto;
  assert.equal(adaPos.reserved?.milliCbm, "4000");
  assert.equal(bolaPos.reserved?.milliCbm, "7000");
  assert.equal((await call(bola, "POST", `/commitments/${adaPos.ids.commitment}/withdraw`)).status, 404);
  check("an importer cannot act on another importer's commitment, even knowing its ID");

  // Privacy explorer: each party's own ledger view.
  const view = async (handle: string) => ((await call(op, "GET", `/explorer/${id}?as=${handle}`)).data as ExplorerPane).contracts;
  const adaView = await view("ada");
  const bolaView = await view("bola");
  const fwdView = await view("harbor-bridge");
  const opView = await view("operator");
  const importersIn = (cs: ExplorerPane["contracts"]) => new Set(cs.flatMap((c) => [...c.signatories, ...c.observers]).filter((n) => /Ada|Bola/.test(n)));
  assert.deepEqual([...importersIn(adaView)], ["Ada Phone Accessories"], "Ada sees only herself");
  assert.deepEqual([...importersIn(bolaView)], ["Bola Textiles"], "Bola sees only himself");
  assert.ok(!adaView.some((c) => c.template === "Campaign" || c.template === "OrganizerBond"), "importers never see the campaign or bond");
  assert.ok(fwdView.filter((c) => c.template === "Commitment").length === 2, "the forwarder sees every commitment");
  assert.ok(opView.some((c) => c.template === "Campaign") && !opView.some((c) => c.template === "Commitment"), "the operator co-signs the campaign but is not a stakeholder of commitments");
  check("each party's ledger view matches the visibility matrix (spec 10.3)");

  // Withdrawal before lock returns funds and capacity.
  await call(ada, "POST", `/commitments/${adaPos.ids.commitment}/withdraw`);
  await until("capacity released", async () => ((await call(fwd, "GET", `/campaigns/${id}`)).data as ForwarderCampaignDetail).held.milliCbm === "7000");
  check("withdrawal before lock frees the importer's funds and the campaign's capacity");

  // Cannot cancel while capacity is held; cannot settle below threshold.
  assert.equal((await call(fwd, "POST", `/campaigns/${id}/cancel`)).code, "CAPACITY_HELD");
  assert.equal((await call(fwd, "POST", `/campaigns/${id}/execute`)).code, "BELOW_THRESHOLD");
  check("no cancellation while capacity is held; no settlement below the threshold");

  // A demo forwarder cannot invite a real importer (and the reverse).
  assert.equal((await call(fwd, "POST", `/campaigns/${id}/invitations`, { importers: [memberImporter] })).code, "UNKNOWN_IMPORTER");
  check("invitations stay within demo or within real accounts");

  await db.end();
  console.log(results.join("\n"));
  console.log("GUARDS PASSED");
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
