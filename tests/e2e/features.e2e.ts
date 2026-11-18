// Notifications, auto-settle, the contact form and account deletion, against the live stack.
//
//   1. Contact: a visitor's message is stored and shown to the operator; bots are refused.
//   2. Two real (member) accounts: a forwarder opens a campaign with auto-settle on and
//      invites an importer. The importer is notified (in the app and by email), reserves and
//      locks funds, and the worker settles on its own. Both are told the outcome.
//   3. Email preference switches off and on.
//   4. Account deletion: refused while obligations are open; otherwise personal data goes,
//      sign-in ends, and the account disappears from lists.
//
// Usage: npx tsx tests/e2e/features.e2e.ts   (needs `scripts/dev.sh` running)
// Against the hosted site: LIVE=1 API_URL=https://…/api OPERATOR_EMAIL=… OPERATOR_PASSWORD=…
// (no database access: database checks are replaced by API checks, test accounts are deleted
// at the end, and email delivery is skipped unless the site has an email provider).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { ForwarderCampaignDetail, NotificationList, PositionDto } from "@summertime/ledger";

const API = process.env.API_URL ?? "http://localhost:7580";
const LIVE = Boolean(process.env.LIVE);
const db = LIVE ? undefined : new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://summertime:summertime@127.0.0.1:5432/summertime" });

