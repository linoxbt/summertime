"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { bothUnits, formatCbm, formatUsdc, lockedAmount, parseUnits, type InvitationDto } from "@summertime/ledger";
import { api } from "@/lib/api";
import { useAction } from "@/lib/action";
import { formatDateTime, relativeTime, cbm } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { BalanceChip } from "@/components/importer";
import { Button, Card, ConfirmSheet, EmptyState, ErrorState, KeyValues, LoadingState, PageHeader, PrivacyLine, inputClass } from "@/components/ui";

export default function InvitationPage() {
  return (
    <AppShell role="importer">
      <Invitation />
    </AppShell>
  );
}

function Invitation() {
  const { cid: raw } = useParams<{ cid: string }>();
  const cid = decodeURIComponent(raw);
  const q = useQuery({ queryKey: ["invitations"], queryFn: () => api.get<InvitationDto[]>("/invitations") });
  if (q.isPending) return <LoadingState label="Loading invitation…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const inv = q.data.find((i) => i.contractId === cid);
  if (!inv)
    return (
      <EmptyState title="This invitation is no longer open">
        It may have expired, been used or been revoked.{" "}
        <Link href="/importer" className="font-semibold text-accent hover:underline">
          Back to my space
        </Link>
      </EmptyState>
    );
  return <Reserve inv={inv} />;
}

function Reserve({ inv }: { inv: InvitationDto }) {
  const router = useRouter();
  const qc = useQueryClient();
  const t = inv.terms;
  const min = Number(t.minReservation.milliCbm);
  const max = Number(t.maxReservation.milliCbm);
  const rate = t.rateMicroUsdcPerMilliCbm;
  const [milli, setMilli] = useState<number>(Math.min(max, Math.max(min, 4000)));
  const [text, setText] = useState(formatCbm(Math.min(max, Math.max(min, 4000))));
  const [textError, setTextError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const expired = Date.parse(inv.expiresAt) <= now;

  const reserve = useAction(
    (k) => api.post<{ requestCid: string }>(`/invitations/${encodeURIComponent(inv.contractId)}/reserve`, { reservedCbm: formatCbm(milli) }, k),
    () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      qc.invalidateQueries({ queryKey: ["positions"] });
      router.push(`/importer/campaigns/${encodeURIComponent(inv.campaignId)}`);
    },
  );
  const decline = useAction(
    (k) => api.post(`/invitations/${encodeURIComponent(inv.contractId)}/decline`, undefined, k),
    () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      router.push("/importer");
    },
  );

  function onText(v: string) {
    setText(v);
    try {
      const m = Number(parseUnits(v || "0", 3));
      if (m < min) setTextError(`At least ${cbm(t.minReservation)} CBM.`);
      else if (m > max) setTextError(`At most ${cbm(t.maxReservation)} CBM.`);
      else {
        setTextError(null);
        setMilli(m);
      }
    } catch {
      setTextError("Enter CBM with up to 3 decimals.");
    }
  }

  const locked = lockedAmount(milli, rate);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/importer" className="font-semibold text-accent hover:underline">
          ← My space
        </Link>
      </p>
      <PageHeader title={inv.title} subtitle={<PrivacyLine />} action={<BalanceChip showFaucet={false} />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Reserve space">
            <label htmlFor="cbm" className="text-sm font-semibold text-ink">
              How much space do you need?
            </label>
            <input
              id="cbm"
              type="range"
              min={min}
              max={max}
              step={500}
              value={milli}
              onChange={(e) => {
                const m = Number(e.target.value);
                setMilli(m);
                setText(formatCbm(m));
                setTextError(null);
              }}
              className="mt-4 h-11 w-full"
              aria-valuetext={bothUnits(milli, locked)}
              disabled={expired}
            />
            <div className="flex justify-between text-xs text-slate-600 tabular">
              <span>{cbm(t.minReservation)} CBM</span>
              <span>{cbm(t.maxReservation)} CBM</span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:items-end">
              <label className="block">
                <span className="text-sm font-semibold text-ink">CBM</span>
                <input className={`${inputClass} mt-1`} inputMode="decimal" value={text} onChange={(e) => onText(e.target.value)} disabled={expired} />
                {textError && <span className="mt-1 block text-xs font-semibold text-red-800">{textError}</span>}
              </label>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-600">You lock</p>
                <p className="text-2xl font-semibold text-ink tabular" aria-live="polite">
                  {formatUsdc(locked)} <span className="text-base">USDCx</span>
                </p>
                <p className="text-xs text-slate-600 tabular">{bothUnits(milli, locked)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-700">
              Reserving asks {inv.forwarder.displayName} to countersign. Your funds are locked only when you sign the allocation in the next step, and they stay
              in your own allocation until the container fills.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button onClick={reserve.openSheet} disabled={expired || !!textError}>
                Reserve {formatCbm(milli)} CBM
              </Button>
              <Button variant="ghost" onClick={decline.openSheet}>
                Decline invitation
              </Button>
            </div>
            {expired && <p className="mt-2 text-sm font-semibold text-red-800">The lock time has passed; this invitation can no longer be used.</p>}
          </Card>
        </div>
        <Card title="Terms">
          <KeyValues
            items={[
              { label: "Forwarder", value: inv.forwarder.displayName },
              { label: "Route", value: inv.route ?? "—" },
              { label: "Rate", value: `${t.ratePerCbm.display} USDCx / CBM` },
              { label: "Container", value: `${cbm(t.capacity)} CBM` },
              { label: "Fills at", value: `${cbm(t.threshold)} CBM` },
              { label: "Failure bond", value: `${t.bond.display} USDCx` },
              { label: "Reserve by", value: `${formatDateTime(inv.expiresAt)} (${relativeTime(inv.expiresAt, now)})` },
              { label: "Deadline", value: formatDateTime(t.deadline) },
            ]}
          />
        </Card>
      </div>

      <ConfirmSheet
        open={reserve.open}
        title="Request this reservation"
        rows={[
          { label: "Space", value: `${formatCbm(milli)} CBM` },
          { label: "Price", value: `${formatUsdc(locked)} USDCx` },
          { label: "Free withdrawal until", value: formatDateTime(t.lockTime) },
          { label: "Deadline", value: formatDateTime(t.deadline) },
        ]}
        consequence={
          <p>
            If the container reaches {cbm(t.threshold)} CBM before the deadline, {formatUsdc(locked)} USDCx settles to {inv.forwarder.displayName}. If it
            doesn&apos;t, your funds are released and you can claim a share of the {t.bond.display} USDCx failure bond. Other importers will never see this
            reservation.
          </p>
        }
        confirmLabel="Request reservation"
        busy={reserve.busy}
        error={reserve.error}
        onConfirm={reserve.run}
        onClose={reserve.close}
      />
      <ConfirmSheet
        open={decline.open}
        title="Decline this invitation"
        rows={[{ label: "Campaign", value: inv.title }]}
        consequence={<p>The invitation is removed. You would need a new invitation from {inv.forwarder.displayName} to join this container.</p>}
        confirmLabel="Decline"
        tone="danger"
        busy={decline.busy}
        error={decline.error}
        onConfirm={decline.run}
        onClose={decline.close}
      />
    </>
  );
}
