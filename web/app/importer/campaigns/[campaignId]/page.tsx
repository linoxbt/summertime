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
import { PositionStageBadge } from "@/components/status";
import { BalanceChip, ProgressPanel, ReceiptList } from "@/components/importer";
import {
  Button,
  Card,
  ConfirmSheet,
  CustodyNotice,
  ErrorState,
  InlineError,
  KeyValues,
  LoadingState,
  Notice,
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
        <Link href="/importer" className="font-semibold text-accent hover:underline">
          ← My space
        </Link>
      </p>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {pos.title} <PositionStageBadge stage={pos.stage} />
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
          <Card>
            <StageBody pos={pos} settledUpdateId={settledReceipt?.updateId} />
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
          </Card>

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

        <Card title="Your reservation">
          <KeyValues
            items={[
              { label: "Space", value: pos.reserved && pos.reserved.milliCbm !== "0" ? `${cbm(pos.reserved)} CBM` : "—" },
              { label: "Price", value: pos.locked && pos.locked.micro !== "0" ? `${pos.locked.display} USDCx` : "—" },
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
        title="Review and sign your allocation"
        rows={[
          { label: "You lock", value: pos.locked ? `${pos.locked.display} USDCx` : "—" },
          { label: "Space", value: pos.reserved ? `${cbm(pos.reserved)} CBM` : "—" },
          { label: "Paid to", value: pos.forwarder.displayName },
          { label: "Only if full by", value: formatDateTime(t.deadline) },
        ]}
        consequence={
          <p>
            Your USDCx is locked in your own allocation, not sent to anyone. If the container fills before the deadline, it settles to{" "}
            {pos.forwarder.displayName} together with every other importer&apos;s payment. If not, it becomes available to you again and you can claim a share
            of the failure bond. You can withdraw freely until {formatDateTime(t.lockTime)}.
          </p>
        }
        confirmLabel="Sign and commit"
        busy={commit.busy}
        error={commit.error}
        onConfirm={commit.run}
        onClose={commit.close}
      >
        <CustodyNotice />
        <details className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">Allocation details (what you sign)</summary>
          {intent.isPending ? (
            <p className="mt-2 flex items-center gap-2 text-slate-600">
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
        title="Withdraw from this container"
        rows={[
          { label: "Released to you", value: pos.locked ? `${pos.locked.display} USDCx` : "—" },
          { label: "Space given up", value: pos.reserved ? `${cbm(pos.reserved)} CBM` : "—" },
          { label: "Free until", value: formatDateTime(t.lockTime) },
        ]}
        consequence={
          <p>
            Your funds are released now, with no penalty. You give up your space and any claim to the failure bond, and you would need a new invitation to
            rejoin.
          </p>
        }
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
        title="Claim your failure bonus"
        rows={[
          { label: "Bonus", value: pos.bonus ? `${pos.bonus.display} USDCx` : "—" },
          { label: "Funds released", value: pos.locked ? `${pos.locked.display} USDCx` : "—" },
          { label: "Claim by", value: formatDateTime(t.claimWindowEnd) },
        ]}
        consequence={<p>Your locked USDCx is released to you, and Summertime pays your share of the forwarder&apos;s bond from the custody it holds.</p>}
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
        title="Release your funds"
        rows={[
          { label: "Released to you", value: pos.locked ? `${pos.locked.display} USDCx` : "—" },
          ...(pos.bonus ? [{ label: "Unclaimed bonus forfeited", value: `${pos.bonus.display} USDCx` }] : []),
        ]}
        consequence={
          <p>
            {pos.bonus
              ? "Claiming your bonus also releases your funds. Releasing without claiming gives up the bonus."
              : "Your allocation is cancelled and the USDCx returns to your available balance."}
          </p>
        }
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
      <dt className="text-slate-600">{label}</dt>
      <dd className="truncate text-right font-mono text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

function StageBody({ pos, settledUpdateId }: { pos: PositionDto; settledUpdateId?: string }) {
  const f = pos.forwarder.displayName;
  switch (pos.stage) {
    case "requested":
      return (
        <div className="flex items-start gap-3">
          <Spinner className="mt-0.5 h-5 w-5 text-accent" />
          <div>
            <p className="font-semibold text-ink">Waiting for {f} to countersign</p>
            <p className="text-sm text-slate-700">Your request is checked against the container&apos;s remaining space. Nothing is locked yet.</p>
          </div>
        </div>
      );
    case "awaiting-signature":
      return (
        <div>
          <p className="font-semibold text-ink">Your space is reserved. Sign to commit.</p>
          <p className="text-sm text-slate-700">
            {f} countersigned your reservation at a fixed price. Sign your USDCx allocation before {formatDateTime(pos.terms.lockTime)} or the reservation
            lapses.
          </p>
        </div>
      );
    case "committed":
      return (
        <div>
          <p className="font-semibold text-ink">Committed</p>
          <p className="text-sm text-slate-700">
            {pos.phase === "open"
              ? `Your funds are locked in your own allocation. You can withdraw freely until ${formatDateTime(pos.terms.lockTime)}.`
              : `The lock time has passed. If the container fills before ${formatDateTime(pos.terms.deadline)}, your payment settles together with everyone else's.`}
          </p>
        </div>
      );
    case "settled":
      return (
        <div>
          <p className="text-lg font-semibold text-green-800">Settled. Your space is booked.</p>
          <p className="text-sm text-slate-700">Your payment settled to {f} in one transaction with every other importer&apos;s.</p>
          {settledUpdateId && <p className="mt-2 font-mono text-xs text-slate-600">Update {shortId(settledUpdateId, 14)}</p>}
        </div>
      );
    case "withdrawn":
      return <p className="text-slate-700">You withdrew before the lock time. Your funds were released with no penalty.</p>;
    case "claimable":
      return (
        <div>
          <p className="font-semibold text-ink">Your funds are not being used. Claim your bonus.</p>
          <p className="text-sm text-slate-700">The container was not settled with your commitment, so you are owed a share of {f}&apos;s failure bond.</p>
        </div>
      );
    case "bonus-pending":
      return (
        <div className="flex items-start gap-3">
          <Spinner className="mt-0.5 h-5 w-5 text-accent" />
          <div>
            <p className="font-semibold text-ink">Summertime is paying your bonus</p>
            <p className="text-sm text-slate-700">Your locked funds have been released. The bonus arrives in your balance shortly.</p>
          </div>
        </div>
      );
    case "bonus-paid":
      return <p className="font-semibold text-ink">Bonus paid. Your funds were released and your share of the bond is in your balance.</p>;
    case "released":
      return <p className="text-slate-700">Your funds were released after the deadline.</p>;
    case "lapsed":
      return <Notice>This reservation lapsed: the lock time passed before it was signed, or the funds were withdrawn after the lock time.</Notice>;
    default:
      return <p className="text-slate-700">Invited.</p>;
  }
}
