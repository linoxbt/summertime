"use client";

// After settlement: booking confirmations and disputes (spec F-10).

import { useState } from "react";
import type { BookingDto, DisputeDto, ForwarderCampaignDetail, PositionDto } from "@summertime/ledger";
import { api } from "@/lib/api";
import { useAction } from "@/lib/action";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ConfirmSheet, EmptyState, Field, InlineError, inputClass } from "@/components/ui";

function formatEtd(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function BookingSummary({ b }: { b: BookingDto }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular">
      <dt className="text-muted">Booking reference</dt>
      <dd className="font-semibold text-fg">{b.bookingRef}</dd>
      <dt className="text-muted">Estimated departure</dt>
      <dd className="font-semibold text-fg">{formatEtd(b.etd)}</dd>
      <dt className="text-muted">Container</dt>
      <dd className="font-semibold text-fg">{b.containerNo ?? "To be assigned"}</dd>
    </dl>
  );
}

function DisputeItem({ d, children }: { d: DisputeDto; children?: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-fg">{d.subject}</p>
        {d.status === "open" ? <Badge tone="accent">Open</Badge> : <Badge tone="success">Resolved</Badge>}
      </div>
      <p className="mt-1 text-xs text-muted">
        {d.importer.displayName} · opened {formatDateTime(d.openedAt)}
      </p>
      {d.details && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{d.details.replace(/\n\n— .*$/, "")}</p>}
      <p className="mt-2 font-mono text-xs text-faint" title="SHA-256 of the details, recorded on the ledger">
        {d.evidenceHash.slice(0, 16)}… {d.evidenceVerified ? "✓ verified" : "unverified"}
      </p>
      {d.resolution && (
        <div className="mt-3 rounded-md bg-panel-2 p-3 text-sm">
          <p className="font-semibold text-fg">Resolution · {formatDateTime(d.resolvedAt)}</p>
          <p className="mt-1 whitespace-pre-wrap text-muted">{d.resolution}</p>
        </div>
      )}
      {children}
    </li>
  );
}

// ---- Forwarder ---------------------------------------------------------------------------

