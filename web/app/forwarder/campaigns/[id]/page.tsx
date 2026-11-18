"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUsdc, type ForwarderCampaignDetail, type PartyRef } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { useAction } from "@/lib/action";
import { formatDateTime, relativeTime, shortParty, cbm } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { ForwarderAftercare } from "@/components/aftercare";
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
  Switch,
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
        <Link href="/forwarder" className="font-semibold text-link hover:underline">
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
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-panel px-4 text-sm font-semibold text-fg hover:bg-panel-2"
          >
            Export CSV
          </a>
        }
      />

      {c.outcome && (
        <Card className={c.outcome.result === "Succeeded" ? "mb-4 border-ok bg-ok-soft" : "mb-4"}>
          <h2 className="text-lg font-semibold text-fg">
            {c.outcome.result === "Succeeded"
              ? "Settled"
              : c.outcome.result === "Failed"
                ? "Did not fill"
                : "Cancelled"}
          </h2>
          {c.outcome.result === "Succeeded" && (
            <p className="mt-1 text-muted tabular">
              {c.outcome.legCount} importer{c.outcome.legCount === 1 ? "" : "s"} · {cbm(c.outcome.settled)} CBM · {c.outcome.settledAmount.display} USDCx
            </p>
          )}
          {c.outcome.result === "Failed" && (
            <p className="mt-1 text-muted">Funds released · bond shared</p>
          )}
          {c.outcome.updateId && (
            <div className="mt-3 text-sm">
              <span className="mr-2 font-semibold text-fg">Update ID</span>
              <CopyText value={c.outcome.updateId} label="update ID" />
            </div>
          )}
        </Card>
      )}

      {c.outcome?.result === "Succeeded" && <ForwarderAftercare campaign={c} onDone={refresh} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0 lg:grid-cols-3">
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
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
              <Legend className="bg-fg" label="Committed" />
              <Legend className="bg-line-strong" label="Reserved, not yet signed" />
              <Legend className="w-1 bg-amber" label="Threshold" />
            </div>
          </Card>

          <Card
            title={`Reservations (${c.reservations.length})`}
          >
            {c.reservations.length === 0 ? (
              <EmptyState title="No reservations yet" />
            ) : (
              <div className="-mx-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent sm:mx-0" tabIndex={0} role="region" aria-label="Reservations table (scrolls sideways)">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-line text-muted">
                    <tr>
                      <th className="px-4 py-2 font-semibold sm:px-2">Importer</th>
                      <th className="px-2 py-2 font-semibold">Stage</th>
                      <th className="px-2 py-2 text-right font-semibold">Reserved</th>
                      <th className="px-2 py-2 text-right font-semibold">Locked</th>
                      <th className="px-4 py-2 text-right font-semibold sm:px-2">Bonus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line tabular">
                    {c.reservations.map((r) => (
                      <tr key={r.contractId}>
                        <td className="px-4 py-2 sm:px-2">
                          <span className="font-semibold text-fg">{r.importer.displayName}</span>
                          <span className="block text-xs text-faint">{r.reservationId}</span>
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
              <p className="text-sm text-muted">Ended</p>
            ) : (
              <div className="space-y-3">
                <AutoSettle campaignId={c.campaignId} enabled={c.autoSettle} onDone={refresh} />
                <Button className="w-full" disabled={!c.canExecute} onClick={execute.openSheet}>
                  Settle now
                </Button>
                {!c.canExecute && c.executeBlockers.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
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
        title="Send bond"
        rows={[
          { label: "Bond", value: `${c.bond.amount.display} USDCx` },
          { label: "Held by", value: "Summertime" },
          { label: "If full", value: "Returned to you" },
          { label: "If not full", value: "Shared by importers" },
        ]}
        confirmLabel="Send bond"
        busy={bond.busy}
        error={bond.error}
        onConfirm={bond.run}
        onClose={bond.close}
      />
      <ConfirmSheet
        open={execute.open}
        title="Settle"
        rows={[
          { label: "Importers", value: String(committedRows.length) },
          { label: "Committed", value: `${cbm(c.committed)} CBM` },
          {
            label: "You receive",
            value: `${formatUsdc(committedRows.reduce((s, r) => s + BigInt(r.locked.micro), 0n))} USDCx`,
          },
          { label: "Deadline", value: formatDateTime(t.deadline) },
        ]}
        confirmLabel="Settle now"
        busy={execute.busy}
        error={execute.error}
        onConfirm={execute.run}
        onClose={execute.close}
      />
      <ConfirmSheet
        open={fail.open}
        title="Record failure"
        rows={[
          { label: "Committed", value: `${cbm(c.committed)} CBM` },
          { label: "Threshold", value: `${cbm(t.threshold)} CBM` },
          { label: "Bond shared", value: `${c.bond.amount.display} USDCx` },
          { label: "Claims until", value: formatDateTime(t.claimWindowEnd) },
        ]}
        confirmLabel="Record failure"
        tone="danger"
        busy={fail.busy}
        error={fail.error}
        onConfirm={fail.run}
        onClose={fail.close}
      />
      <ConfirmSheet
        open={cancel.open}
        title="Cancel campaign"
        rows={[
          { label: "Reserved capacity", value: `${cbm(c.held)} CBM` },
          { label: "Bond", value: `${c.bond.amount.display} USDCx returned` },
        ]}
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
      <p className="label text-faint">{label}</p>
      <p className="mt-1 font-semibold text-fg">{value}</p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function TimeValue({ iso }: { iso: string }) {
  return (
    <span>
      {formatDateTime(iso)} <span className="font-normal text-faint">({relativeTime(iso)})</span>
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
        <p className="text-sm text-muted">Nobody invited yet. Each importer receives a private invitation; invitees never see each other.</p>
      ) : (
        <ul className="divide-y divide-line">
          {campaign.invitees.map((i) => (
            <li key={i.party} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-fg">{i.displayName}</span>
                <span className="block truncate text-xs text-faint" title={i.party}>
                  {shortParty(i.party)} · invited {relativeTime(i.invitedAt)}
                </span>
              </span>
              <ReservationStageBadge stage={i.stage} />
            </li>
          ))}
        </ul>
      )}
      {canInvite ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-semibold text-fg">Invite importers</p>
          {campaign.status === "proposed" && <Notice>Opens once the bond is accepted</Notice>}
          {directory.isPending ? (
            <p className="mt-2 text-sm text-muted">Loading importers…</p>
          ) : directory.isError ? (
            <InlineError error={directory.error} />
          ) : available.length === 0 ? (
            <p className="mt-2 text-sm text-muted">All invited</p>
          ) : (
            <fieldset className="mt-2 grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Importers to invite</legend>
              {available.map((p) => {
                const value = p.handle ?? p.party;
                const checked = selected.includes(value);
                return (
                  <label
                    key={p.party}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${checked ? "border-fg bg-panel-2" : "border-line"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#0b0a09]"
                      checked={checked}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, value] : s.filter((x) => x !== value)))}
                    />
                    <span className="font-semibold text-fg">{p.displayName}</span>
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
          <p className="mt-3 text-xs text-muted">
            <Badge>Closed</Badge>
          </p>
        )
      )}
    </Card>
  );
}

function AutoSettle({ campaignId, enabled, onDone }: { campaignId: string; enabled: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [value, setValue] = useState(enabled);
  useEffect(() => setValue(enabled), [enabled]);
  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    setValue(next);
    try {
      await api.post(`/campaigns/${encodeURIComponent(campaignId)}/auto-settle`, { enabled: next }, newIdempotencyKey());
      onDone();
    } catch (e) {
      setValue(!next);
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 border-b border-line pb-3">
      <Switch checked={value} onChange={change} disabled={busy} label="Settle automatically" description="As soon as the threshold is met." />
      <InlineError error={error} />
    </div>
  );
}
