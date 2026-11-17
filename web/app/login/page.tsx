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
      <div className="mx-auto max-w-6xl border-x border-line px-4 pb-16 sm:px-6">
        <p className="label -mx-4 border-b border-line px-4 py-3 text-faint sm:-mx-6 sm:px-6">Demo · test USDCx only · no sign-up</p>
        <h1 className="display mt-10 text-5xl text-fg sm:text-7xl">Pick an account.</h1>
        <p className="mt-3 text-muted">Sign in as a forwarder, an importer or the operator.</p>
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
                    <h2 className="label flex items-center gap-2 text-fg">
                      <span className="grid h-3 w-3 place-items-center rounded-full border border-fg" aria-hidden="true">
                        <span className="h-1.5 w-1.5 rounded-full bg-fg" />
                      </span>
                      {ROLE_COPY[role].title}
                      <span className="text-faint">· {ROLE_COPY[role].body}</span>
                    </h2>
                    <ul className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((a) => (
                        <li key={a.handle}>
                          <button
                            type="button"
                            onClick={() => signIn(a.handle)}
                            disabled={pending !== null}
                            className="flex min-h-16 w-full items-center justify-between gap-3 bg-panel px-4 py-3 text-left hover:bg-page disabled:opacity-60"
                          >
                            <span>
                              <span className="block font-semibold text-fg">{a.displayName}</span>
                              <span className="block text-xs text-muted">@{a.handle}</span>
                            </span>
                            {pending === a.handle ? (
                              <Spinner />
                            ) : (
                              <span aria-hidden="true" className="grid h-8 w-8 place-items-center bg-fg text-page">
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
