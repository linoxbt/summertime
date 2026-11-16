"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BalanceDto, ProgressDto, ReceiptDto } from "@summertime/ledger";
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
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm tabular">
        {q.isPending ? (
          <span className="text-slate-600">Loading balance…</span>
        ) : q.isError ? (
          <span className="text-red-800">Balance unavailable</span>
        ) : (
          <>
            <span className="font-semibold text-ink">{q.data.available.display}</span> {q.data.instrument} available
            {q.data.locked.micro !== "0" && <span className="text-slate-600"> · {q.data.locked.display} locked</span>}
          </>
        )}
      </div>
      {showFaucet && (
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
      <p className="text-sm text-slate-600">Progress appears once three importers have committed. It never shows who they are or how much each reserved.</p>
    );
  }
  const filled = percent(progress.reservedCbm, progress.capacityCbm);
  const thr = percent(progress.thresholdCbm, progress.capacityCbm);
  return (
    <div>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-slate-200"
        role="meter"
        aria-label="Container progress"
        aria-valuemin={0}
        aria-valuemax={progress.capacityCbm}
        aria-valuenow={progress.reservedCbm}
      >
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${filled}%` }} />
        {thr < 100 && <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `calc(${thr}% - 1px)` }} />}
      </div>
      <p className="mt-2 text-sm tabular">
        <span className="font-semibold text-ink">
          {progress.reservedCbm} of {progress.capacityCbm} CBM
        </span>{" "}
        committed{progress.participantCount !== null ? ` by ${progress.participantCount} importers` : ""} · threshold {progress.thresholdCbm} CBM
      </p>
      <p className="mt-1 text-xs text-slate-600">Rounded down to whole CBM and updated on a schedule. As of {formatDateTime(progress.asOf)}.</p>
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
  if (receipts.length === 0) return <p className="text-sm text-slate-600">No receipts yet.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {receipts.map((r) => (
        <li key={r.contractId} className="py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone={RECEIPT_LABEL[r.kind].tone}>{RECEIPT_LABEL[r.kind].label}</Badge>
            <span className="text-xs text-slate-600">{formatDateTime(r.createdAt)}</span>
          </div>
          <p className="mt-1 font-semibold text-ink tabular">
            {r.kind === "BonusPaid" ? `${r.amount.display} USDCx` : `${cbm(r.reserved)} CBM · ${r.amount.display} USDCx`}
          </p>
          <p className="text-slate-700">{r.note}</p>
          {r.updateId && (
            <p className="mt-1 text-xs">
              <span className="mr-1 text-slate-600">Update ID</span>
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
    return <EmptyState title="No receipts yet">Receipts appear when your commitments settle, are withdrawn or released, or a bonus is paid.</EmptyState>;
  return <ReceiptList receipts={q.data} />;
}
