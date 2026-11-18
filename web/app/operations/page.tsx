"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactMessageDto, OpsStatus } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, ErrorState, InlineError, LoadingState, PageHeader } from "@/components/ui";

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
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Checks">
            {s.checks.length === 0 ? (
              <EmptyState title="No checks yet" />
            ) : (
              <ul className="divide-y divide-line">
                {s.checks.map((c) => (
                  <li key={c.name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">{LABELS[c.name] ?? c.name}</p>
                      <p className="text-sm text-muted">{c.summary}</p>
                      <p className="text-xs text-muted">Checked {relativeTime(c.checkedAt)}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Alert history">
            {s.alerts.length === 0 ? (
              <EmptyState title="No alerts" />
            ) : (
              <ul className="divide-y divide-line">
                {s.alerts.map((a) => (
                  <li key={a.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={a.severity} />
                      <span className="font-semibold text-fg">{LABELS[a.name] ?? a.name}</span>
                      {a.resolvedAt ? <Badge>Resolved</Badge> : <Badge tone="danger">Open</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{a.summary}</p>
                    <p className="text-xs text-muted">
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
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusBadge status={s.worker.status} />
              </dd>
              <dt className="text-muted">Last pass</dt>
              <dd className="font-semibold text-fg">{s.worker.lastPassAt ? relativeTime(s.worker.lastPassAt) : "never"}</dd>
              <dt className="text-muted">Ledger end</dt>
              <dd className="font-semibold text-fg">{s.worker.ledgerEnd ?? "unreachable"}</dd>
              <dt className="text-muted">Processed offset</dt>
              <dd className="font-semibold text-fg">{s.worker.offset ?? "—"}</dd>
              <dt className="text-muted">Lag</dt>
              <dd className="font-semibold text-fg">{lag === null ? "—" : `${lag} offset${lag === 1 ? "" : "s"}`}</dd>
            </dl>
          </Card>
          <Card title="Commands (24 hours)">
            <dl className="grid grid-cols-2 gap-y-2 text-sm tabular">
              <dt className="text-muted">Submitted</dt>
              <dd className="font-semibold text-fg">{s.commands.last24h}</dd>
              <dt className="text-muted">Rejected</dt>
              <dd className="font-semibold text-fg">{s.commands.failed24h}</dd>
            </dl>
          </Card>
        </div>
      </div>
      <div className="mt-4">
        <ContactMessages />
      </div>
    </>
  );
}

const TOPIC: Record<string, string> = { pilot: "Pilot", support: "Support", privacy: "Privacy", partnership: "Partnership", other: "Other" };

function ContactMessages() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["contact"], queryFn: () => api.get<ContactMessageDto[]>("/ops/contact"), refetchInterval: 30_000 });
  const done = useMutation({
    mutationFn: (id: string) => api.post(`/ops/contact/${id}/handled`, undefined, newIdempotencyKey()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact"] }),
  });
  const open = q.data?.filter((m) => !m.handled).length ?? 0;
  return (
    <Card title={`Contact messages${open ? ` · ${open} open` : ""}`}>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title="No messages yet" />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((m) => (
            <li key={m.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-fg">
                  {m.name}
                  {m.company ? <span className="font-normal text-muted"> · {m.company}</span> : null}
                </p>
                <span className="flex items-center gap-2">
                  <Badge tone={m.handled ? "neutral" : "accent"}>{m.handled ? "Handled" : TOPIC[m.topic] ?? m.topic}</Badge>
                  <span className="label text-faint">{relativeTime(m.createdAt)}</span>
                </span>
              </div>
              <a href={`mailto:${m.email}`} className="text-sm text-link hover:underline">
                {m.email}
              </a>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{m.message}</p>
              {!m.handled && (
                <Button variant="secondary" className="mt-3 min-h-10" busy={done.isPending && done.variables === m.id} onClick={() => done.mutate(m.id)}>
                  Mark handled
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <InlineError error={done.error} />
    </Card>
  );
}
