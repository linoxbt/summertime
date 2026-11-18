"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { InvitationDto, PositionDto } from "@summertime/ledger";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime, cbm } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { useSession } from "@/lib/session";
import { BalanceChip } from "@/components/importer";
import { PositionStageBadge } from "@/components/status";
import { EmptyState, ErrorState, LoadingState, PageHeader, PrivacyLine } from "@/components/ui";

export default function ImporterHome() {
  return (
    <AppShell role="importer">
      <PageHeader title="My space" subtitle={<PrivacyLine />} action={<BalanceChip />} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 [&>*]:min-w-0 lg:grid-cols-2">
        <Invitations />
        <Positions />
      </div>
    </AppShell>
  );
}

function Invitations() {
  const user = useSession().data;
  const q = useQuery({ queryKey: ["invitations"], queryFn: () => api.get<InvitationDto[]>("/invitations"), refetchInterval: 5000 });
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-fg">Invitations</h2>
      {q.isPending ? (
        <LoadingState label="Loading invitations…" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title="Waiting for an invitation">
          Forwarders invite you to their containers. Tell your forwarder your company name, <span className="font-medium text-fg">{user?.displayName}</span>, so they can find you.
          You&apos;ll be notified when an invitation arrives.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {q.data.map((i) => (
            <li key={i.contractId}>
              <Link
                href={`/importer/invitations/${encodeURIComponent(i.contractId)}`}
                className="block rounded-xl border border-line bg-panel p-4 hover:border-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{i.title}</p>
                    <p className="text-sm text-muted">
                      {i.forwarder.displayName}
                      {i.route ? ` · ${i.route}` : ""}
                    </p>
                  </div>
                  <span className="text-link" aria-hidden="true">
                    →
                  </span>
                </div>
                <p className="mt-2 text-sm tabular text-muted">
                  {i.terms.ratePerCbm.display} USDCx per CBM · {cbm(i.terms.minReservation)}–{cbm(i.terms.maxReservation)} CBM
                </p>
                <p className="mt-1 text-xs text-muted">
                  Reserve by {formatDateTime(i.expiresAt)} ({relativeTime(i.expiresAt)})
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Positions() {
  const q = useQuery({ queryKey: ["positions"], queryFn: () => api.get<PositionDto[]>("/positions"), refetchInterval: 4000 });
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-fg">My containers</h2>
      {q.isPending ? (
        <LoadingState label="Loading your reservations…" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title="Nothing reserved yet" />
      ) : (
        <ul className="space-y-3">
          {q.data.map((p) => (
            <li key={p.campaignId}>
              <Link
                href={`/importer/campaigns/${encodeURIComponent(p.campaignId)}`}
                className="block rounded-xl border border-line bg-panel p-4 hover:border-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{p.title}</p>
                    <p className="text-sm text-muted">{p.forwarder.displayName}</p>
                  </div>
                  <PositionStageBadge stage={p.stage} />
                </div>
                {p.reserved && p.locked && p.reserved.milliCbm !== "0" && (
                  <p className="mt-2 text-sm font-semibold text-fg tabular">
                    {cbm(p.reserved)} CBM · {p.locked.display} USDCx
                  </p>
                )}
                {p.bonus && <p className="text-sm text-link tabular">Bonus {p.bonus.display} USDCx</p>}
                <p className="mt-1 text-xs text-muted">Deadline {formatDateTime(p.terms.deadline)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
