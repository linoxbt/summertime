// Operational checks (spec 19.3 and 28), run by the worker about once a minute.
//
// Each check writes its current status to ops_checks. When a check leaves "ok" an alert episode
// is opened in ops_alerts; when it returns to "ok" the episode is resolved. Delivery (pager,
// email) hooks onto ops_alerts and is deployment-specific.

import {
  formatCbm,
  formatUsdc,
  type BonusPayout,
  type Campaign,
  type Commitment,
  type OrganizerBond,
} from "@summertime/ledger";
import { acs, unlockedHoldings, type WorkerContext } from "./shared.ts";

type Status = "ok" | "warn" | "alert";

interface CheckResult {
  name: string;
  status: Status;
  summary: string;
  detail?: Record<string, unknown>;
}

const LOCK_GRACE_MS = 10 * 60_000;
const SETTLE_REMINDER_MS = 24 * 3600_000;
const PAYOUT_STUCK_MS = 3600_000;
const REGISTRY_SLOW_MS = 5000;
const registrySamples: number[] = [];

export async function opsPass(w: WorkerContext, forwarders: { party: string }[]): Promise<void> {
  const results: CheckResult[] = [];
  const op = w.deployment.operatorParty;
  const now = w.now().getTime();
  const [bonds, payouts, opCampaigns] = await Promise.all([
    acs<OrganizerBond>(w, op, "OrganizerBond"),
    acs<BonusPayout>(w, op, "BonusPayout"),
    acs<Campaign>(w, op, "Campaign"),
  ]);

  // 1. Bond custody reconciliation (section 10.4): the operator's holdings must cover what it owes.
  {
    const paid = await w.db.query<{ campaign_id: string; total: string }>(
      "SELECT campaign_id, SUM(amount_micro)::text AS total FROM bond_ledger WHERE kind = 'paid' GROUP BY campaign_id",
    );
    const paidBy = new Map(paid.rows.map((r) => [r.campaign_id, BigInt(r.total)]));
    const owedOnBonds = bonds.reduce((a, b) => a + BigInt(b.payload.terms.bondMicroUsdc) - (paidBy.get(b.payload.campaignId) ?? 0n), 0n);
    const pending = await w.db.query<{ total: string | null }>(
      `SELECT SUM(amount_micro)::text AS total FROM bond_ledger r WHERE kind = 'received'
         AND NOT EXISTS (SELECT 1 FROM bond_ledger x WHERE x.campaign_id = r.campaign_id AND x.kind IN ('escrowed', 'refunded'))`,
    );
    const owed = owedOnBonds + BigInt(pending.rows[0]?.total ?? "0");
    const held = (await unlockedHoldings(w, op)).reduce((a, h) => a + h.micro, 0n);
    const ok = held >= owed;
    results.push({
      name: "bond_custody",
      status: ok ? "ok" : "alert",
      summary: ok
        ? `Operator holds ${formatUsdc(held)} USDCx against ${formatUsdc(owed)} USDCx of bonds owed.`
        : `Operator holdings (${formatUsdc(held)} USDCx) are below the bonds owed (${formatUsdc(owed)} USDCx). Pause new campaigns.`,
      detail: { heldMicro: held.toString(), owedMicro: owed.toString(), liveBonds: bonds.length },
    });
  }

  // 2. Bond lock overdue: entitlements depend on it (F-7).
  {
    const late = bonds.filter((b) => !b.payload.locked && now > Date.parse(b.payload.terms.lockTime) + LOCK_GRACE_MS);
    results.push({
      name: "lock_overdue",
      status: late.length ? "alert" : "ok",
      summary: late.length ? `Bond lock overdue for ${late.map((b) => b.payload.campaignId).join(", ")}.` : "Every bond past its lock time is locked.",
      detail: { campaigns: late.map((b) => b.payload.campaignId) },
    });
  }

  // 3. Unpaid bonus claims.
  {
    const stuck = payouts.filter((p) => now - Date.parse(p.createdAt) > PAYOUT_STUCK_MS);
    results.push({
      name: "payouts_unpaid",
      status: stuck.length ? "alert" : "ok",
      summary: stuck.length ? `${stuck.length} bonus payout(s) unpaid for over an hour.` : `${payouts.length} bonus payout(s) pending, none overdue.`,
      detail: { stuck: stuck.map((p) => `${p.payload.campaignId}/${p.payload.reservationId}`) },
    });
  }

  // 4. Settle reminder: threshold met, deadline within 24 hours, not settled (NFR-8).
  {
    const due: string[] = [];
    for (const f of forwarders) {
      const [campaigns, commitments] = await Promise.all([acs<Campaign>(w, f.party, "Campaign"), acs<Commitment>(w, f.party, "Commitment")]);
      for (const c of campaigns) {
        const deadline = Date.parse(c.payload.terms.deadline);
        if (now >= deadline || deadline - now > SETTLE_REMINDER_MS) continue;
        const committed = commitments.filter((x) => x.payload.campaignId === c.payload.campaignId).reduce((a, x) => a + BigInt(x.payload.reservedMilliCbm), 0n);
        if (committed >= BigInt(c.payload.terms.thresholdMilliCbm)) due.push(`${c.payload.campaignId} (${formatCbm(committed)} CBM committed)`);
      }
    }
    results.push({
      name: "settle_reminder",
      status: due.length ? "warn" : "ok",
      summary: due.length ? `Full and due within 24 hours, not yet settled: ${due.join(", ")}.` : "No full campaign is close to its deadline unsettled.",
      detail: { campaigns: due },
    });
  }

  // 5. Failed settlement submissions in the last 24 hours.
  {
    const r = await w.db.query<{ subject: string; error: string }>(
      `SELECT subject, left(error, 200) AS error FROM command_log
        WHERE kind = 'campaign.execute' AND status = 'failed' AND updated_at > now() - interval '24 hours'
        ORDER BY updated_at DESC LIMIT 10`,
    );
    results.push({
      name: "execute_failures",
      status: r.rows.length ? "warn" : "ok",
      summary: r.rows.length ? `${r.rows.length} settlement submission(s) failed in the last 24 hours.` : "No failed settlement submissions in the last 24 hours.",
      detail: { failures: r.rows },
    });
  }

  // 6. Registry latency (p95 of recent probes).
  {
    const started = Date.now();
    let reachable = true;
    try {
      await w.registry.info();
    } catch {
      reachable = false;
    }
    registrySamples.push(Date.now() - started);
    if (registrySamples.length > 60) registrySamples.shift();
    const sorted = [...registrySamples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    results.push({
      name: "registry_latency",
      status: !reachable ? "alert" : p95 > REGISTRY_SLOW_MS ? "warn" : "ok",
      summary: !reachable ? "The token registry is not responding." : `Registry p95 latency ${p95} ms over ${registrySamples.length} probes.`,
      detail: { p95Ms: p95, samples: registrySamples.length },
    });
  }

  // 7. Campaigns the operator co-signs that are past deadline and still not final.
  {
    const lingering = opCampaigns.filter((c) => now > Date.parse(c.payload.terms.deadline) + 10 * 60_000);
    results.push({
      name: "outcomes_recorded",
      status: lingering.length ? "warn" : "ok",
      summary: lingering.length ? `${lingering.length} campaign(s) past deadline without a recorded outcome.` : "Every campaign past its deadline has an outcome.",
      detail: { campaigns: lingering.map((c) => c.payload.campaignId) },
    });
  }

  for (const r of results) await record(w, r);
}

async function record(w: WorkerContext, r: CheckResult): Promise<void> {
  await w.db.query(
    `INSERT INTO ops_checks (name, status, summary, detail, checked_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (name) DO UPDATE SET status = EXCLUDED.status, summary = EXCLUDED.summary, detail = EXCLUDED.detail, checked_at = now()`,
    [r.name, r.status, r.summary, JSON.stringify(r.detail ?? {})],
  );
  const open = await w.db.query<{ id: string }>("SELECT id FROM ops_alerts WHERE name = $1 AND resolved_at IS NULL", [r.name]);
  if (r.status === "ok") {
    if (open.rows.length) await w.db.query("UPDATE ops_alerts SET resolved_at = now() WHERE name = $1 AND resolved_at IS NULL", [r.name]);
  } else if (!open.rows.length) {
    await w.db.query("INSERT INTO ops_alerts (name, severity, summary) VALUES ($1, $2, $3)", [r.name, r.status, r.summary]);
    w.log.warn({ check: r.name, status: r.status, summary: r.summary }, "ops alert raised");
  }
}
