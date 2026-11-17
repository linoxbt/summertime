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

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.post<SessionUser>("/auth/login", { email, password }, newIdempotencyKey());
      qc.setQueryData(["session"], user);
      router.push(homeFor(user.role));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Sign in"
      title="Welcome back."
      below={
        <>
          New to Summertime?{" "}
          <Link href="/signup" className="font-medium text-link hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="fade-in space-y-5" noValidate>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use the email and password for your account.</p>
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
        <div>
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-2 text-right text-sm">
            <Link href="/forgot-password" className="font-medium text-link hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
        <InlineError error={error} />
        <Button type="submit" className="min-h-12 w-full text-base" busy={busy} disabled={!email.includes("@") || password.length === 0}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
