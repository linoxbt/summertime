"use client";

import { useQuery } from "@tanstack/react-query";
import type { OpsStatus } from "@summertime/ledger";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";

export default function OperationsPage() {
  return (
    <AppShell role="operator">
      <Operations />
    </AppShell>
  );
}

const LABELS: Record<string, string> = {
  bond_custody: "Bond custody reconciliation",
  lock_overdue: "Bond locks on time",
  payouts_unpaid: "Bonus payouts",
  settle_reminder: "Full campaigns near deadline",
  execute_failures: "Settlement submissions",
  registry_latency: "Token registry",
  outcomes_recorded: "Outcomes recorded",
};

function StatusBadge({ status }: { status: "ok" | "warn" | "alert" }) {
  if (status === "ok") return <Badge tone="success">OK</Badge>;
  if (status === "warn") return <Badge tone="accent">Attention</Badge>;
  return <Badge tone="danger">Alert</Badge>;
}

function Operations() {
  const q = useQuery({ queryKey: ["ops"], queryFn: () => api.get<OpsStatus>("/ops/status"), refetchInterval: 5000 });
  if (q.isPending) return <LoadingState label="Loading operational status…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const lag = s.worker.ledgerEnd !== null && s.worker.offset !== null ? s.worker.ledgerEnd - s.worker.offset : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Operations <StatusBadge status={s.overall} />
          </span>
        }
        subtitle="Summertime's automation, custody and settlement health. Checks run every minute."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Checks">
            {s.checks.length === 0 ? (
              <EmptyState title="No checks yet">The worker records its first checks within a minute of starting.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {s.checks.map((c) => (
                  <li key={c.name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{LABELS[c.name] ?? c.name}</p>
                      <p className="text-sm text-slate-700">{c.summary}</p>
                      <p className="text-xs text-slate-600">Checked {relativeTime(c.checkedAt)}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Alert history">
            {s.alerts.length === 0 ? (
              <EmptyState title="No alerts">Nothing has needed attention.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {s.alerts.map((a) => (
                  <li key={a.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={a.severity} />
                      <span className="font-semibold text-ink">{LABELS[a.name] ?? a.name}</span>
                      {a.resolvedAt ? <Badge>Resolved</Badge> : <Badge tone="danger">Open</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{a.summary}</p>
                    <p className="text-xs text-slate-600">
                      Raised {formatDateTime(a.raisedAt)}
                      {a.resolvedAt ? ` · resolved ${formatDateTime(a.resolvedAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Worker">
            <dl className="grid grid-cols-2 gap-y-2 text-sm tabular">
              <dt className="text-slate-600">Status</dt>
              <dd>
                <StatusBadge status={s.worker.status} />
              </dd>
              <dt className="text-slate-600">Last pass</dt>
              <dd className="font-semibold text-ink">{s.worker.lastPassAt ? relativeTime(s.worker.lastPassAt) : "never"}</dd>
              <dt className="text-slate-600">Ledger end</dt>
              <dd className="font-semibold text-ink">{s.worker.ledgerEnd ?? "unreachable"}</dd>
              <dt className="text-slate-600">Processed offset</dt>
              <dd className="font-semibold text-ink">{s.worker.offset ?? "—"}</dd>
              <dt className="text-slate-600">Lag</dt>
              <dd className="font-semibold text-ink">{lag === null ? "—" : `${lag} offset${lag === 1 ? "" : "s"}`}</dd>
            </dl>
          </Card>
          <Card title="Commands (24 hours)">
            <dl className="grid grid-cols-2 gap-y-2 text-sm tabular">
              <dt className="text-slate-600">Submitted</dt>
              <dd className="font-semibold text-ink">{s.commands.last24h}</dd>
              <dt className="text-slate-600">Rejected</dt>
              <dd className="font-semibold text-ink">{s.commands.failed24h}</dd>
            </dl>
            <p className="mt-2 text-xs text-slate-600">Rejections include expected business outcomes, such as requests rejected because a container is full.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
