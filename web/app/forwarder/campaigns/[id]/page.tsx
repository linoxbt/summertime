"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUsdc, type ForwarderCampaignDetail, type PartyRef } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { useAction } from "@/lib/action";
import { formatDateTime, relativeTime, shortParty, cbm } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { CampaignStatusBadge, ReservationStageBadge, bondStageLabel } from "@/components/status";
import {
  Badge,
  Button,
  CapacityBar,
  Card,
  ConfirmSheet,
  CopyText,
  EmptyState,
  ErrorState,
  InlineError,
  KeyValues,
  LoadingState,
  Notice,
  PageHeader,
} from "@/components/ui";

export default function CampaignDetailPage() {
  return (
    <AppShell role="forwarder">
      <CampaignDetail />
    </AppShell>
  );
}

function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => api.get<ForwarderCampaignDetail>(`/campaigns/${encodeURIComponent(id)}`),
    refetchInterval: 3000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["campaign", id] });
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  };
  const path = `/campaigns/${encodeURIComponent(id)}`;
  const bond = useAction((k) => api.post<{ updateId: string }>(`${path}/bond`, undefined, k), refresh);
  const execute = useAction((k) => api.post<{ updateId: string; legCount: number }>(`${path}/execute`, undefined, k), refresh);
  const fail = useAction((k) => api.post<{ updateId: string }>(`${path}/fail`, undefined, k), refresh);
  const cancel = useAction((k) => api.post<{ updateId: string }>(`${path}/cancel`, undefined, k), refresh);

  if (q.isPending) return <LoadingState label="Loading campaign…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const t = c.terms;
  const committedRows = c.reservations.filter((r) => r.stage === "committed");
  const active = c.status === "open" || c.status === "locked" || c.status === "expired";
  const canCancel = active && c.held.milliCbm === "0";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/forwarder" className="font-semibold text-accent hover:underline">
          ← Campaigns
        </Link>
      </p>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.title} <CampaignStatusBadge status={c.status} />
          </span>
        }
        subtitle={
          <>
            {c.route ?? "Route not set"} · <span className="font-mono text-xs">{c.campaignId}</span>
          </>
        }
        action={
          <a
            href={`/api${path}/export.csv`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            Export CSV
          </a>
        }
      />

      {c.outcome && (
        <Card className={c.outcome.result === "Succeeded" ? "mb-4 border-green-300 bg-green-50" : "mb-4"}>
          <h2 className="text-lg font-semibold text-ink">
            {c.outcome.result === "Succeeded"
              ? "Settled in one transaction"
              : c.outcome.result === "Failed"
                ? "The container did not fill"
                : "Campaign cancelled"}
          </h2>
          {c.outcome.result === "Succeeded" && (
            <p className="mt-1 text-slate-700 tabular">
              {c.outcome.legCount} importer{c.outcome.legCount === 1 ? "" : "s"} · {cbm(c.outcome.settled)} CBM · {c.outcome.settledAmount.display} USDCx paid
              to you.
            </p>
          )}
          {c.outcome.result === "Failed" && (
            <p className="mt-1 text-slate-700">Every importer&apos;s funds are released. Committed importers can claim their share of your bond.</p>
          )}
          {c.outcome.updateId && (
            <div className="mt-3 text-sm">
              <span className="mr-2 font-semibold text-ink">Update ID</span>
              <CopyText value={c.outcome.updateId} label="update ID" />
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Container">
            <CapacityBar
              label="Committed capacity"
              committed={Number(c.committed.milliCbm)}
              held={Number(c.held.milliCbm)}
              threshold={Number(t.threshold.milliCbm)}
              capacity={Number(t.capacity.milliCbm)}
            />
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 tabular">
              <Stat label="Committed" value={`${cbm(c.committed)} CBM`} />
              <Stat label="Reserved (incl. unsigned)" value={`${cbm(c.held)} CBM`} />
              <Stat label="Threshold" value={`${cbm(t.threshold)} CBM`} />
              <Stat label="Capacity" value={`${cbm(t.capacity)} CBM`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
              <Legend className="bg-accent" label="Committed" />
              <Legend className="bg-amber-300" label="Reserved, not yet signed" />
              <Legend className="bg-ink" label="Threshold" />
            </div>
          </Card>

          <Card
            title={`Reservations (${c.reservations.length})`}
            action={<span className="text-xs text-slate-600">Only you and Summertime see this list</span>}
          >
            {c.reservations.length === 0 ? (
              <EmptyState title="No reservations yet">Invite importers; their requests appear here as they reserve.</EmptyState>
            ) : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 font-semibold sm:px-2">Importer</th>
                      <th className="px-2 py-2 font-semibold">Stage</th>
                      <th className="px-2 py-2 text-right font-semibold">Reserved</th>
                      <th className="px-2 py-2 text-right font-semibold">Locked</th>
                      <th className="px-4 py-2 text-right font-semibold sm:px-2">Bonus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular">
                    {c.reservations.map((r) => (
                      <tr key={r.contractId}>
                        <td className="px-4 py-2 sm:px-2">
                          <span className="font-semibold text-ink">{r.importer.displayName}</span>
                          <span className="block text-xs text-slate-500">{r.reservationId}</span>
                        </td>
                        <td className="px-2 py-2">
                          <ReservationStageBadge stage={r.stage} />
                        </td>
                        <td className="px-2 py-2 text-right">{cbm(r.reserved)} CBM</td>
                        <td className="px-2 py-2 text-right">{r.locked.display} USDCx</td>
                        <td className="px-4 py-2 text-right sm:px-2">{r.bonus ? `${r.bonus.display} USDCx` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Invitees campaign={c} onDone={refresh} />
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Settlement">
            {c.outcome ? (
              <p className="text-sm text-slate-700">This campaign has ended.</p>
            ) : (
              <div className="space-y-3">
                <Button className="w-full" disabled={!c.canExecute} onClick={execute.openSheet}>
                  Settle now
                </Button>
                {!c.canExecute && c.executeBlockers.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                    {c.executeBlockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                {c.status === "expired" && (
                  <Button variant="danger" className="w-full" onClick={fail.openSheet}>
                    Record failure
                  </Button>
                )}
                {canCancel && (
                  <Button variant="secondary" className="w-full" onClick={cancel.openSheet}>
                    Cancel campaign
                  </Button>
                )}
                <p className="text-xs text-slate-600">All committed importers settle in one Canton transaction. If any leg fails, nothing moves.</p>
              </div>
            )}
          </Card>

          <Card title="Failure bond">
            <KeyValues
              items={[
                { label: "Amount", value: `${c.bond.amount.display} USDCx` },
                { label: "Status", value: bondStageLabel(c.bond.stage) },
              ]}
            />
            {c.bond.stage === "awaiting-transfer" && (
              <Button className="mt-3 w-full" onClick={bond.openSheet}>
                Send bond
              </Button>
            )}
            {c.bond.stage === "transfer-sent" && (
              <p className="mt-3 text-xs text-slate-600">Summertime accepts the bond and opens the campaign automatically.</p>
            )}
          </Card>

          <Card title="Terms">
            <KeyValues
              items={[
                { label: "Rate", value: `${t.ratePerCbm.display} USDCx / CBM` },
                { label: "Per importer", value: `${cbm(t.minReservation)}–${cbm(t.maxReservation)} CBM` },
                { label: "Full value", value: `${t.fullCapacityValue.display} USDCx` },
                { label: "Lock time", value: <TimeValue iso={t.lockTime} /> },
                { label: "Deadline", value: <TimeValue iso={t.deadline} /> },
                { label: "Claim window ends", value: formatDateTime(t.claimWindowEnd) },
                { label: "Instrument", value: t.instrument.id },
              ]}
            />
          </Card>
        </div>
      </div>

      <ConfirmSheet
        open={bond.open}
        title="Send the failure bond"
        rows={[
          { label: "Bond", value: `${c.bond.amount.display} USDCx` },
          { label: "To", value: "Summertime (operator)" },
          { label: "Deadline", value: formatDateTime(t.deadline) },
        ]}
        consequence={
          <p>
            Summertime holds the bond until the campaign ends. If the container doesn&apos;t fill, it is paid to the importers who committed; otherwise it is
            returned to you.
          </p>
        }
        confirmLabel="Send bond"
        busy={bond.busy}
        error={bond.error}
        onConfirm={bond.run}
        onClose={bond.close}
      />
      <ConfirmSheet
        open={execute.open}
        title="Settle the container"
        rows={[
          { label: "Importers", value: String(committedRows.length) },
          { label: "Committed", value: `${cbm(c.committed)} CBM` },
          {
            label: "You receive",
            value: `${formatUsdc(committedRows.reduce((s, r) => s + BigInt(r.locked.micro), 0n))} USDCx`,
          },
          { label: "Deadline", value: formatDateTime(t.deadline) },
        ]}
        consequence={
          <p>
            Every committed importer&apos;s payment settles to you in one atomic transaction, and their bonus claims are voided. If any leg fails, nothing moves
            and you can try again before the deadline. Issue booking confirmations to each importer afterwards.
          </p>
        }
        confirmLabel="Settle now"
        busy={execute.busy}
        error={execute.error}
        onConfirm={execute.run}
        onClose={execute.close}
      />
      <ConfirmSheet
        open={fail.open}
        title="Record that the container did not fill"
        rows={[
          { label: "Committed", value: `${cbm(c.committed)} CBM` },
          { label: "Threshold", value: `${cbm(t.threshold)} CBM` },
          { label: "Bond shared", value: `${c.bond.amount.display} USDCx` },
        ]}
        consequence={
          <p>
            Nothing settles. Importers&apos; funds are released and committed importers can claim their share of your bond until{" "}
            {formatDateTime(t.claimWindowEnd)}.
          </p>
        }
        confirmLabel="Record failure"
        tone="danger"
        busy={fail.busy}
        error={fail.error}
        onConfirm={fail.run}
        onClose={fail.close}
      />
      <ConfirmSheet
        open={cancel.open}
        title="Cancel this campaign"
        rows={[
          { label: "Reserved capacity", value: `${cbm(c.held)} CBM` },
          { label: "Bond", value: `${c.bond.amount.display} USDCx` },
        ]}
        consequence={<p>No importer has reserved space, so cancelling costs nothing. Summertime returns your bond.</p>}
        confirmLabel="Cancel campaign"
        tone="danger"
        busy={cancel.busy}
        error={cancel.error}
        onConfirm={cancel.run}
        onClose={cancel.close}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-600">{label}</p>
      <p className="font-semibold text-ink">{value}</p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function TimeValue({ iso }: { iso: string }) {
  return (
    <span>
      {formatDateTime(iso)} <span className="font-normal text-slate-500">({relativeTime(iso)})</span>
    </span>
  );
}

function Invitees({ campaign, onDone }: { campaign: ForwarderCampaignDetail; onDone: () => void }) {
  const directory = useQuery({ queryKey: ["importers"], queryFn: () => api.get<PartyRef[]>("/importers") });
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const invited = useMemo(() => new Set(campaign.invitees.map((i) => i.party)), [campaign.invitees]);
  const canInvite = (campaign.status === "open" || campaign.status === "proposed") && Date.parse(campaign.terms.lockTime) > Date.now();
  const available = (directory.data ?? []).filter((p) => !invited.has(p.party));

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/campaigns/${encodeURIComponent(campaign.campaignId)}/invitations`, { importers: selected }, newIdempotencyKey());
      setSelected([]);
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`Invited importers (${campaign.invitees.length})`}>
      {campaign.invitees.length === 0 ? (
        <p className="text-sm text-slate-600">Nobody invited yet. Each importer receives a private invitation; invitees never see each other.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {campaign.invitees.map((i) => (
            <li key={i.party} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{i.displayName}</span>
                <span className="block truncate text-xs text-slate-500" title={i.party}>
                  {shortParty(i.party)} · invited {relativeTime(i.invitedAt)}
                </span>
              </span>
              <ReservationStageBadge stage={i.stage} />
            </li>
          ))}
        </ul>
      )}
      {canInvite ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-ink">Invite importers</p>
          {campaign.status === "proposed" && <Notice>You can invite once the campaign is open (after Summertime accepts your bond).</Notice>}
          {directory.isPending ? (
            <p className="mt-2 text-sm text-slate-600">Loading importers…</p>
          ) : directory.isError ? (
            <InlineError error={directory.error} />
          ) : available.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Every importer in your directory has been invited.</p>
          ) : (
            <fieldset className="mt-2 grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Importers to invite</legend>
              {available.map((p) => {
                const value = p.handle ?? p.party;
                const checked = selected.includes(value);
                return (
                  <label
                    key={p.party}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${checked ? "border-accent bg-accent-soft" : "border-slate-200"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#b45309]"
                      checked={checked}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, value] : s.filter((x) => x !== value)))}
                    />
                    <span className="font-semibold text-ink">{p.displayName}</span>
                  </label>
                );
              })}
            </fieldset>
          )}
          <div className="mt-3 space-y-2">
            <InlineError error={error} />
            <Button onClick={invite} busy={busy} disabled={selected.length === 0 || campaign.status !== "open"}>
              Send {selected.length > 0 ? selected.length : ""} invitation{selected.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      ) : (
        campaign.status === "open" && (
          <p className="mt-3 text-xs text-slate-600">
            <Badge>Closed</Badge> The lock time has passed; no new invitations.
          </p>
        )
      )}
    </Card>
  );
}
