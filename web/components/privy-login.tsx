"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SessionUser } from "@summertime/ledger";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { homeFor } from "@/lib/session";
import { PRIVY_APP_ID } from "@/lib/privy";
import { AuthField } from "./auth-layout";
import { Button, InlineError, Spinner, cx } from "./ui";

type Role = "importer" | "forwarder";

/** Google appears as soon as it is switched on in the Privy dashboard (read from Privy's public app settings). */
function useGoogleEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(PRIVY_APP_ID)}`, { headers: { "privy-app-id": PRIVY_APP_ID } })
      .then((r) => (r.ok ? r.json() : null))
      .then((app: { google_oauth?: boolean } | null) => live && setOn(Boolean(app?.google_oauth)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return on;
}

/**
 * Sign in or sign up with Privy (email code, and Google when it is enabled in Privy). After Privy signs the person in, its
 * tokens are exchanged for a Summertime session; a new person adds company and role once.
 */
export function PrivyLogin({ title, intro }: { title: string; intro: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [stage, setStage] = useState<"start" | "exchanging" | "profile">("start");
  const [error, setError] = useState<unknown>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<Role>("importer");
  const started = useRef(false);
  const [stalled, setStalled] = useState(false);
  const google = useGoogleEnabled();

  // If Privy never becomes ready (blocked network, wrong app ID or origin), say so.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setStalled(true), 10_000);
    return () => clearTimeout(t);
  }, [ready]);

  async function exchange(profile?: { displayName: string; role: Role }) {
    setStage("exchanging");
    setError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new ApiError("PRIVY_TOKEN_INVALID", "We couldn't confirm your sign-in. Please try again.", 401);
      const session = await api.post<SessionUser>(
        "/auth/privy",
        { accessToken, identityToken: identityToken ?? undefined, ...(profile ? { profile } : {}) },
        newIdempotencyKey(),
      );
      qc.setQueryData(["session"], session);
      router.push(homeFor(session.role));
    } catch (e) {
      if (e instanceof ApiError && e.code === "PROFILE_REQUIRED") {
        setStage("profile");
      } else {
        setError(e);
        setStage(profile ? "profile" : "start");
      }
    }
  }

  // Once Privy has signed the person in, exchange its tokens (waiting briefly for the
  // identity token, which carries the verified email).
  useEffect(() => {
    if (!ready || !authenticated || started.current) return;
    if (identityToken) {
      started.current = true;
      void exchange();
      return;
    }
    const t = setTimeout(() => {
      if (!started.current) {
        started.current = true;
        void exchange();
      }
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, identityToken]);

  async function startOver() {
    started.current = false;
    setError(null);
    setStage("start");
    await logout();
  }

  const email = user?.email?.address ?? user?.google?.email ?? null;

  if (stage === "profile") {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      void exchange({ displayName: company.trim(), role });
    };
    return (
      <form onSubmit={submit} className="fade-in space-y-5" noValidate>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">Set up your account</h2>
          <p className="mt-1 text-sm text-muted">{email ? <>Signed in as <span className="font-medium text-fg">{email}</span>. One more step.</> : "One more step."}</p>
        </div>
        <fieldset>
          <legend className="label text-muted">I am</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-full bg-panel-2 p-1">
            {(["importer", "forwarder"] as const).map((r) => (
              <label
                key={r}
                className={cx(
                  "flex min-h-10 cursor-pointer items-center justify-center rounded-full text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-link",
                  role === r ? "bg-fg text-page shadow-soft" : "text-muted hover:text-fg",
                )}
              >
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                {r === "importer" ? "An importer" : "A forwarder"}
              </label>
            ))}
          </div>
        </fieldset>
        <AuthField
          label="Company name"
          name="company"
          autoComplete="organization"
          required
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Your company"
        />
        <InlineError error={error} />
        <Button type="submit" className="min-h-12 w-full text-base" disabled={company.trim().length < 2}>
          Create account
        </Button>
        <p className="text-center text-sm">
          <button type="button" className="font-medium text-link hover:underline" onClick={() => void startOver()}>
            Use a different account
          </button>
        </p>
      </form>
    );
  }

  if (!ready && stalled)
    return (
      <div className="fade-in space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-fg">{title}</h2>
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
          Sign-in isn&apos;t available right now. Please try again in a few minutes.
        </p>
      </div>
    );

  const busy = !ready || stage === "exchanging" || (authenticated && !error);
  return (
    <div className="fade-in space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-fg">{title}</h2>
        <p className="mt-1 text-sm text-muted">{intro}</p>
      </div>
      <InlineError error={error} />
      {busy ? (
        <p role="status" className="flex min-h-12 items-center justify-center gap-3 rounded-full bg-panel-2 text-sm text-muted">
          <Spinner className="h-4 w-4" /> {ready ? "Signing you in…" : "Loading…"}
        </p>
      ) : (
        <Button type="button" className="min-h-12 w-full text-base" onClick={() => (authenticated ? void exchange() : login({ loginMethods: google ? ["email", "google"] : ["email"] }))}>
          {google ? "Continue with email or Google" : "Continue with email"}
        </Button>
      )}
      {error && authenticated ? (
        <p className="text-center text-sm">
          <button type="button" className="font-medium text-link hover:underline" onClick={() => void startOver()}>
            Start over
          </button>
        </p>
      ) : null}
      <p className="label text-center text-faint">{google ? "Email code or Google" : "Email code"} · secured by Privy</p>
    </div>
  );
}
