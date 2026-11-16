"use client";

import { AppShell } from "@/components/shell";
import { ReceiptsQuery } from "@/components/importer";
import { Card, PageHeader } from "@/components/ui";

export default function HistoryPage() {
  return (
    <AppShell role={["forwarder", "importer"]}>
      <PageHeader title="History" subtitle="Receipts visible to your party, read from your own ledger view." />
      <Card>
        <p className="mb-3 text-sm text-slate-600">
          Every receipt carries the update ID of the ledger transaction it records, which you can look up in your own ledger view.
        </p>
        <ReceiptsQuery />
      </Card>
    </AppShell>
  );
}
