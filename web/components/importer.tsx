"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BalanceDto, PositionDto, ProgressDto, ReceiptDto } from "@summertime/ledger";
import { PositionStageBadge } from "./status";
import { api, newIdempotencyKey } from "@/lib/api";
import { formatDateTime, percent, cbm } from "@/lib/format";
import { Badge, Button, CopyText, EmptyState, ErrorState, InlineError, LoadingState } from "./ui";

export function BalanceChip({ showFaucet = true }: { showFaucet?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["balance"], queryFn: () => api.get<BalanceDto>("/me/balance"), refetchInterval: 5000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function faucet() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/dev/faucet", { amountUsdc: "10000" }, newIdempotencyKey());
      await qc.invalidateQueries({ queryKey: ["balance"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="rounded-full border border-line bg-panel px-4 py-2 text-sm tabular shadow-soft">
        {q.isPending ? (
          <span className="text-muted">Loading balance…</span>
        ) : q.isError ? (
          <span className="text-danger">Balance unavailable</span>
        ) : (
          <>
            <span className="font-semibold text-fg">{q.data.available.display}</span> {q.data.instrument} available
            {q.data.locked.micro !== "0" && <span className="text-muted"> · {q.data.locked.display} locked</span>}
          </>
        )}
      </div>
      {showFaucet && q.data?.network === "sandbox" && (
        <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" busy={busy} onClick={faucet}>
          Add 10,000 test USDCx
        </Button>
      )}
      <InlineError error={error} />
    </div>
  );
}

export function ProgressPanel({ progress }: { progress: ProgressDto | undefined }) {
  if (!progress || progress.hidden) {
    return (
      <p className="text-sm text-muted">Hidden until 3 importers commit</p>
    );
  }
  const filled = percent(progress.reservedCbm, progress.capacityCbm);
  const thr = percent(progress.thresholdCbm, progress.capacityCbm);
  return (
    <div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-panel-2"
        role="meter"
        aria-label="Container progress"
        aria-valuemin={0}
        aria-valuemax={progress.capacityCbm}
        aria-valuenow={progress.reservedCbm}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-fg transition-[width] duration-700 ease-smooth" style={{ width: `${filled}%` }} />
        {thr < 100 && <div className="absolute inset-y-0 w-0.5 bg-amber" style={{ left: `calc(${thr}% - 1px)` }} />}
      </div>
      <p className="mt-2 text-sm tabular">
        <span className="font-semibold text-fg">
          {progress.reservedCbm} of {progress.capacityCbm} CBM
        </span>{" "}
        committed{progress.participantCount !== null ? ` by ${progress.participantCount} importers` : ""} · threshold {progress.thresholdCbm} CBM
      </p>
      <p className="mt-1 text-xs text-muted">As of {formatDateTime(progress.asOf)}</p>
    </div>
  );
}

const RECEIPT_LABEL: Record<ReceiptDto["kind"], { label: string; tone: "success" | "neutral" | "accent" }> = {
  Settled: { label: "Settled", tone: "success" },
  BonusPaid: { label: "Bonus paid", tone: "accent" },
  Withdrawn: { label: "Withdrawn", tone: "neutral" },
  Released: { label: "Released", tone: "neutral" },
};

export function ReceiptList({ receipts }: { receipts: ReceiptDto[] }) {
  if (receipts.length === 0) return <p className="text-sm text-muted">No receipts yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {receipts.map((r) => (
        <li key={r.contractId} className="py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone={RECEIPT_LABEL[r.kind].tone}>{RECEIPT_LABEL[r.kind].label}</Badge>
            <span className="text-xs text-muted">{formatDateTime(r.createdAt)}</span>
          </div>
          <p className="mt-1 font-semibold text-fg tabular">
            {r.kind === "BonusPaid" ? `${r.amount.display} USDCx` : `${cbm(r.reserved)} CBM · ${r.amount.display} USDCx`}
          </p>
          {r.updateId && (
            <p className="mt-1 text-xs">
              <span className="mr-1 text-muted">Update ID</span>
              <CopyText value={r.updateId} label="update ID" />
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ReceiptsQuery() {
  const q = useQuery({ queryKey: ["receipts"], queryFn: () => api.get<ReceiptDto[]>("/me/receipts"), refetchInterval: 10000 });
  if (q.isPending) return <LoadingState label="Loading receipts…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0)
    return <EmptyState title="No receipts yet" />;
  return <ReceiptList receipts={q.data} />;
}

/** The importer's position as a container booking slip: route, space, amount, status. */
export function PositionSlip({ pos, status, children }: { pos: PositionDto; status: ReactNode; children?: ReactNode }) {
  const [from, to] = (pos.route ?? "").split(/\s*(?:→|->)\s*/);
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-panel shadow-lift">
      <div className="flex items-center justify-between border-b border-line bg-white/60 px-5 py-3">
        <span className="display text-xl text-fg">Container booking</span>
        <PositionStageBadge stage={pos.stage} />
      </div>
      <div className="flex items-end justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="label text-faint">From</p>
          <p className="display text-2xl text-fg [overflow-wrap:anywhere] sm:text-4xl">{from || "Origin"}</p>
        </div>
        <span className="mb-3 h-px min-w-6 flex-1 border-t border-dashed border-line-strong" aria-hidden="true" />
        <div className="min-w-0 text-right">
          <p className="label text-faint">To</p>
          <p className="display text-2xl text-fg [overflow-wrap:anywhere] sm:text-4xl">{to || "Destination"}</p>
        </div>
      </div>
      <div className="mx-5 my-4 border-t border-dashed border-line-strong" />
      <dl className="grid grid-cols-2 gap-4 px-5 sm:grid-cols-3">
        <div>
          <dt className="label text-faint">Space</dt>
          <dd className="mt-1 text-lg font-semibold text-fg tabular">{pos.reserved && pos.reserved.milliCbm !== "0" ? `${cbm(pos.reserved)} CBM` : "—"}</dd>
        </div>
        <div>
          <dt className="label text-faint">Amount</dt>
          <dd className="mt-1 text-lg font-semibold text-fg tabular">{pos.locked && pos.locked.micro !== "0" ? `${pos.locked.display} USDCx` : "—"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="label text-faint">Forwarder</dt>
          <dd className="mt-1 truncate text-lg font-semibold text-fg">{pos.forwarder.displayName}</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-line bg-page px-5 py-4">
        {status}
        {children}
      </div>
    </section>
  );
}
