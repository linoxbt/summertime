"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ExplorerPane, SessionUser } from "@summertime/ledger";
import { api } from "@/lib/api";
import { shortId, shortParty } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, Spinner, inputClass } from "@/components/ui";

interface DemoAccount {
  handle: string;
  displayName: string;
  role: SessionUser["role"];
}

export default function ExplorerPage() {
  return (
    <AppShell>
      <Explorer />
    </AppShell>
  );
}

function Explorer() {
  const campaigns = useQuery({
    queryKey: ["explorer-campaigns"],
    queryFn: () => api.get<{ campaignId: string; title: string }[]>("/explorer/campaigns"),
    refetchInterval: 10000,
  });
  const accounts = useQuery({ queryKey: ["demo-accounts"], queryFn: () => api.get<DemoAccount[]>("/auth/demo-accounts") });
  const [campaignId, setCampaignId] = useState<string>("");
  const importers = useMemo(() => (accounts.data ?? []).filter((a) => a.role === "importer"), [accounts.data]);
  const forwarder = (accounts.data ?? []).find((a) => a.role === "forwarder");
  const operator = (accounts.data ?? []).find((a) => a.role === "operator");
  const [importerA, setImporterA] = useState("");
  const [importerB, setImporterB] = useState("");

  useEffect(() => {
    if (!campaignId && campaigns.data?.[0]) setCampaignId(campaigns.data[0].campaignId);
  }, [campaigns.data, campaignId]);
  useEffect(() => {
    if (!importerA && importers[0]) setImporterA(importers[0].handle);
    if (!importerB && importers[1]) setImporterB(importers[1].handle);
  }, [importers, importerA, importerB]);

  return (
    <>
      <PageHeader
        title="Privacy explorer"
        subtitle="Each pane is that party's own ledger view"
      />
      {campaigns.isPending || accounts.isPending ? (
        <LoadingState label="Loading campaigns…" />
      ) : campaigns.isError ? (
        <ErrorState error={campaigns.error} onRetry={() => campaigns.refetch()} />
      ) : accounts.isError ? (
        <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
      ) : campaigns.data.length === 0 ? (
        <EmptyState title="No campaigns yet" />
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-ink">Campaign</span>
              <select className={`${inputClass} mt-1`} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                {campaigns.data.map((c) => (
                  <option key={c.campaignId} value={c.campaignId}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <ImporterSelect label="Importer pane 1" value={importerA} onChange={setImporterA} options={importers} />
            <ImporterSelect label="Importer pane 2" value={importerB} onChange={setImporterB} options={importers} />
          </div>
          {campaignId && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {forwarder && <Pane campaignId={campaignId} handle={forwarder.handle} />}
              {importerA && <Pane campaignId={campaignId} handle={importerA} />}
              {importerB && <Pane campaignId={campaignId} handle={importerB} />}
              {operator && <Pane campaignId={campaignId} handle={operator.handle} />}
            </div>
          )}
        </>
      )}
    </>
  );
}

function ImporterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: DemoAccount[] }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <select className={`${inputClass} mt-1`} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.handle} value={o.handle}>
            {o.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function Pane({ campaignId, handle }: { campaignId: string; handle: string }) {
  const q = useQuery({
    queryKey: ["explorer", campaignId, handle],
    queryFn: () => api.get<ExplorerPane>(`/explorer/${encodeURIComponent(campaignId)}?as=${encodeURIComponent(handle)}`),
    refetchInterval: 4000,
  });
  return (
    <section className="flex min-h-64 flex-col rounded-xl border border-slate-200 bg-white" aria-label={`Ledger view of ${handle}`}>
      <header className="border-b border-slate-200 px-4 py-3">
        {q.data ? (
          <>
            <p className="font-semibold text-ink">{q.data.viewer.displayName}</p>
            <p className="flex items-center gap-2 text-xs text-slate-600">
              <Badge>{q.data.viewer.role}</Badge>
              <span className="truncate font-mono" title={q.data.viewer.party}>
                {shortParty(q.data.viewer.party)}
              </span>
            </p>
          </>
        ) : (
          <p className="font-semibold text-ink">@{handle}</p>
        )}
      </header>
      <div className="flex-1 p-3">
        {q.isPending ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Spinner className="h-4 w-4" /> Reading ledger view…
          </p>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.contracts.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 p-4 text-center">
            <p className="font-semibold text-ink">Nothing visible to this party</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {q.data.contracts.map((c) => (
              <li key={c.contractId} className="rounded-lg border border-slate-200 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{c.template}</span>
                  <span className="font-mono text-slate-500" title={c.contractId}>
                    {shortId(c.contractId, 6)}
                  </span>
                </div>
                {Object.keys(c.summary).length > 0 && (
                  <dl className="mt-2 space-y-0.5">
                    {Object.entries(c.summary).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-slate-600">{k}</dt>
                        <dd className="truncate text-right font-medium text-ink tabular" title={v}>
                          {v.includes("::") ? shortParty(v) : v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="mt-2 text-slate-600">
                  <span className="font-semibold">Signed by</span> {c.signatories.map(shortParty).join(", ")}
                  {c.observers.length > 0 && (
                    <>
                      {" "}
                      · <span className="font-semibold">Observers</span> {c.observers.map(shortParty).join(", ")}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
