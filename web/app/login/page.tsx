"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { homeFor, useSession } from "@/lib/session";
import { PublicPage } from "@/components/public";
import { EmptyState, ErrorState, InlineError, LoadingState, Spinner } from "@/components/ui";

interface DemoAccount {
  handle: string;
  displayName: string;
  role: SessionUser["role"];
}

const ROLE_COPY: Record<SessionUser["role"], { title: string; body: string }> = {
  forwarder: { title: "Forwarders", body: "Campaigns, bonds, settlement" },
  importer: { title: "Importers", body: "Reserve, sign, claim" },
  operator: { title: "Summertime operator", body: "Operations, privacy explorer" },
};

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();
  const accounts = useQuery({ queryKey: ["demo-accounts"], queryFn: () => api.get<DemoAccount[]>("/auth/demo-accounts") });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (session.data) router.replace(homeFor(session.data.role));
  }, [session.data, router]);

  async function signIn(handle: string) {
    setPending(handle);
    setError(null);
    try {
      const user = await api.post<SessionUser>("/auth/demo-login", { handle }, newIdempotencyKey());
      qc.setQueryData(["session"], user);
      router.push(homeFor(user.role));
    } catch (e) {
      setError(e);
      setPending(null);
    }
  }

  const roles: SessionUser["role"][] = ["forwarder", "importer", "operator"];
  return (
    <PublicPage>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <h1 className="text-4xl font-semibold tracking-tight text-fg">Sign in to the demo</h1>
        <p className="mt-2 text-muted">Pick an account · test USDCx only</p>
        <div className="mt-6">
          <InlineError error={error} />
        </div>
        <div className="mt-4">
          {accounts.isPending ? (
            <LoadingState label="Loading demo accounts…" />
          ) : accounts.isError ? (
            <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
          ) : accounts.data.length === 0 ? (
            <EmptyState title="No demo accounts yet" />
          ) : (
            <div className="space-y-8">
              {roles.map((role) => {
                const list = accounts.data.filter((a) => a.role === role);
                if (list.length === 0) return null;
                return (
                  <section key={role}>
                    <h2 className="label flex items-center gap-3 text-fg">
                      <span className="h-2 w-2 rounded-[2px] bg-amber" aria-hidden="true" />
                      {ROLE_COPY[role].title}
                      <span className="text-faint">· {ROLE_COPY[role].body}</span>
                    </h2>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((a) => (
                        <li key={a.handle}>
                          <button
                            type="button"
                            onClick={() => signIn(a.handle)}
                            disabled={pending !== null}
                            className="flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel/70 px-4 py-3 text-left hover:border-link disabled:opacity-60"
                          >
                            <span>
                              <span className="block font-semibold text-fg">{a.displayName}</span>
                              <span className="block text-xs text-muted">@{a.handle}</span>
                            </span>
                            {pending === a.handle ? (
                              <Spinner />
                            ) : (
                              <span aria-hidden="true" className="text-link">
                                →
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PublicPage>
  );
}
