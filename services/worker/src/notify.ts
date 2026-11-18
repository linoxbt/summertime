// Notifications (spec 22): level-triggered, like the rest of the worker. Each pass looks at
// what every account can see on the ledger and records one notification per event it has not
// recorded yet (keyed by payload_ref, so a restart never repeats one). A second step emails
// new notifications to members who keep email on.
//
// Privacy (NFR-9, P-4): a notification only describes the recipient's own records. Importers
// never learn another importer's name or amounts; forwarders see their own campaigns.

import {
  T,
  formatCbm,
  formatUsdc,
  type ActiveContract,
  type BookingConfirmation,
  type Campaign,
  type CampaignOutcome,
  type CapacityReservation,
  type Commitment,
  type DisputeRecord,
  type DisputeResolution,
  type Invitation,
  type Receipt,
  type TemplateName,
} from "@summertime/ledger";
import { WEB_URL, brandedEmail, getSystemConfig, mailConfigured, sendMail, setSystemConfig } from "@summertime/platform";
import type { WorkerContext } from "./shared.ts";

const DUE_WINDOW_MS = 24 * 3600_000;
const EMAIL_BATCH = 25;

interface Account {
  id: string;
  party: string;
  role: "importer" | "forwarder";
}

export interface Note {
  kind: string;
  ref: string;
  title: string;
  body: string;
  link: string;
}

async function view(w: WorkerContext, party: string, names: TemplateName[]) {
  const all = await w.ledger.activeContracts<unknown>([party], { templates: names.map((n) => T[n]) });
  return <P>(name: TemplateName) => all.filter((c) => c.templateId.endsWith(T[name].slice(T[name].indexOf(":")))) as ActiveContract<P>[];
}

const day = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** What an importer should hear about, from their own ledger view. */
export async function importerNotes(w: WorkerContext, party: string, title: (id: string) => string, nameOf: (p: string) => string): Promise<Note[]> {
  const pick = await view(w, party, ["Invitation", "CapacityReservation", "Receipt", "BookingConfirmation", "DisputeResolution"]);
  const notes: Note[] = [];
  for (const i of pick<Invitation>("Invitation").filter((x) => x.payload.importer === party)) {
    notes.push({
      kind: "invitation",
      ref: `invitation:${i.payload.invitationId}`,
      title: "New invitation",
      body: `${nameOf(i.payload.forwarder)} invited you to share a container: ${title(i.payload.campaignId)}. Reserve space before ${day(i.payload.terms.lockTime)}.`,
      link: `/importer/invitations/${encodeURIComponent(i.contractId)}`,
    });
  }
  for (const r of pick<CapacityReservation>("CapacityReservation").filter((x) => x.payload.importer === party)) {
    notes.push({
      kind: "reservation.held",
      ref: `held:${r.payload.reservationId}`,
      title: "Your space is held",
      body: `${formatCbm(r.payload.reservedMilliCbm)} CBM in ${title(r.payload.campaignId)}. Lock ${formatUsdc(r.payload.lockedMicroUsdc)} USDCx before ${day(r.payload.terms.lockTime)} to keep it.`,
      link: `/importer/campaigns/${encodeURIComponent(r.payload.campaignId)}`,
    });
  }
  for (const r of pick<Receipt>("Receipt").filter((x) => x.payload.importer === party)) {
    const t = title(r.payload.campaignId);
    const link = `/importer/campaigns/${encodeURIComponent(r.payload.campaignId)}`;
    const usdc = formatUsdc(r.payload.amountMicroUsdc);
    if (r.payload.kind === "Settled")
      notes.push({ kind: "settled", ref: `settled:${r.payload.reservationId}`, title: "Your container settled", body: `${t}: ${formatCbm(r.payload.reservedMilliCbm)} CBM booked, ${usdc} USDCx paid.`, link });
    else if (r.payload.kind === "Released")
      notes.push({ kind: "released", ref: `released:${r.payload.reservationId}`, title: "Funds returned", body: `${t}: ${usdc} USDCx is unlocked and back in your balance.`, link });
    else if (r.payload.kind === "BonusPaid")
      notes.push({ kind: "bonus", ref: `bonus:${r.payload.reservationId}`, title: "Bonus paid", body: `${t} didn't fill. You received a ${usdc} USDCx bonus from the forwarder's bond.`, link });
  }
  for (const b of pick<BookingConfirmation>("BookingConfirmation").filter((x) => x.payload.importer === party)) {
    notes.push({
      kind: "booking",
      ref: `booking:${b.payload.reservationId}:${b.payload.bookingRef}:${b.payload.etd}`,
      title: "Booking confirmed",
      body: `${title(b.payload.campaignId)}: booking ${b.payload.bookingRef}, departing ${b.payload.etd}${b.payload.containerNo ? `, container ${b.payload.containerNo}` : ""}.`,
      link: `/importer/campaigns/${encodeURIComponent(b.payload.campaignId)}`,
    });
  }
  for (const d of pick<DisputeResolution>("DisputeResolution").filter((x) => x.payload.importer === party)) {
    notes.push({
      kind: "dispute.resolved",
      ref: `resolved:${d.payload.reservationId}:${d.payload.openedAt}`,
      title: "Dispute resolved",
      body: `${title(d.payload.campaignId)}: “${d.payload.subject}” is resolved.`,
      link: `/importer/campaigns/${encodeURIComponent(d.payload.campaignId)}`,
    });
  }
  return notes;
}

