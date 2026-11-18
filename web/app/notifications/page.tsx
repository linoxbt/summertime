"use client";

import { AppShell } from "@/components/shell";
import { NotificationList } from "@/components/notifications";
import { PageHeader } from "@/components/ui";

export default function NotificationsPage() {
  return (
    <AppShell>
      <PageHeader title="Notifications" />
      <NotificationList />
    </AppShell>
  );
}
