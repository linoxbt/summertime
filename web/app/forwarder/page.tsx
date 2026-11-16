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
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
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
          <Link href="/forwarder/new" className="font-semibold text-accent hover:underline">
            Open your first campaign
          </Link>{" "}
          to start collecting private reservations.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {q.data.map((c) => (
            <li key={c.campaignId}>
              <Link
                href={`/forwarder/campaigns/${encodeURIComponent(c.campaignId)}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-accent sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{c.title}</p>
                    <p className="text-sm text-slate-600">{c.route ?? "Route not set"}</p>
                  </div>
                  <CampaignStatusBadge status={c.status} />
                </div>
                <div className="mt-4">
                  <CapacityBar
                    label={`${cbm(c.committed)} of ${cbm(c.terms.capacity)} CBM committed`}
                    committed={Number(c.committed.milliCbm)}
                    held={Number(c.held.milliCbm)}
                    threshold={Number(c.terms.threshold.milliCbm)}
                    capacity={Number(c.terms.capacity.milliCbm)}
                  />
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm tabular">
                    <span>
                      <span className="font-semibold text-ink">{cbm(c.committed)}</span> of {cbm(c.terms.capacity)} CBM committed · {c.committedCount} importer
                      {c.committedCount === 1 ? "" : "s"}
                    </span>
                    <span className="text-slate-600">
                      Threshold {cbm(c.terms.threshold)} CBM{c.thresholdMet ? " · met" : ""}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Deadline {formatDateTime(c.terms.deadline)} ({relativeTime(c.terms.deadline)})
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