export function ForwarderAftercare({ campaign, onDone }: { campaign: ForwarderCampaignDetail; onDone: () => void }) {
  const settledCount = campaign.outcome?.legCount ?? 0;
  const missing = settledCount - campaign.bookings.length;
  const [ref, setRef] = useState("");
  const [etd, setEtd] = useState("");
  const [containerNo, setContainerNo] = useState("");
  const valid = ref.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(etd);
  const issue = useAction(
    (k) =>
      api.post<{ issued: number }>(
        `/campaigns/${encodeURIComponent(campaign.campaignId)}/bookings`,
        { bookingRef: ref.trim(), etd, containerNo: containerNo.trim() || undefined },
        k,
      ),
    () => {
      setRef("");
      setContainerNo("");
      onDone();
    },
  );
  const open = campaign.disputes.filter((d) => d.status === "open");

  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <Card title="Booking confirmation">
        {campaign.bookings.length > 0 && (
          <ul className="mb-4 space-y-2">
            {campaign.bookings.map((b) => (
              <li key={b.contractId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold text-fg">{b.importer.displayName}</span>
                  <span className="block text-xs text-muted">
                    {b.bookingRef} · ETD {formatEtd(b.etd)}
                    {b.containerNo ? ` · ${b.containerNo}` : ""}
                  </span>
                </span>
                {b.acknowledgedAt ? <Badge tone="success">Acknowledged</Badge> : <Badge>Awaiting acknowledgement</Badge>}
              </li>
            ))}
          </ul>
        )}
        {missing > 0 ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) issue.openSheet();
            }}
          >
            <Field label="Booking reference">
              <input className={inputClass} value={ref} onChange={(e) => setRef(e.target.value)} maxLength={64} />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 [&>*]:min-w-0 sm:grid-cols-2">
              <Field label="Estimated departure (ETD)">
                <input type="date" className={inputClass} value={etd} onChange={(e) => setEtd(e.target.value)} />
              </Field>
              <Field label="Container number" hint="Optional">
                <input className={inputClass} value={containerNo} onChange={(e) => setContainerNo(e.target.value)} maxLength={32} />
              </Field>
            </div>
            <Button type="submit" disabled={!valid}>
              Issue booking confirmation
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">All booked</p>
        )}
      </Card>

      <Card title={`Disputes${open.length ? ` (${open.length} open)` : ""}`}>
        {campaign.disputes.length === 0 ? (
          <EmptyState title="No disputes" />
        ) : (
          <ul className="space-y-3">
            {campaign.disputes.map((d) => (
              <DisputeItem key={d.contractId} d={d}>
                {d.status === "open" && <ResolveDispute dispute={d} onDone={onDone} />}
              </DisputeItem>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmSheet
        open={issue.open}
        title="Issue booking confirmation"
        rows={[
          { label: "Booking reference", value: ref.trim() },
          { label: "ETD", value: etd ? formatEtd(etd) : "—" },
          { label: "Container", value: containerNo.trim() || "To be assigned" },
          { label: "Importers", value: String(missing) },
        ]}
        confirmLabel="Issue confirmation"
        busy={issue.busy}
        error={issue.error}
        onConfirm={issue.run}
        onClose={issue.close}
      />
    </div>
  );
}

function ResolveDispute({ dispute, onDone }: { dispute: DisputeDto; onDone: () => void }) {
  const [text, setText] = useState("");
  const resolve = useAction((k) => api.post(`/disputes/${encodeURIComponent(dispute.contractId)}/resolve`, { resolution: text.trim() }, k), onDone);
  return (
    <div className="mt-3 space-y-2">
      <Field label="Resolution">
        <textarea className={`${inputClass} min-h-20`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
      </Field>
      <Button variant="secondary" disabled={text.trim().length < 3} onClick={resolve.openSheet}>
        Record resolution
      </Button>
      <ConfirmSheet
        open={resolve.open}
        title="Record resolution"
        rows={[
          { label: "Importer", value: dispute.importer.displayName },
          { label: "Dispute", value: dispute.subject },
        ]}
        confirmLabel="Record resolution"
        busy={resolve.busy}
        error={resolve.error}
        onConfirm={resolve.run}
        onClose={resolve.close}
      />
    </div>
  );
}

// ---- Importer ----------------------------------------------------------------------------

export function ImporterAftercare({ pos, onDone }: { pos: PositionDto; onDone: () => void }) {
  const ack = useAction((k) => api.post(`/bookings/${encodeURIComponent(pos.booking?.contractId ?? "")}/acknowledge`, undefined, k), onDone);
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [showForm, setShowForm] = useState(false);
  const dispute = useAction(
    (k) => api.post(`/receipts/${encodeURIComponent(pos.ids.settledReceipt ?? "")}/disputes`, { subject: subject.trim(), details: details.trim() }, k),
    () => {
      setSubject("");
      setDetails("");
      setShowForm(false);
      onDone();
    },
  );
  if (pos.stage !== "settled") return null;
  const b = pos.booking;

  return (
    <>
      <Card title="Your booking">
        {b ? (
          <>
            <BookingSummary b={b} />
            {b.acknowledgedAt ? (
              <p className="mt-3 text-sm text-muted">Acknowledged · {formatDateTime(b.acknowledgedAt)}</p>
            ) : (
              <Button className="mt-3" onClick={ack.openSheet}>
                Acknowledge booking
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">Awaiting booking</p>
        )}
      </Card>

      <Card title="Problems">
        {pos.disputes.length > 0 && (
          <ul className="mb-3 space-y-3">
            {pos.disputes.map((d) => (
              <DisputeItem key={d.contractId} d={d} />
            ))}
          </ul>
        )}
        {pos.actions.canDispute &&
          (showForm ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                dispute.openSheet();
              }}
            >
              <Field label="What went wrong?">
                <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} />
              </Field>
              <Field label="Details">
                <textarea className={`${inputClass} min-h-28`} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={5000} />
              </Field>
              <InlineError error={dispute.error} />
              <div className="flex gap-2">
                <Button type="submit" disabled={subject.trim().length < 3 || details.trim().length < 10}>
                  Open dispute
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="secondary" onClick={() => setShowForm(true)}>
              Report a problem
            </Button>
          ))}
        {!pos.actions.canDispute && pos.disputes.length === 0 && <p className="text-sm text-muted">None</p>}
      </Card>

      <ConfirmSheet
        open={ack.open}
        title="Acknowledge booking"
        rows={b ? [{ label: "Booking", value: b.bookingRef }, { label: "ETD", value: formatEtd(b.etd) }] : []}
        confirmLabel="Acknowledge"
        busy={ack.busy}
        error={ack.error}
        onConfirm={ack.run}
        onClose={ack.close}
      />
      <ConfirmSheet
        open={dispute.open}
        title="Open a dispute"
        rows={[
          { label: "With", value: pos.forwarder.displayName },
          { label: "About", value: subject.trim() },
        ]}
        confirmLabel="Open dispute"
        busy={dispute.busy}
        error={dispute.error}
        onConfirm={dispute.run}
        onClose={dispute.close}
      />
    </>
  );
}
