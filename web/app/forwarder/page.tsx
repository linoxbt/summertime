"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ForwarderCampaignSummary } from "@summertime/ledger";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime, cbm } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { CampaignStatusBadge } from "@/components/status";
import { CapacityBar, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";

export default function ForwarderHome() {
  return (
    <AppShell role="forwarder">
      <CampaignList />
    </AppShell>
  );
}

function CampaignList() {
  const q = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get<ForwarderCampaignSummary[]>("/campaigns"),
    refetchInterval: 5000,
  });
  return (
    <>
      <PageHeader
        title="Campaigns"
        action={
          <Link
            href="/forwarder/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 bg-fg px-4 text-sm font-medium text-page hover:bg-accent-strong"
          >
            New campaign
          </Link>
        }
      />
      {q.isPending ? (
        <LoadingState label="Loading campaigns…" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title="No campaigns yet">
          <Link href="/forwarder/new" className="font-semibold text-link hover:underline">
            New campaign
          </Link>
        </EmptyState>
      ) : (
        <div className="overflow-hidden border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="label flex items-center gap-3 text-fg">
              <span className="grid h-3 w-3 place-items-center rounded-full border border-fg" aria-hidden="true">
                <span className="h-1.5 w-1.5 rounded-full bg-fg" />
              </span>
              Your sailings
            </span>
            <span className="label text-faint">{q.data.length} campaign{q.data.length === 1 ? "" : "s"}</span>
          </div>
          <div className="label hidden grid-cols-[1.6fr_1.4fr_0.7fr_1.1fr_0.9fr] gap-4 border-b border-line px-4 py-2 text-faint md:grid">
            <span>Campaign</span>
            <span>Filled</span>
            <span>Importers</span>
            <span>Deadline</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-line">
            {q.data.map((c) => (
              <li key={c.campaignId}>
                <Link
                  href={`/forwarder/campaigns/${encodeURIComponent(c.campaignId)}`}
                  className="grid gap-3 px-4 py-4 hover:bg-page md:grid-cols-[1.6fr_1.4fr_0.7fr_1.1fr_0.9fr] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-fg">{c.title}</span>
                    <span className="label block truncate text-faint">{c.route ?? c.campaignId}</span>
                  </span>
                  <span>
                    <CapacityBar
                      label={`${cbm(c.committed)} of ${cbm(c.terms.capacity)} CBM committed`}
                      committed={Number(c.committed.milliCbm)}
                      held={Number(c.held.milliCbm)}
                      threshold={Number(c.terms.threshold.milliCbm)}
                      capacity={Number(c.terms.capacity.milliCbm)}
                    />
                    <span className="mt-1.5 block text-sm text-fg tabular">
                      {cbm(c.committed)} <span className="text-faint">/ {cbm(c.terms.capacity)} CBM</span>
                    </span>
                  </span>
                  <span className="text-sm text-fg tabular">
                    <span className="label mr-2 text-faint md:hidden">Importers</span>
                    {c.committedCount}
                  </span>
                  <span className="text-sm text-muted">
                    <span className="label mr-2 text-faint md:hidden">Deadline</span>
                    {formatDateTime(c.terms.deadline)}
                    <span className="block text-xs text-faint">{relativeTime(c.terms.deadline)}</span>
                  </span>
                  <span className="md:text-right">
                    <CampaignStatusBadge status={c.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
