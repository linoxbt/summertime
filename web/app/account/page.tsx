"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { Preferences } from "@summertime/ledger";
import { AppShell } from "@/components/shell";
import { PasswordField } from "@/components/auth-layout";
import { Button, Card, CopyText, InlineError, KeyValues, Notice, PageHeader, Switch } from "@/components/ui";
import { api, newIdempotencyKey } from "@/lib/api";
import { useSession, useSignOut } from "@/lib/session";
import { privySignOut } from "@/lib/privy";
import { privyEnabled } from "@/lib/privy";
import { AuthField } from "@/components/auth-layout";

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
          {user.kind === "demo" ? (
            <Notice>Demo accounts have no password. Create your own account to sign in for real.</Notice>
          ) : privyEnabled ? (
            <Notice>You sign in with a one-time code sent to {user.email ?? "your email"}.</Notice>
          ) : (
            <ChangePassword />
          )}
          {user.kind === "member" && <EmailNotifications />}
          <Card title="Session">
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </Card>
          {user.kind === "member" && user.role !== "operator" && <DeleteAccount />}
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

function EmailNotifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["preferences"], queryFn: () => api.get<Preferences>("/me/preferences") });
  const save = useMutation({
    mutationFn: (notifyEmail: boolean) => api.post<Preferences>("/me/preferences", { notifyEmail }, newIdempotencyKey()),
    onSuccess: (p) => qc.setQueryData(["preferences"], p),
  });
  const on = save.isPending ? save.variables : (q.data?.notifyEmail ?? false);
  return (
    <Card title="Email notifications">
      <Switch
        checked={Boolean(on)}
        onChange={(v) => save.mutate(v)}
        disabled={!q.data || save.isPending}
        label="Email me"
        description="Invitations, settlements, refunds and bookings."
      />
      {q.data && !q.data.emailAvailable && <p className="mt-3 text-xs text-faint">Email sending isn&apos;t switched on yet. You&apos;ll still see everything under Notifications.</p>}
      <InlineError error={save.error ?? q.error} />
    </Card>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/account/delete", { confirm: "DELETE" });
      await privySignOut();
      window.location.assign("/?deleted=1");
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Card title="Delete account">
      {!open ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Removes your email, company name and sign-in. Ledger records stay, as they are permanent.</p>
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete my account
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="fade-in space-y-4" noValidate>
          <p className="text-sm text-muted">This can&apos;t be undone. Type DELETE to confirm.</p>
          <AuthField label="Confirm" name="confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
          <InlineError error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" busy={busy} disabled={confirm !== "DELETE"}>
              Delete forever
            </Button>
            <Button type="button" variant="ghost" onClick={() => (setOpen(false), setConfirm(""), setError(null))}>
              Keep my account
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
