// Accessibility audit (NFR-7): axe-core WCAG 2.1 A/AA rules on every page, signed in as each
// role, at 360 px (phone) and 1280 px (desktop); plus a horizontal-overflow check at 360 px.
//
// Usage: node tests/e2e/a11y.e2e.mjs   (needs `scripts/dev.sh` running and at least one
// settled campaign, e.g. after `npm run e2e:ui`)

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:7580";

const VIEWPORTS = [
  { name: "360", viewport: { width: 360, height: 780 } },
  { name: "1280", viewport: { width: 1280, height: 900 } },
];

async function apiGet(handle, path) {
  const login = await fetch(`${API}/auth/demo-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const res = await fetch(`${API}${path}`, { headers: { cookie } });
  return (await res.json()).data;
}

const campaigns = await apiGet("harbor-bridge", "/campaigns");
const settled = campaigns.find((c) => c.status === "succeeded") ?? campaigns[0];
const positions = await apiGet("ada", "/positions");
const adaPos = positions.find((p) => p.stage === "settled") ?? positions[0];

const pages = [
  { who: null, path: "/" },
  { who: null, path: "/docs" },
  { who: null, path: "/terms" },
  { who: null, path: "/privacy" },
  { who: null, path: "/contact" },
  { who: null, path: "/login" },
  { who: null, path: "/signup" },
  { who: null, path: "/forgot-password" },
  { who: null, path: "/demo" },
  { who: "Ada Phone Accessories", path: "/account" },
  { who: "Harbor Bridge Freight", path: "/forwarder" },
  { who: "Harbor Bridge Freight", path: "/forwarder/new" },
  settled && { who: "Harbor Bridge Freight", path: `/forwarder/campaigns/${encodeURIComponent(settled.campaignId)}` },
  { who: "Harbor Bridge Freight", path: "/history" },
  { who: "Ada Phone Accessories", path: "/importer" },
  adaPos && { who: "Ada Phone Accessories", path: `/importer/campaigns/${encodeURIComponent(adaPos.campaignId)}` },
  { who: "Ada Phone Accessories", path: "/history" },
  { who: "Ada Phone Accessories", path: "/notifications" },
  { who: "Summertime \\(operator\\)", path: "/operations" },
  { who: "Summertime \\(operator\\)", path: "/explorer" },
].filter(Boolean);

const browser = await chromium.launch();
const problems = [];
let checked = 0;
try {
  for (const vp of VIEWPORTS) {
    const contexts = new Map();
    for (const p of pages) {
      const key = p.who ?? "anon";
      if (!contexts.has(key)) {
        const ctx = await browser.newContext({ viewport: vp.viewport });
        if (p.who && /operator/.test(p.who) && process.env.OPERATOR_EMAIL) {
          // On the hosted site the operator is a real account: sign in with its password.
          const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.OPERATOR_EMAIL, password: process.env.OPERATOR_PASSWORD }) });
          if (res.status !== 200) throw new Error(`operator sign-in failed: ${res.status}`);
          const [name, value] = (res.headers.get("set-cookie") ?? "").split(";")[0].split("=");
          const u = new URL(WEB);
          await ctx.addCookies([{ name, value, domain: u.hostname, path: "/", secure: u.protocol === "https:", httpOnly: true }]);
        } else if (p.who) {
          const page = await ctx.newPage();
          await page.goto(`${WEB}/demo`);
          await page.getByRole("button", { name: new RegExp(p.who) }).click();
          await page.waitForURL(/\/(forwarder|importer|explorer|operations)/);
          await page.close();
        }
        contexts.set(key, ctx);
      }
      const page = await contexts.get(key).newPage();
      await page.goto(`${WEB}${p.path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);
      await page.addScriptTag({ content: AXE });
      const result = await page.evaluate(async () =>
        // eslint-disable-next-line no-undef
        axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }),
      );
      for (const v of result.violations) {
        problems.push(`[${vp.name}px] ${p.path} — ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
      }
      if (vp.name === "360") {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 1) problems.push(`[360px] ${p.path} — horizontal overflow of ${overflow}px`);
      }
      checked++;
      await page.close();
    }
    for (const ctx of contexts.values()) await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`Checked ${checked} page views (${pages.length} pages × ${VIEWPORTS.length} widths).`);
if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`A11Y FAILED: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("A11Y PASSED: no WCAG 2.1 A/AA violations, no horizontal overflow at 360 px");