async function call(cookie: string | undefined, method: "GET" | "POST", path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = randomUUID();
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  const json = (await res.json()) as { data?: any; error?: { code: string; message: string } };
  return { status: res.status, data: json.data, code: json.error?.code, message: json.error?.message, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0]! };
}
async function ok<T = any>(cookie: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const r = await call(cookie, method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${r.code} ${r.message}`);
  return r.data as T;
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
const notes = (cookie: string) => ok<NotificationList>(cookie, "GET", "/notifications");
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

const results: string[] = [];
const check = (n: string) => results.push(`✓ ${n}`);

async function main() {
  const stamp = Date.now();
  const op = LIVE
    ? (await call(undefined, "POST", "/auth/login", { email: process.env.OPERATOR_EMAIL, password: process.env.OPERATOR_PASSWORD })).cookie
    : (await call(undefined, "POST", "/auth/demo-login", { handle: "operator" })).cookie;
  assert.equal((await call(op, "GET", "/auth/me")).data?.role, "operator", "operator signed in");

  // ---- 1. Contact ----------------------------------------------------------------------------
  const msg = { name: "Automated test", email: `contact-${stamp}@example.com`, company: "Summertime test", topic: "other", message: "Automated end-to-end test of the contact form. Safe to ignore." };
  assert.equal((await call(undefined, "POST", "/contact", msg)).status, 201);
  assert.equal((await call(undefined, "POST", "/contact", { ...msg, website: "http://spam.example" })).code, "VALIDATION", "honeypot refused");
  assert.equal((await call(undefined, "POST", "/contact", { ...msg, message: "hi" })).code, "VALIDATION", "too short refused");
  const inbox = await ok<{ id: string; email: string; handled: boolean }[]>(op, "GET", "/ops/contact");
  const mine = inbox.find((m) => m.email === msg.email);
  assert.ok(mine && !mine.handled, "operator sees the message");
  await ok(op, "POST", `/ops/contact/${mine.id}/handled`);
  assert.ok((await ok<{ email: string; handled: boolean }[]>(op, "GET", "/ops/contact")).find((m) => m.email === msg.email)?.handled);
  const ada = (await call(undefined, "POST", "/auth/demo-login", { handle: "ada" })).cookie;
  assert.equal((await call(ada, "GET", "/ops/contact")).status, 403, "only the operator reads messages");
  check("contact messages are stored, shown to the operator only, and bots are refused");

  // ---- 2. Members: notifications and auto-settle ---------------------------------------------
  const password = "a long enough passphrase";
  const fEmail = `notify-fwd-${stamp}@example.com`;
  const iEmail = `notify-imp-${stamp}@example.com`;
  const f = await call(undefined, "POST", "/auth/signup", { email: fEmail, password, displayName: "Notify Freight", role: "forwarder" });
  const i = await call(undefined, "POST", "/auth/signup", { email: iEmail, password, displayName: "Notify Imports", role: "importer" });
  assert.equal(f.status, 201);
  assert.equal(i.status, 201);
  const fwd = f.cookie;
  const imp = i.cookie;
  for (const c of [fwd, imp]) await ok(c, "POST", "/dev/faucet", { amountUsdc: "5000" });

  const { campaignId } = await ok<{ campaignId: string }>(fwd, "POST", "/campaigns", {
    title: `Auto ${stamp}`,
    route: "Guangzhou → Lagos (Apapa)",
    capacityCbm: "10",
    thresholdCbm: "4",
    ratePerCbm: "150",
    minCbm: "1",
    maxCbm: "5",
    lockTime: iso(150_000),
    deadline: iso(210_000),
    bondUsdc: "30",
    autoSettle: true,
  });
  await ok(fwd, "POST", `/campaigns/${campaignId}/bond`);
  const opened = await until("campaign open", async () => {
    const d = await ok<ForwarderCampaignDetail>(fwd, "GET", `/campaigns/${campaignId}`);
    return d.status === "open" ? d : undefined;
  });
  assert.equal(opened.autoSettle, true, "auto-settle stored at creation");
  // Switching it off and on again works, and only for the owner.
  assert.equal((await ok(fwd, "POST", `/campaigns/${campaignId}/auto-settle`, { enabled: false })).autoSettle, false);
  assert.equal((await ok<ForwarderCampaignDetail>(fwd, "GET", `/campaigns/${campaignId}`)).autoSettle, false);
  assert.equal((await ok(fwd, "POST", `/campaigns/${campaignId}/auto-settle`, { enabled: true })).autoSettle, true);
  const harbor = (await call(undefined, "POST", "/auth/demo-login", { handle: "harbor-bridge" })).cookie;
  assert.notEqual((await call(harbor, "POST", `/campaigns/${campaignId}/auto-settle`, { enabled: false })).status, 200, "another forwarder can't change it");
  check("auto-settle is set at creation and switched only by the campaign's forwarder");

  await ok(fwd, "POST", `/campaigns/${campaignId}/invitations`, { importers: [i.data.handle] });
  const invited = await until("invitation notification", async () => (await notes(imp)).items.find((n) => n.kind === "invitation" && n.body.includes(`Auto ${stamp}`)));
  assert.ok(invited.link?.startsWith("/importer/invitations/"));
  assert.ok(!invited.read);
  assert.ok((await notes(imp)).unread >= 1);
  if (db) {
    const mail = await until("invitation email", async () => {
      const r = await db.query<{ subject: string; body: string }>("SELECT subject, body FROM mail_outbox WHERE lower(to_email) = $1 AND subject LIKE 'New invitation%'", [iEmail]);
      return r.rows[0];
    });
    assert.ok(mail.body.includes("Notify Freight") && mail.body.includes("/importer/invitations/"), "email names the forwarder and links to the invitation");
    check("a new invitation notifies the importer in the app and by email");
  } else {
    assert.ok(invited.body.includes("Notify Freight"), "names the forwarder");
    const prefs = await ok(imp, "GET", "/me/preferences");
    check(`a new invitation notifies the importer in the app${prefs.emailAvailable ? " (email provider on)" : " (email delivery not switched on for this site)"}`);
  }

  const invitation = await until("invitation visible", async () =>
    (await ok<{ contractId: string; campaignId: string }[]>(imp, "GET", "/invitations")).find((x) => x.campaignId === campaignId),
  );
  await ok(imp, "POST", `/invitations/${invitation.contractId}/reserve`, { reservedCbm: "4" });
  const pos = await until("countersigned", async () => {
    const p = await ok<PositionDto>(imp, "GET", `/positions/${campaignId}`).catch(() => undefined);
    return p?.stage === "awaiting-signature" ? p : undefined;
  });
  await until("space-held notification", async () => (await notes(imp)).items.find((n) => n.kind === "reservation.held"));

  // Obligations block deletion: an open campaign for the forwarder, a reservation for the importer.
  assert.equal((await call(fwd, "POST", "/auth/account/delete", { confirm: "DELETE" })).code, "ACCOUNT_BUSY");
  assert.equal((await call(imp, "POST", "/auth/account/delete", { confirm: "DELETE" })).code, "ACCOUNT_BUSY");
  check("accounts with open campaigns or reservations can't be deleted");

  await ok(imp, "POST", `/reservations/${pos.ids.reservation}/commit`);
  await until("forwarder told funds are locked", async () => (await notes(fwd)).items.find((n) => n.kind === "commitment" && n.body.includes("Notify Imports")));
  // No Settle call: the worker settles because the threshold (4 CBM) is met.
  const settled = await until("auto-settled", async () => {
    const d = await ok<ForwarderCampaignDetail>(fwd, "GET", `/campaigns/${campaignId}`);
    return d.status === "succeeded" ? d : undefined;
  });
  assert.equal(settled.outcome?.settled.milliCbm, "4000");
  assert.equal(settled.outcome?.legCount, 1);
  check("with auto-settle on, the worker settles as soon as the threshold is met");

  const fNote = await until("forwarder outcome notification", async () => (await notes(fwd)).items.find((n) => n.kind === "outcome.succeeded"));
  assert.ok(fNote.body.includes("1 importers") || fNote.body.includes("settled"));
  assert.ok(!(await notes(fwd)).items.some((n) => n.kind === "campaign.full" && n.link?.includes(encodeURIComponent(campaignId))), "no 'ready to settle' nag when auto-settle is on");
  const iNote = await until("importer settled notification", async () => (await notes(imp)).items.find((n) => n.kind === "settled"));
  assert.ok(iNote.body.includes("4.000 CBM") && iNote.body.includes("600.00 USDCx"));
  // Privacy: the importer's notifications never name other parties' amounts; the forwarder's
  // notification about the importer names only that importer's own reservation.
  for (const n of (await notes(imp)).items) assert.ok(!/Notify Freight locked|importers,/.test(n.body), `importer note leaks: ${n.body}`);
  check("both sides are told the outcome; importers only hear about their own records");

  // Mark read: one, then all.
  await ok(imp, "POST", "/notifications/read", { ids: [iNote.id] });
  assert.ok((await notes(imp)).items.find((n) => n.id === iNote.id)?.read);
  await ok(imp, "POST", "/notifications/read", {});
  assert.equal((await notes(imp)).unread, 0);
  assert.equal((await call(fwd, "GET", "/notifications")).data.items.some((n: { id: string }) => n.id === iNote.id), false, "notifications are private to their owner");
  check("notifications are marked read one at a time or all at once, and stay private");

  // ---- 3. Email preference --------------------------------------------------------------------
  assert.equal((await ok(imp, "GET", "/me/preferences")).notifyEmail, true);
  assert.equal((await ok(imp, "POST", "/me/preferences", { notifyEmail: false })).notifyEmail, false);
  assert.equal((await ok(imp, "GET", "/me/preferences")).notifyEmail, false);
  assert.equal((await call(ada, "POST", "/me/preferences", { notifyEmail: true })).status, 403, "demo accounts have no email");
  check("members can switch notification emails off");

  // ---- 4. Account deletion -------------------------------------------------------------------
  assert.equal((await call(imp, "POST", "/auth/account/delete", { confirm: "yes" })).code, "VALIDATION", "needs DELETE typed");
  assert.equal((await call(ada, "POST", "/auth/account/delete", { confirm: "DELETE" })).status, 403, "demo accounts can't be deleted");
  const del = await call(imp, "POST", "/auth/account/delete", { confirm: "DELETE" });
  assert.equal(del.status, 200, `delete: ${del.code} ${del.message}`);
  assert.equal((await call(imp, "GET", "/auth/me")).status, 401, "session ended");
  assert.equal((await call(undefined, "POST", "/auth/login", { email: iEmail, password })).status, 401, "can't sign in any more");
  if (db) {
    const row = (await db.query("SELECT email, display_name, password_hash, deleted_at FROM users WHERE handle = $1", [i.data.handle])).rows[0];
    assert.equal(row.email, null);
    assert.equal(row.display_name, "Deleted account");
    assert.equal(row.password_hash, null);
    assert.ok(row.deleted_at);
    assert.equal((await db.query("SELECT 1 FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.handle = $1", [i.data.handle])).rowCount, 0);
    assert.equal((await db.query("SELECT 1 FROM mail_outbox WHERE lower(to_email) = $1", [iEmail])).rowCount, 0);
  }
  assert.ok(!(await ok<{ handle: string }[]>(fwd, "GET", "/importers")).some((x) => x.handle === i.data.handle), "gone from the forwarder's list");
  // The same email can start again as a new account.
  const again = await call(undefined, "POST", "/auth/signup", { email: iEmail, password, displayName: "Notify Imports Again", role: "importer" });
  assert.equal(again.status, 201);
  check("deletion removes personal data and sign-in; the email can sign up afresh");

  // Clean up: delete the remaining test accounts (the forwarder once its bond is back).
  assert.equal((await call(again.cookie, "POST", "/auth/account/delete", { confirm: "DELETE" })).status, 200);
  await until("forwarder account deletable (bond returned)", async () => (await call(fwd, "POST", "/auth/account/delete", { confirm: "DELETE" })).status === 200, 180_000);
  assert.equal((await call(undefined, "POST", "/auth/login", { email: fEmail, password })).status, 401);
  check("the forwarder can delete their account once the campaign is done and the bond is back");

  console.log(results.join("\n"));
  console.log("FEATURES PASSED");
  await db?.end();
}

main().catch(async (e) => {
  console.log(results.join("\n"));
  console.error(e);
  await db?.end();
  process.exit(1);
});
