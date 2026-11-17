"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SessionUser } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { homeFor } from "@/lib/session";
import { AuthField, AuthLayout, PasswordField } from "@/components/auth-layout";
import { PrivyLogin } from "@/components/privy-login";
import { privyEnabled } from "@/lib/privy";
import { Button, InlineError, cx } from "@/components/ui";

type Role = "importer" | "forwarder";

export default function Page() {
  if (privyEnabled)
    return (
      <AuthLayout eyebrow="Create an account" title="Welcome aboard." below={<DemoLink />}>
        <PrivyLogin title="Create your account" intro="We'll email you a one-time code, then ask for your company and role." />
      </AuthLayout>
    );
  return <SignupPage />;
}

function DemoLink() {
  return (
    <>
      Just looking?{" "}
      <Link href="/demo" className="font-medium text-link hover:underline">
        Try the demo
      </Link>
    </>
  );
}

function SignupPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<Role>("importer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const ready = company.trim().length >= 2 && email.includes("@") && password.length >= 10;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.post<SessionUser>("/auth/signup", { email, password, displayName: company.trim(), role }, newIdempotencyKey());
      qc.setQueryData(["session"], user);
      router.push(homeFor(user.role));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Create an account"
      title="Welcome aboard."
      below={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-link hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="fade-in space-y-5" noValidate>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">Create your account</h2>
          <p className="mt-1 text-sm text-muted">Takes a minute. You can book or open containers right after.</p>
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
        <AuthField
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={password.length > 0 && password.length < 10 ? `${10 - password.length} more characters` : "At least 10 characters"}
        />
        <InlineError error={error} />
        <Button type="submit" className="min-h-12 w-full text-base" busy={busy} disabled={!ready}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
