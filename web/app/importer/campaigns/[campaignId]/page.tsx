"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Amount, PositionDto, SettlementInfo, TransferLeg } from "@summertime/ledger";
import { api } from "@/lib/api";
import { useAction } from "@/lib/action";
import { ImporterAftercare } from "@/components/aftercare";
import { formatDateTime, relativeTime, shortId, shortParty, cbm } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { BalanceChip, PositionSlip, ProgressPanel, ReceiptList } from "@/components/importer";
import {
  Button,
  Card,
  ConfirmSheet,
  CustodyNotice,
  ErrorState,
  InlineError,
  KeyValues,
  LoadingState,
  PageHeader,
  PrivacyLine,
  Spinner,
} from "@/components/ui";

interface AllocationIntent {
  settlement: SettlementInfo;
  transferLegId: string;
  transferLeg: TransferLeg;
  amount: Amount;
}

export default function PositionPage() {
  return (
    <AppShell role="importer">
      <Position />
    </AppShell>
  );
}

function Position() {
  const { campaignId: raw } = useParams<{ campaignId: string }>();
  const campaignId = decodeURIComponent(raw);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["position", campaignId],
    queryFn: () => api.get<PositionDto>(`/positions/${encodeURIComponent(campaignId)}`),
    refetchInterval: 3000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["position", campaignId] });
    qc.invalidateQueries({ queryKey: ["positions"] });
    qc.invalidateQueries({ queryKey: ["balance"] });
    qc.invalidateQueries({ queryKey: ["receipts"] });
  };
  const p = q.data;
  const commit = useAction(
    (k) => api.post<{ updateId: string }>(`/reservations/${encodeURIComponent(p?.ids.reservation ?? "")}/commit`, undefined, k),
    refresh,
  );
  const withdraw = useAction(
    (k) => api.post<{ updateId: string }>(`/commitments/${encodeURIComponent(p?.ids.commitment ?? "")}/withdraw`, undefined, k),
    refresh,
  );
  const claim = useAction((k) => api.post<{ updateId: string }>(`/entitlements/${encodeURIComponent(p?.ids.entitlement ?? "")}/claim`, undefined, k), refresh);
  const release = useAction(
    (k) => api.post<{ updateId: string }>(`/commitments/${encodeURIComponent(p?.ids.commitment ?? "")}/release`, undefined, k),
    refresh,
  );
  const intent = useQuery({
    queryKey: ["allocation-intent", p?.ids.reservation],
    queryFn: () => api.get<AllocationIntent>(`/reservations/${encodeURIComponent(p!.ids.reservation!)}/allocation-intent`),
    enabled: commit.open && !!p?.ids.reservation,
  });

  if (q.isPending) return <LoadingState label="Loading your reservation…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const pos = q.data;
  const t = pos.terms;
  const settledReceipt = pos.receipts.find((r) => r.kind === "Settled");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/importer" className="font-semibold text-link hover:underline">
          ← My space
        </Link>
      </p>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {pos.title}
          </span>
        }
        subtitle={
          <span className="block space-y-1">
            <span className="block">
              {pos.forwarder.displayName}
              {pos.route ? ` · ${pos.route}` : ""}
            </span>
            <PrivacyLine />
          </span>
        }
        action={<BalanceChip showFaucet={pos.stage === "awaiting-signature"} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <PositionSlip pos={pos} status={<StageBody pos={pos} settledUpdateId={settledReceipt?.updateId} />}>
            {(pos.actions.canCommit || pos.actions.canClaim || pos.actions.canWithdraw || pos.actions.canRelease) && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {pos.actions.canCommit && <Button onClick={commit.openSheet}>Review and sign</Button>}
                {pos.actions.canClaim && <Button onClick={claim.openSheet}>Claim {pos.bonus ? `${pos.bonus.display} USDCx` : "bonus"}</Button>}
                {pos.actions.canWithdraw && (
                  <Button variant="danger" onClick={withdraw.openSheet}>
                    Withdraw
                  </Button>
                )}
                {pos.actions.canRelease && (
                  <Button variant="secondary" onClick={release.openSheet}>
                    Release my funds
                  </Button>
                )}
              </div>
            )}
          </PositionSlip>

          <ImporterAftercare pos={pos} onDone={refresh} />

          {/* Progress readings are published while the container fills; after the outcome they are stale. */}
          {["requested", "awaiting-signature", "committed"].includes(pos.stage) && (
            <Card title="Container progress">
              <ProgressPanel progress={pos.progress} />
            </Card>
          )}

          <Card title="Receipts">
            <ReceiptList receipts={pos.receipts} />
          </Card>
        </div>

        <Card title="Terms">
          <KeyValues
            items={[
              { label: "Rate", value: `${t.ratePerCbm.display} USDCx / CBM` },
              ...(pos.bonus ? [{ label: "Failure bonus", value: `${pos.bonus.display} USDCx` }] : []),
              { label: "Lock time", value: `${formatDateTime(t.lockTime)} (${relativeTime(t.lockTime)})` },
              { label: "Deadline", value: `${formatDateTime(t.deadline)} (${relativeTime(t.deadline)})` },
              { label: "Claim window ends", value: formatDateTime(t.claimWindowEnd) },
            ]}
          />
        </Card>
      </div>

      <ConfirmSheet
        open={commit.open}
        title="Sign and commit"
        rows={[
          { label: "You lock", value: pos.locked ? `${pos.locked.display} USDCx` : "—" },
          { label: "Space", value: pos.reserved ? `${cbm(pos.reserved)} CBM` : "—" },
          { label: "Paid to", value: pos.forwarder.displayName },
          { label: "Only if full by", value: formatDateTime(t.deadline) },
          { label: "If not full", value: "Refund + bonus" },
          { label: "Free withdrawal until", value: formatDateTime(t.lockTime) },
        ]}
        confirmLabel="Sign and commit"
        busy={commit.busy}
        error={commit.error}
        onConfirm={commit.run}
        onClose={commit.close}
      >
        <CustodyNotice />
        <details className="rounded-lg border border-line px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-fg">What you sign</summary>
          {intent.isPending ? (
            <p className="mt-2 flex items-center gap-2 text-muted">
              <Spinner className="h-4 w-4" /> Loading…
            </p>
          ) : intent.isError ? (
            <div className="mt-2">
              <InlineError error={intent.error} />
            </div>
          ) : (
            <dl className="mt-2 space-y-1 text-xs">
              <Detail label="Amount" value={`${intent.data.amount.display} ${intent.data.transferLeg.instrumentId.id}`} />
              <Detail label="Sender" value={shortParty(intent.data.transferLeg.sender)} />
              <Detail label="Receiver" value={shortParty(intent.data.transferLeg.receiver)} />
              <Detail label="Executor" value={shortParty(intent.data.settlement.executor)} />
              <Detail label="Settlement" value={intent.data.settlement.settlementRef.id} />
              <Detail label="Leg" value={intent.data.transferLegId} />
              <Detail label="Allocate before" value={formatDateTime(intent.data.settlement.allocateBefore)} />
              <Detail label="Settle before" value={formatDateTime(intent.data.settlement.settleBefore)} />
            </dl>
          )}
        </details>
      </ConfirmSheet>
      <ConfirmSheet
        open={withdraw.open}
        title="Withdraw"
        rows={[
          { label: "Released to you", value: pos.locked ? `${pos.locked.display} USDCx` : "—" },
          { label: "Space given up", value: pos.reserved ? `${cbm(pos.reserved)} CBM` : "—" },
          { label: "Penalty", value: "None" },
        ]}
        confirmLabel="Withdraw"
        tone="danger"
        busy={withdraw.busy}
        error={withdraw.error}
        onConfirm={withdraw.run}
        onClose={withdraw.close}
      >
        <CustodyNotice />
      </ConfirmSheet>
      <ConfirmSheet
        open={claim.open}
        title="Claim bonus"
        rows={[
          { label: "Bonus", value: pos.bonus ? `${pos.bonus.display} USDCx` : "—" },
          { label: "Funds released", value: pos.locked ? `${pos.locked.display} USDCx` : "—" },
          { label: "Claim by", value: formatDateTime(t.claimWindowEnd) },
        ]}
        confirmLabel="Claim bonus"
        busy={claim.busy}
        error={claim.error}
        onConfirm={claim.run}
        onClose={claim.close}
      >
        <CustodyNotice />
      </ConfirmSheet>
      <ConfirmSheet
        open={release.open}
        title="Release funds"
        rows={[
          { label: "Released to you", value: pos.locked ? `${pos.locked.display} USDCx` : "—" },
          ...(pos.bonus ? [{ label: "Unclaimed bonus forfeited", value: `${pos.bonus.display} USDCx` }] : []),
        ]}
        confirmLabel="Release funds"
        tone={pos.bonus ? "danger" : "primary"}
        busy={release.busy}
        error={release.error}
        onConfirm={release.run}
        onClose={release.close}
      >
        <CustodyNotice />
      </ConfirmSheet>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right font-mono text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}

