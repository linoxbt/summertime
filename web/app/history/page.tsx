"use client";

import { AppShell } from "@/components/shell";
import { ReceiptsQuery } from "@/components/importer";
import { Card, PageHeader } from "@/components/ui";

export default function HistoryPage() {
  return (
    <AppShell role={["forwarder", "importer"]}>
      <PageHeader title="History" />
      <Card>
        <ReceiptsQuery />
      </Card>
    </AppShell>
  );
}
