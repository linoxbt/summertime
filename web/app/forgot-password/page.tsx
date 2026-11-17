"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SessionUser } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { homeFor } from "@/lib/session";
import { AuthField, AuthLayout, PasswordField } from "@/components/auth-layout";
import { Button, InlineError } from "@/components/ui";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/forgot", { email }, newIdempotencyKey());
      setStep("reset");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.post<SessionUser>("/auth/password/reset", { email, code, password }, newIdempotencyKey());
      qc.setQueryData(["session"], user);
      router.push(homeFor(user.role));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Reset password"
      title="Back on deck."
      below={
        <Link href="/login" className="font-medium text-link hover:underline">
          Back to sign in
        </Link>
      }
    >
      {step === "email" ? (
        <form onSubmit={requestCode} className="fade-in space-y-5" noValidate>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-fg">Reset your password</h2>
            <p className="mt-1 text-sm text-muted">We&apos;ll email you a 6-digit code.</p>
          </div>
          <AuthField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <InlineError error={error} />
          <Button type="submit" className="min-h-12 w-full text-base" busy={busy} disabled={!email.includes("@")}>
            Email me a code
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="fade-in space-y-5" noValidate>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-fg">Choose a new password</h2>
            <p className="mt-1 text-sm text-muted">
              If <span className="font-medium text-fg">{email}</span> has an account, a code is on its way. It expires in 15 minutes.
            </p>
          </div>
          <AuthField
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center font-mono text-2xl tracking-[0.5em]"
          />
          <PasswordField
            label="New password"
            name="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 10 characters"
          />
          <InlineError error={error} />
          <Button type="submit" className="min-h-12 w-full text-base" busy={busy} disabled={code.length !== 6 || password.length < 10}>
            Set password and sign in
          </Button>
          <p className="text-center text-sm">
            <button type="button" className="font-medium text-link hover:underline" onClick={() => void requestCode()}>
              Send another code
            </button>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