function StageBody({ pos, settledUpdateId }: { pos: PositionDto; settledUpdateId?: string }) {
  const t = pos.terms;
  const line = (text: string, spin = false) => (
    <p className="flex items-center gap-2 font-semibold text-fg">
      {spin && <Spinner className="h-5 w-5 text-link" />}
      {text}
    </p>
  );
  switch (pos.stage) {
    case "requested":
      return line("Awaiting countersignature", true);
    case "awaiting-signature":
      return line(`Reserved · sign by ${formatDateTime(t.lockTime)}`);
    case "committed":
      return line(pos.phase === "open" ? `Committed · free withdrawal until ${formatDateTime(t.lockTime)}` : `Locked · settles if full by ${formatDateTime(t.deadline)}`);
    case "settled":
      return (
        <div>
          <p className="text-lg font-semibold text-ok">Settled · space booked</p>
          {settledUpdateId && <p className="mt-1 font-mono text-xs text-muted">Update {shortId(settledUpdateId, 14)}</p>}
        </div>
      );
    case "withdrawn":
      return line("Withdrawn · funds released");
    case "claimable":
      return line("Not settled · bonus available");
    case "bonus-pending":
      return line("Paying bonus", true);
    case "bonus-paid":
      return line("Bonus paid · funds released");
    case "released":
      return line("Funds released");
    case "lapsed":
      return line("Lapsed");
    default:
      return line("Invited");
  }
}
