"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { SessionUser } from "@summertime/ledger";
import { useSession, useSignOut } from "@/lib/session";
import { Button, ErrorState, LoadingState, cx } from "./ui";
import { Logo } from "./logo";

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
  const pathname = usePathname();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = user ? NAV[user.role] : [];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={user ? (nav[0]?.href ?? "/") : "/"} className="flex items-center gap-2" aria-label="Summertime home">
              <Logo />
            </Link>
            <DemoChip />
          </div>
          {user && (
            <>
              <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
                {nav.map((n) => (
                  <NavLink key={n.href} href={n.href} active={isActive(pathname, n.href)}>
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="hidden items-center gap-3 md:flex">
                <span className="text-right text-xs leading-tight">
                  <span className="block font-semibold text-fg">{user.displayName}</span>
                  <span className="capitalize text-muted">{user.role}</span>
                </span>
                <Button variant="secondary" onClick={signOut} className="min-h-9 px-3 py-1.5">
                  Sign out
                </Button>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-strong md:hidden"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="sr-only">Menu</span>
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M3 5h14v2H3zM3 9h14v2H3zM3 13h14v2H3z" />
                </svg>
              </button>
            </>
          )}
        </div>
        {user && menuOpen && (
          <nav id="mobile-nav" className="border-t border-line px-4 py-2 md:hidden" aria-label="Main">
            <p className="py-2 text-xs text-muted">
              Signed in as <span className="font-semibold text-fg">{user.displayName}</span> ({user.role})
            </p>
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className={cx("block rounded-lg px-3 py-3 text-sm font-semibold", isActive(pathname, n.href) ? "bg-panel-2 text-fg" : "text-muted")}
              >
                {n.label}
              </Link>
            ))}
            <button type="button" onClick={signOut} className="block w-full rounded-lg px-3 py-3 text-left text-sm font-semibold text-muted">
              Sign out
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

/** Demo environment marker (test USDCx only). */
export function DemoChip() {
  return (
    <span className="label hidden items-center gap-2 rounded border border-line-strong px-2 py-1 text-muted sm:inline-flex">
      <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
      Demo · test USDCx
    </span>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/forwarder") return pathname === "/forwarder" || pathname.startsWith("/forwarder/campaigns");
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx("rounded-md px-3 py-2 text-sm font-medium", active ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
    >
      {children}
    </Link>
  );
}
