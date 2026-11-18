"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationDto, NotificationList } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { Button, EmptyState, ErrorState, LoadingState, cx } from "./ui";

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationList>("/notifications"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api.post("/notifications/read", ids ? { ids } : {}, newIdempotencyKey()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** Bell in the app header with the unread count. */
export function NotificationBell() {
  const q = useNotifications();
  const unread = q.data?.unread ?? 0;
  return (
    <Link
      href="/notifications"
      className="relative grid h-10 w-10 flex-none place-items-center rounded-full border border-line-strong bg-panel text-fg transition-colors hover:border-fg hover:bg-white"
    >
      <span className="sr-only">Notifications</span>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
        <path d="M10 20a2.2 2.2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-fg px-1 text-[11px] font-semibold text-page ring-2 ring-page">
          <span className="sr-only">, </span>
          {unread > 9 ? "9+" : unread}
          <span className="sr-only"> unread</span>
        </span>
      )}
    </Link>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** The full list, newest first. Opening one marks it read. */
export function NotificationList() {
  const router = useRouter();
  const q = useNotifications();
  const mark = useMarkRead();
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { items, unread } = q.data;
  if (items.length === 0)
    return <EmptyState title="Nothing yet">Invitations, settlements, refunds and bookings will show up here.</EmptyState>;

  const open = (n: NotificationDto) => {
    if (!n.read) mark.mutate([n.id]);
    if (n.link) router.push(n.link);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{unread ? `${unread} unread` : "All caught up"}</p>
        {unread > 0 && (
          <Button variant="secondary" className="min-h-10" busy={mark.isPending} onClick={() => mark.mutate(undefined)}>
            Mark all read
          </Button>
        )}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel shadow-soft">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => open(n)}
              className={cx("flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-panel-2 sm:px-5", !n.read && "bg-page")}
            >
              <span className={cx("mt-1.5 h-2 w-2 flex-none rounded-full", n.read ? "bg-transparent" : "bg-fg")} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={cx("text-fg", n.read ? "font-medium" : "font-semibold")}>
                    {n.title}
                    {!n.read && <span className="sr-only"> (unread)</span>}
                  </span>
                  <span className="label text-faint">{when(n.createdAt)}</span>
                </span>
                <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