/** What a forwarder should hear about, from their own ledger view. */
export async function forwarderNotes(
  w: WorkerContext,
  party: string,
  title: (id: string) => string,
  nameOf: (p: string) => string,
  autoSettle: Set<string>,
): Promise<Note[]> {
  const pick = await view(w, party, ["Campaign", "Commitment", "CampaignOutcome", "DisputeRecord"]);
  const now = w.now().getTime();
  const notes: Note[] = [];
  const link = (id: string) => `/forwarder/campaigns/${encodeURIComponent(id)}`;
  const commitments = pick<Commitment>("Commitment").filter((c) => c.payload.forwarder === party);
  for (const c of commitments) {
    notes.push({
      kind: "commitment",
      ref: `commitment:${c.payload.reservationId}`,
      title: "Funds locked",
      body: `${nameOf(c.payload.importer)} locked ${formatUsdc(c.payload.lockedMicroUsdc)} USDCx for ${formatCbm(c.payload.reservedMilliCbm)} CBM in ${title(c.payload.campaignId)}.`,
      link: link(c.payload.campaignId),
    });
  }
  for (const c of pick<Campaign>("Campaign").filter((x) => x.payload.forwarder === party)) {
    const id = c.payload.campaignId;
    const deadline = Date.parse(c.payload.terms.deadline);
    if (now >= deadline) continue;
    const committed = commitments.filter((x) => x.payload.campaignId === id).reduce((a, x) => a + BigInt(x.payload.reservedMilliCbm), 0n);
    if (committed < BigInt(c.payload.terms.thresholdMilliCbm)) continue;
    if (autoSettle.has(id)) continue; // settles on its own; the outcome is announced instead
    notes.push({
      kind: "campaign.full",
      ref: `full:${id}`,
      title: "Ready to settle",
      body: `${title(id)} reached its threshold: ${formatCbm(committed)} CBM committed. Settle before ${day(c.payload.terms.deadline)}.`,
      link: link(id),
    });
    if (deadline - now <= DUE_WINDOW_MS)
      notes.push({
        kind: "campaign.due",
        ref: `due:${id}`,
        title: "Settle within 24 hours",
        body: `${title(id)} is full but not settled. The deadline is ${day(c.payload.terms.deadline)}; after it, everyone is refunded with a bonus from your bond.`,
        link: link(id),
      });
  }
  for (const o of pick<CampaignOutcome>("CampaignOutcome").filter((x) => x.payload.forwarder === party)) {
    const id = o.payload.campaignId;
    const t = title(id);
    const body =
      o.payload.result === "Succeeded"
        ? `${t} settled: ${o.payload.legCount} importers, ${formatCbm(o.payload.settledMilliCbm)} CBM, ${formatUsdc(o.payload.settledMicroUsdc)} USDCx.`
        : o.payload.result === "Failed"
          ? `${t} closed at its deadline without settling. Importers are refunded and paid their bonus from your bond.`
          : `${t} was cancelled.`;
    const heading = o.payload.result === "Succeeded" ? "Container settled" : o.payload.result === "Failed" ? "Container didn't fill" : "Campaign cancelled";
    notes.push({ kind: `outcome.${o.payload.result.toLowerCase()}`, ref: `outcome:${id}`, title: heading, body, link: link(id) });
  }
  for (const d of pick<DisputeRecord>("DisputeRecord").filter((x) => x.payload.forwarder === party)) {
    notes.push({
      kind: "dispute.opened",
      ref: `dispute:${d.payload.reservationId}:${d.payload.openedAt}`,
      title: "Dispute opened",
      body: `${nameOf(d.payload.importer)} opened a dispute on ${title(d.payload.campaignId)}: “${d.payload.subject}”.`,
      link: link(d.payload.campaignId),
    });
  }
  return notes;
}

