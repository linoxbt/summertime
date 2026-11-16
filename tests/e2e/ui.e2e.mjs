// Browser end-to-end test through the web app (Playwright, Chromium).
//
// Forwarder proposes a 60 CBM campaign, sends the bond and invites six importers; each
// importer, in its own browser session on a phone-sized screen, reserves and signs; the
// forwarder settles all six in one transaction. Screenshots go to .run/screens/.
//
// Usage: node tests/e2e/ui.e2e.mjs   (needs `scripts/dev.sh` running)

import { createRequire } from "node:module";
// The environment provides Playwright globally (require resolution); projects may also add it as a devDependency.
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const SHOTS = new URL("../../.run/screens/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const importers = [
  ["Ada Phone Accessories", "14"],
  ["Bola Textiles", "12"],
  ["Chidi Auto Parts", "11"],
  ["Dami Beauty Supplies", "9"],
  ["Emeka Electronics", "8"],
  ["Funmi Home Goods", "6"],
];

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const errors = [];

async function signIn(browser, name, opts = {}) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${WEB}/login`);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForURL(/\/(forwarder|importer|explorer)/);
  return page;
}

async function confirmSheet(page, label) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 60_000 });
}

const browser = await chromium.launch();
try {
  // ---- Forwarder: propose, bond, invite ----------------------------------------------------
  const fwd = await signIn(browser, "Harbor Bridge Freight", { viewport: { width: 1280, height: 900 } });
  await fwd.goto(`${WEB}/forwarder/new`);
  await fwd.getByLabel("Campaign title").fill("UI test: Guangzhou to Lagos");
  await fwd.getByLabel("Container capacity (CBM)").fill("60");
  await fwd.getByLabel("Threshold to settle (CBM)").fill("60");
  await fwd.getByLabel("Rate (USDCx per CBM)").fill("150");
  await fwd.getByLabel("Min per importer").fill("1");
  await fwd.getByLabel("Max per importer").fill("15");
  await fwd.getByRole("button", { name: /Demo: lock in 5 min/ }).click();
  await fwd.getByLabel("Bond (USDCx)").fill("200");
  await fwd.screenshot({ path: `${SHOTS}forwarder-new.png`, fullPage: true });
  await fwd.getByRole("button", { name: "Propose campaign" }).click();
  await fwd.getByRole("button", { name: "Send bond" }).first().click();
  await confirmSheet(fwd, "Send bond");
  log("campaign proposed and bond sent");
  await fwd.getByRole("button", { name: "Later" }).click().catch(() => {});
  await fwd.waitForURL(/\/forwarder\/campaigns\//, { timeout: 30_000 });
  const campaignUrl = fwd.url();
  await fwd.getByText("Invite importers", { exact: true }).waitFor({ timeout: 90_000 });
  for (const [name] of importers) await fwd.getByLabel(name).check();
  // The Invite button enables once operator automation accepts the bond and the campaign opens.
  await fwd.getByRole("button", { name: /^Send \d+ invitations?/ }).click({ timeout: 90_000 });
  await fwd.getByText(/Invited importers \(6\)/).waitFor({ timeout: 30_000 });
  log("six importers invited");

  // ---- Importers: reserve and sign, on phone-sized screens ----------------------------------
  for (const [name, cbm] of importers) {
    const page = await signIn(browser, name, { ...devices["Pixel 7"], deviceScaleFactor: 1 });
    await page.getByRole("link", { name: /UI test: Guangzhou to Lagos/ }).first().click();
    await page.waitForURL(/\/importer\/invitations\//);
    const amount = page.locator('input[inputmode="decimal"]');
    await amount.fill(cbm);
    if (name.startsWith("Ada")) await page.screenshot({ path: `${SHOTS}importer-reserve.png`, fullPage: true });
    await page.getByRole("button", { name: new RegExp(`^Reserve ${cbm}`) }).click();
    await confirmSheet(page, "Request reservation");
    await page.waitForURL(/\/importer\/campaigns\//, { timeout: 30_000 }).catch(async () => {
      await page.goto(`${WEB}/importer`);
      await page.getByRole("link", { name: /UI test: Guangzhou to Lagos/ }).first().click();
    });
    await page.getByRole("button", { name: "Review and sign" }).click({ timeout: 60_000 });
    if (name.startsWith("Ada")) await page.screenshot({ path: `${SHOTS}importer-sign.png`, fullPage: true });
    await confirmSheet(page, "Sign and commit");
    await page.getByText(/Committed/).first().waitFor({ timeout: 60_000 });
    if (name.startsWith("Ada")) await page.screenshot({ path: `${SHOTS}importer-committed.png`, fullPage: true });
    log(`${name} reserved ${cbm} CBM and signed`);
    await page.context().close();
  }

  // ---- Forwarder: settle -------------------------------------------------------------------
  await fwd.goto(campaignUrl);
  const settle = fwd.getByRole("button", { name: "Settle now" }).first();
  await fwd.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Settle now" && !b.disabled), null, { timeout: 60_000 });
  await fwd.screenshot({ path: `${SHOTS}forwarder-ready.png`, fullPage: true });
  await settle.click();
  await confirmSheet(fwd, "Settle now");
  await fwd.getByText(/This campaign has ended|Settled/).first().waitFor({ timeout: 60_000 });
  await fwd.screenshot({ path: `${SHOTS}forwarder-settled.png`, fullPage: true });
  log("forwarder settled all six legs");

  // ---- Importer sees only its own settled position ------------------------------------------
  const ada = await signIn(browser, "Ada Phone Accessories", { ...devices["Pixel 7"], deviceScaleFactor: 1 });
  await ada.getByRole("link", { name: /UI test: Guangzhou to Lagos/ }).first().click();
  await ada.getByText(/Settled/).first().waitFor({ timeout: 30_000 });
  const text = await ada.locator("body").innerText();
  for (const other of importers.slice(1).map(([n]) => n)) if (text.includes(other)) throw new Error(`Ada can see ${other}`);
  await ada.screenshot({ path: `${SHOTS}importer-settled.png`, fullPage: true });
  log("Ada sees her settled position and no other importer");

  // ---- Privacy explorer ----------------------------------------------------------------------
  const op = await signIn(browser, "Summertime \\(operator\\)", { viewport: { width: 1440, height: 1000 } });
  await op.goto(`${WEB}/explorer`);
  await op.waitForTimeout(3000);
  await op.screenshot({ path: `${SHOTS}explorer.png`, fullPage: true });

  if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);
  log("UI E2E PASSED");
} finally {
  await browser.close();
}
