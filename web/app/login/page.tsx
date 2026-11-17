"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SessionUser } from "@summertime/ledger";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { homeFor, useSession } from "@/lib/session";
import { Eyebrow, PublicPage } from "@/components/public";
import { ContainerDrawing } from "@/components/drawings";
import { Button, InlineError, Spinner, cx, inputClass } from "@/components/ui";

interface DemoAccount {
  handle: string;
  displayName: string;
  role: SessionUser["role"];
  email: string | null;
}

interface CodeSent {
  sent: boolean;
  expiresInSeconds: number;
  accountExists: boolean;
  demoCode?: string;
}

type NewRole = "importer" | "forwarder";

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  forwarder: "Forwarder",
  importer: "Importer",
  operator: "Operator",
};

const RESEND_SECONDS = 30;

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();
  const accounts = useQuery({ queryKey: ["demo-accounts"], queryFn: () => api.get<DemoAccount[]>("/auth/demo-accounts"), retry: false });

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isNew, setIsNew] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<NewRole>("importer");
  const profileReady = !isNew || company.trim().length >= 2;
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.data) router.replace(homeFor(session.data.role));
  }, [session.data, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code" && !isNew) codeRef.current?.focus();
  }, [step, isNew]);

  function done(user: SessionUser) {
    qc.setQueryData(["session"], user);
    router.push(homeFor(user.role));
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy("send");
    setError(null);
    try {
      const r = await api.post<CodeSent>("/auth/code/start", { email }, newIdempotencyKey());
      setDemoCode(r.demoCode ?? null);
      setIsNew(!r.accountExists);
      setCode("");
      setStep("code");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function verify(value = code) {
    if (!/^\d{6}$/.test(value) || !profileReady) return;
    setBusy("verify");
    setError(null);
    try {
      const body = isNew ? { email, code: value, profile: { displayName: company.trim(), role } } : { email, code: value };
      done(await api.post<SessionUser>("/auth/code/verify", body, newIdempotencyKey()));
    } catch (err) {
      setError(err);
      setBusy(null);
      if (err instanceof ApiError && (err.code === "CODE_EXPIRED" || err.code === "TOO_MANY_ATTEMPTS")) setCode("");
    }
  }

  async function demoSignIn(handle: string) {
    setBusy(handle);
    setError(null);
    try {
      done(await api.post<SessionUser>("/auth/demo-login", { handle }, newIdempotencyKey()));
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  const demoAccounts = accounts.data ?? [];

  return (
    <PublicPage>
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)] border-x border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Brand side */}
        <section className="hidden flex-col justify-center gap-12 border-r border-line p-10 lg:flex">
          <div>
            <Eyebrow>Sign in</Eyebrow>
            <h1 className="display mt-6 text-7xl text-fg">Welcome aboard.</h1>
            <p className="mt-4 max-w-sm text-muted">Your bookings, your reservations, your settlements. One login.</p>
          </div>
          <div className="rounded-3xl border border-line bg-panel p-4 shadow-soft">
            <ContainerDrawing
              annotate={false}
              slots={[
                { id: "A", cbm: 14, mine: true },
                { id: "B", cbm: 9 },
                { id: "C", cbm: 12 },
                { id: "D", cbm: 8 },
                { id: "E", cbm: 6 },
              ]}
              capacity={60}
              threshold={48}
              label="A shared container with your space shown in black."
            />
          </div>
          <ul className="space-y-2 text-sm text-muted">
            {["Private reservations", "One settlement, only when full", "Refund + bonus if it doesn't fill"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-fg text-[10px] text-page" aria-hidden="true">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Form side */}
        <section className="flex min-w-0 items-start justify-center px-4 py-10 sm:px-8 lg:items-center lg:py-14">
          <div className="w-full max-w-md">
            <h1 className="display text-5xl text-fg lg:hidden">Welcome aboard.</h1>

            <div className="mt-6 rounded-3xl border border-line bg-panel p-6 shadow-lift sm:p-8 lg:mt-0">
              {step === "email" ? (
                <form onSubmit={sendCode} className="fade-in space-y-5" noValidate>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-fg">Sign in or create an account</h2>
                    <p className="mt-1 text-sm text-muted">We&apos;ll send you a 6-digit code. New emails get a new account.</p>
                  </div>
                  <label className="block">
                    <span className="label text-muted">Email</span>
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className={cx(inputClass, "mt-1.5 min-h-12 text-base")}
                    />
                  </label>
                  <InlineError error={error} />
                  <Button type="submit" className="min-h-12 w-full text-base" busy={busy === "send"} disabled={!email.includes("@")}>
                    Email me a code
                  </Button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void verify();
                  }}
                  className="fade-in space-y-5"
                  noValidate
                >
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-fg">{isNew ? "Create your account" : "Enter your code"}</h2>
                    <p className="mt-1 text-sm text-muted">
                      Sent to <span className="font-medium text-fg">{email}</span> ·{" "}
                      <button
                        type="button"
                        className="font-medium text-link hover:underline"
                        onClick={() => {
                          setStep("email");
                          setError(null);
                        }}
                      >
                        Change
                      </button>
                    </p>
                  </div>

                  {isNew && (
                    <div className="fade-in space-y-4 rounded-2xl bg-page p-4">
                      <label className="block">
                        <span className="label text-muted">Company name</span>
                        <input
                          name="company"
                          autoComplete="organization"
                          required
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          placeholder="Your company"
                          className={cx(inputClass, "mt-1.5 min-h-12 text-base")}
                          autoFocus
                        />
                      </label>
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
                    </div>
                  )}

                  {demoCode && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong bg-page px-4 py-3">
                      <div>
                        <p className="label text-faint">Demo · no email sent</p>
                        <p className="mt-0.5 font-mono text-lg tracking-[0.3em] text-fg">{demoCode}</p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-9 px-4"
                        onClick={() => {
                          setCode(demoCode);
                          if (profileReady) void verify(demoCode);
                        }}
                      >
                        Fill in
                      </Button>
                    </div>
                  )}

                  <label className="block">
                    <span className="label text-muted">6-digit code</span>
                    <input
                      ref={codeRef}
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      value={code}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setCode(v);
                        if (v.length === 6 && profileReady) void verify(v);
                      }}
                      placeholder="••••••"
                      className={cx(inputClass, "mt-1.5 min-h-14 text-center font-mono text-2xl tracking-[0.5em]")}
                    />
                  </label>
                  <InlineError error={error} />
                  <Button type="submit" className="min-h-12 w-full text-base" busy={busy === "verify"} disabled={code.length !== 6 || !profileReady}>
                    {isNew ? "Create account" : "Sign in"}
                  </Button>
                  <p className="text-center text-sm text-muted">
                    {cooldown > 0 ? (
                      <>Resend code in {cooldown}s</>
                    ) : (
                      <button type="button" className="font-medium text-link hover:underline" onClick={() => void sendCode()}>
                        Resend code
                      </button>
                    )}
                  </p>
                </form>
              )}
            </div>

            {demoAccounts.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                  <span className="label text-faint">Or skip with a demo account</span>
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                </div>
                <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel shadow-soft">
                  {demoAccounts.map((a) => (
                    <li key={a.handle}>
                      <button
                        type="button"
                        onClick={() => demoSignIn(a.handle)}
                        disabled={busy !== null}
                        className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/70 disabled:opacity-60"
                      >
                        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-panel-2 text-xs font-semibold text-fg" aria-hidden="true">
                          {initials(a.displayName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">{a.displayName}</span>
                          <span className="block truncate font-mono text-xs text-faint">{a.email ?? `@${a.handle}`}</span>
                        </span>
                        <span className="label flex-none rounded-full border border-line-strong px-2 py-0.5 text-muted">{ROLE_LABEL[a.role]}</span>
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
              </div>
            )}
          </div>
        </section>
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