/**
 * Record new notifications for every pilot account (or just `onlyParty`). The first pass ever
 * records silently, so existing activity doesn't arrive as a flood.
 */
export async function notifyPass(w: WorkerContext, onlyParty?: string): Promise<void> {
  const silent = !(await getSystemConfig<boolean>(w.db, "notifications_live"));
  if (silent && onlyParty) return;
  const accounts = (
    await w.db.query<Account>(
      `SELECT u.id, p.party_id AS party, u.role FROM users u JOIN party_links p ON p.user_id = u.id
        WHERE p.mode = 'pilot' AND u.role IN ('importer', 'forwarder') AND u.deleted_at IS NULL
          AND ($1::text IS NULL OR p.party_id = $1)`,
      [onlyParty ?? null],
    )
  ).rows;
  const names = new Map(
    (await w.db.query<{ party_id: string; display_name: string }>("SELECT p.party_id, u.display_name FROM party_links p JOIN users u ON u.id = p.user_id")).rows.map((r) => [r.party_id, r.display_name]),
  );
  const campaigns = (await w.db.query<{ campaign_id: string; title: string; auto_execute: boolean }>("SELECT campaign_id, title, auto_execute FROM campaign_index")).rows;
  const titles = new Map(campaigns.map((c) => [c.campaign_id, c.title]));
  const autoSettle = new Set(campaigns.filter((c) => c.auto_execute).map((c) => c.campaign_id));
  const title = (id: string) => titles.get(id) ?? "your campaign";

  for (const a of accounts) {
    const notes = a.role === "importer" ? await importerNotes(w, a.party, title, (p) => names.get(p) ?? "A forwarder") : await forwarderNotes(w, a.party, title, (p) => names.get(p) ?? "An importer", autoSettle);
    for (const n of notes) {
      await w.db.query(
        `INSERT INTO notifications (user_id, kind, payload_ref, title, body, link, read_at, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, ${silent ? "now(), now()" : "NULL, NULL"})
         ON CONFLICT (user_id, payload_ref) DO NOTHING`,
        [a.id, n.kind, n.ref, n.title, n.body, n.link],
      );
    }
  }
  if (silent && !onlyParty) {
    await setSystemConfig(w.db, "notifications_live", true);
    w.log.info("notifications: existing activity recorded silently; new events notify from now on");
  }
}

/** Email new notifications to members who keep email on. */
export async function emailPass(w: WorkerContext): Promise<void> {
  if (!mailConfigured()) return;
  const due = await w.db.query<{ id: string; title: string; body: string; link: string | null; email: string }>(
    `SELECT n.id, n.title, n.body, n.link, u.email
       FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE n.sent_at IS NULL AND n.read_at IS NULL AND n.email_attempts < 3 AND n.created_at > now() - interval '1 day'
        AND u.kind = 'member' AND u.notify_email AND u.email IS NOT NULL AND u.deleted_at IS NULL
      ORDER BY n.created_at LIMIT ${EMAIL_BATCH}`,
  );
  for (const n of due.rows) {
    const url = `${WEB_URL}${n.link ?? "/notifications"}`;
    const footer = "You get these emails because you have a Summertime account. Turn them off in Account.";
    try {
      await sendMail(w, {
        to: n.email,
        subject: `${n.title} · Summertime`,
        text: `${n.title}\n\n${n.body}\n\nOpen Summertime: ${url}\n\n${footer}`,
        html: brandedEmail({ title: n.title, paragraphs: [n.body], button: { label: "Open Summertime", href: url }, footer }),
      });
      await w.db.query("UPDATE notifications SET sent_at = now() WHERE id = $1", [n.id]);
    } catch (e) {
      await w.db.query("UPDATE notifications SET email_attempts = email_attempts + 1 WHERE id = $1", [n.id]);
      w.log.warn({ notification: n.id, err: e instanceof Error ? e.message.slice(0, 200) : String(e) }, "notification email failed");
    }
  }
}
