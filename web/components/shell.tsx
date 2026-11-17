"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { SessionUser } from "@summertime/ledger";
import { useSession, useSignOut } from "@/lib/session";
import { Button, ErrorState, LoadingState } from "./ui";
import { Logo } from "./logo";
import { Menu } from "./menu";

const NAV: Record<SessionUser["role"], { href: string; label: string }[]> = {
  forwarder: [
    { href: "/forwarder", label: "Campaigns" },
    { href: "/forwarder/new", label: "New campaign" },
    { href: "/history", label: "History" },
    { href: "/explorer", label: "Privacy explorer" },
  ],
  importer: [
    { href: "/importer", label: "My space" },
    { href: "/history", label: "History" },
    { href: "/explorer", label: "Privacy explorer" },
  ],
  operator: [
    { href: "/operations", label: "Operations" },
    { href: "/explorer", label: "Privacy explorer" },
  ],
};

/** Authenticated shell: requires a session, optionally a role. */
export function AppShell({ children, role }: { children: ReactNode; role?: SessionUser["role"] | SessionUser["role"][] }) {
  const session = useSession();
  const router = useRouter();
  const user = session.data;

  useEffect(() => {
    if (session.isSuccess && !user) router.replace("/login");
  }, [session.isSuccess, user, router]);

  if (session.isPending)
    return (
      <Frame>
        <LoadingState label="Checking your session…" />
      </Frame>
    );
  if (session.isError)
    return (
      <Frame>
        <ErrorState error={session.error} onRetry={() => session.refetch()} />
      </Frame>
    );
  if (!user)
    return (
      <Frame>
        <LoadingState label="Redirecting to sign in…" />
      </Frame>
    );

  const allowed = role === undefined || (Array.isArray(role) ? role.includes(user.role) : role === user.role);
  return (
    <Frame user={user}>
      {allowed ? (
        children
      ) : (
        <ErrorState
          error={new Error(`This page is for ${Array.isArray(role) ? role.join(" or ") : role} accounts. You are signed in as ${user.displayName}.`)}
        />
      )}
    </Frame>
  );
}

function Frame({ user, children }: { user?: SessionUser; children: ReactNode }) {
  const signOut = useSignOut();
  const items = user ? [...NAV[user.role], { href: "/privacy", label: "Trust model" }, { href: "/", label: "Home" }] : [];
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur">
        <div className="relative">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-x border-line px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href={user ? (NAV[user.role][0]?.href ?? "/") : "/"} className="flex items-center gap-2">
                <Logo />
              </Link>
              <DemoChip />
            </div>
            {user && (
              <div className="flex items-center gap-3">
                <span className="hidden text-right text-xs leading-tight sm:block">
                  <span className="block font-semibold text-fg">{user.displayName}</span>
                  <span className="label text-faint">{user.role}</span>
                </span>
                <Menu
                  items={items}
                  footer={
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm text-muted">
                        Signed in as <span className="font-semibold text-fg">{user.displayName}</span> · <span className="label">{user.role}</span>
                      </span>
                      <Button variant="secondary" onClick={signOut} className="min-h-10">
                        Sign out
                      </Button>
                    </div>
                  }
                />
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 border-x border-line px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

/** Demo environment marker (test USDCx only). */
export function DemoChip() {
  return (
    <span className="label hidden items-center gap-2 border border-line-strong px-2 py-1 text-muted sm:inline-flex">
      <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
      Demo · test USDCx
    </span>
  );
}

