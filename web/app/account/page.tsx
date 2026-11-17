"use client";

import { useState, type FormEvent } from "react";
import { AppShell } from "@/components/shell";
import { PasswordField } from "@/components/auth-layout";
import { Button, Card, CopyText, InlineError, KeyValues, Notice, PageHeader } from "@/components/ui";
import { api, newIdempotencyKey } from "@/lib/api";
import { useSession, useSignOut } from "@/lib/session";

export default function AccountPage() {
  return (
    <AppShell>
      <Account />
    </AppShell>
  );
}

function Account() {
  const user = useSession().data!;
  const signOut = useSignOut();
  return (
    <>
      <PageHeader title="Account" subtitle={user.kind === "demo" ? "Demo account" : user.email} />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Profile">
          <KeyValues
            items={[
              { label: "Company", value: user.displayName },
              { label: "Role", value: <span className="capitalize">{user.role}</span> },
              { label: "Email", value: user.email ?? "—" },
              { label: "Account", value: user.kind === "demo" ? "Demo" : "Member" },
              { label: "Custody", value: user.mode === "pilot" ? "Pilot: Summertime signs for you" : "Your own wallet" },
            ]}
          />
          <div className="mt-5 border-t border-line pt-4">
            <p className="label text-faint">Ledger identity</p>
            <div className="mt-1.5">
              <CopyText value={user.party} label="party ID" />
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          {user.kind === "member" ? <ChangePassword /> : <Notice>Demo accounts have no password. Create your own account to sign in for real.</Notice>}
          <Card title="Session">
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api.post("/auth/password/change", { currentPassword: current, newPassword: next }, newIdempotencyKey());
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={10}
          required
          hint="At least 10 characters. Other sessions are signed out."
        />
        <InlineError error={error} />
        {done && (
          <p role="status" className="fade-in rounded-xl bg-ok-soft px-4 py-2.5 text-sm text-ok">
            Password changed.
          </p>
        )}
        <Button type="submit" busy={busy} disabled={!current || next.length < 10}>
          Change password
        </Button>
      </form>
    </Card>
  );
}
