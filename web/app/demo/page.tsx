"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { homeFor } from "@/lib/session";
import { Eyebrow, PublicPage } from "@/components/public";
import { EmptyState, ErrorState, InlineError, LoadingState, Spinner } from "@/components/ui";

interface DemoAccount {
  handle: string;
  displayName: string;
  role: SessionUser["role"];
  email: string | null;
}

const ROLES: { role: SessionUser["role"]; title: string; note: string }[] = [
  { role: "forwarder", title: "Forwarder", note: "Open a campaign, invite importers, settle" },
  { role: "importer", title: "Importers", note: "Reserve space privately, sign, claim" },
  { role: "operator", title: "Summertime operator", note: "Operations and the privacy explorer" },
];

/** The demo entrance: sample accounts and test USDCx, kept apart from real accounts. */
export default function DemoPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["demo-accounts"], queryFn: () => api.get<DemoAccount[]>("/auth/demo-accounts"), retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function enter(handle: string) {
    setBusy(handle);
    setError(null);
    try {
      const user = await api.post<SessionUser>("/auth/demo-login", { handle }, newIdempotencyKey());
      qc.setQueryData(["session"], user);
      router.push(homeFor(user.role));
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  return (
    <PublicPage>
      <div className="mx-auto w-full max-w-6xl flex-1 border-x border-line">
        <div className="grid gap-6 border-b border-line px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr] md:items-end">
          <div>
            <Eyebrow>Demo</Eyebrow>
            <h1 className="display mt-6 text-5xl text-fg sm:text-7xl">Try it as anyone.</h1>
          </div>
          <div className="rounded-2xl border border-dashed border-line-strong bg-panel px-5 py-4 text-sm text-muted">
            <p className="font-medium text-fg">Sample accounts, test USDCx.</p>
            <p className="mt-1">
              Separate from real accounts. Want your own?{" "}
              <Link href="/signup" className="font-medium text-link hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <div className="space-y-8 px-4 py-8 sm:px-6">
          <InlineError error={error} />
          {accounts.isPending ? (
            <LoadingState label="Loading demo accounts…" />
          ) : accounts.isError ? (
            <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
          ) : accounts.data.length === 0 ? (
            <EmptyState title="The demo isn't available right now" />
          ) : (
            ROLES.map(({ role, title, note }) => {
              const list = accounts.data.filter((a) => a.role === role);
              if (list.length === 0) return null;
              return (
                <section key={role}>
                  <h2 className="label flex flex-wrap items-center gap-2 text-fg">
                    {title}
                    <span className="text-faint">· {note}</span>
                  </h2>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((a) => (
                      <li key={a.handle}>
                        <button
                          type="button"
                          onClick={() => enter(a.handle)}
                          disabled={busy !== null}
                          className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 text-left shadow-soft hover:border-line-strong hover:bg-white disabled:opacity-60"
                        >
                          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-panel-2 text-xs font-semibold text-fg" aria-hidden="true">
                            {initials(a.displayName)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-fg">{a.displayName}</span>
                            <span className="block truncate text-xs text-faint">Demo {a.role}</span>
                          </span>
                          {busy === a.handle ? (
                            <Spinner className="h-4 w-4 flex-none" />
                          ) : (
                            <span aria-hidden="true" className="flex-none text-faint transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-fg">
                              →
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>
    </PublicPage>
  );
}

function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
