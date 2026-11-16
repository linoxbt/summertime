"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatUsdc, parseUnits } from "@summertime/ledger";
import { api, newIdempotencyKey } from "@/lib/api";
import { formatDateTime, toLocalInput } from "@/lib/format";
import { AppShell } from "@/components/shell";
import { Button, Card, ConfirmSheet, Field, InlineError, Notice, PageHeader, inputClass } from "@/components/ui";

interface FormState {
  title: string;
  route: string;
  capacityCbm: string;
  thresholdCbm: string;
  ratePerCbm: string;
  minCbm: string;
  maxCbm: string;
  lockTime: string;
  deadline: string;
  bondUsdc: string;
}

const PRESETS = [
  { label: "Demo: lock in 5 min, deadline in 10 min", lock: 5 * 60_000, deadline: 10 * 60_000 },
  { label: "Lock in 1 h, deadline in 2 h", lock: 3_600_000, deadline: 7_200_000 },
  { label: "Lock in 3 days, deadline in 5 days", lock: 3 * 86_400_000, deadline: 5 * 86_400_000 },
];

function defaults(): FormState {
  const now = Date.now();
  return {
    title: "",
    route: "Guangzhou → Lagos (Apapa)",
    capacityCbm: "60",
    thresholdCbm: "60",
    ratePerCbm: "150",
    minCbm: "1",
    maxCbm: "15",
    lockTime: toLocalInput(new Date(now + 3 * 86_400_000)),
    deadline: toLocalInput(new Date(now + 5 * 86_400_000)),
    bondUsdc: "200",
  };
}

function tryParse(v: string, scale: 3 | 6): bigint | null {
  try {
    return parseUnits(v, scale);
  } catch {
    return null;
  }
}

export default function NewCampaignPage() {
  return (
    <AppShell role="forwarder">
      <NewCampaign />
    </AppShell>
  );
}

function NewCampaign() {
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(defaults);
  const [created, setCreated] = useState<{ campaignId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [bondOpen, setBondOpen] = useState(false);
  const [bondBusy, setBondBusy] = useState(false);
  const [bondError, setBondError] = useState<unknown>(null);
  const [bondKey] = useState(newIdempotencyKey);

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const v = useMemo(() => validate(f), [f]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.ok) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.post<{ campaignId: string }>(
        "/campaigns",
        {
          title: f.title.trim(),
          route: f.route.trim() || undefined,
          capacityCbm: f.capacityCbm,
          thresholdCbm: f.thresholdCbm,
          ratePerCbm: f.ratePerCbm,
          minCbm: f.minCbm,
          maxCbm: f.maxCbm,
          lockTime: new Date(f.lockTime).toISOString(),
          deadline: new Date(f.deadline).toISOString(),
          bondUsdc: f.bondUsdc,
        },
        newIdempotencyKey(),
      );
      setCreated(r);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendBond() {
    if (!created) return;
    setBondBusy(true);
    setBondError(null);
    try {
      await api.post(`/campaigns/${encodeURIComponent(created.campaignId)}/bond`, undefined, bondKey);
      router.push(`/forwarder/campaigns/${encodeURIComponent(created.campaignId)}`);
    } catch (err) {
      setBondError(err);
      setBondBusy(false);
    }
  }

  if (created) {
    return (
      <>
        <PageHeader title="Post the failure bond" subtitle={`Campaign "${f.title}" is proposed.`} />
        <Card>
          <p className="text-slate-700">
            The campaign opens once Summertime receives your <strong className="tabular">{f.bondUsdc} USDCx</strong> failure bond. If the container doesn&apos;t
            fill by the deadline, the bond is shared among the importers who committed. If it fills, the bond comes back to you.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => setBondOpen(true)}>Send bond</Button>
            <Button variant="secondary" onClick={() => router.push(`/forwarder/campaigns/${encodeURIComponent(created.campaignId)}`)}>
              Later
            </Button>
          </div>
        </Card>
        <ConfirmSheet
          open={bondOpen}
          title="Send the failure bond"
          rows={[
            { label: "Bond", value: `${f.bondUsdc} USDCx` },
            { label: "To", value: "Summertime (operator)" },
            { label: "Deadline", value: formatDateTime(new Date(f.deadline).toISOString()) },
          ]}
          consequence={
            <p>
              Summertime holds the bond in custody until the campaign ends. If the container doesn&apos;t fill, it is paid to the importers who committed;
              otherwise it is returned to you. Bond custody is trust in Summertime (see the privacy page).
            </p>
          }
          confirmLabel="Send bond"
          busy={bondBusy}
          error={bondError}
          onConfirm={sendBond}
          onClose={() => setBondOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="New campaign" subtitle="Terms cannot change once Summertime accepts the campaign." />
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3" noValidate>
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Shipment">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign title" error={v.errors.title}>
                <input className={inputClass} value={f.title} onChange={set("title")} placeholder="December groupage, 40ft HC" required />
              </Field>
              <Field label="Route" hint="Shown to invited importers.">
                <input className={inputClass} value={f.route} onChange={set("route")} />
              </Field>
            </div>
          </Card>
          <Card title="Capacity and price">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Container capacity (CBM)" error={v.errors.capacityCbm}>
                <input className={inputClass} inputMode="decimal" value={f.capacityCbm} onChange={set("capacityCbm")} />
              </Field>
              <Field label="Threshold to settle (CBM)" hint="Settlement is possible once committed capacity reaches this." error={v.errors.thresholdCbm}>
                <input className={inputClass} inputMode="decimal" value={f.thresholdCbm} onChange={set("thresholdCbm")} />
              </Field>
              <Field label="Rate (USDCx per CBM)" error={v.errors.ratePerCbm}>
                <input className={inputClass} inputMode="decimal" value={f.ratePerCbm} onChange={set("ratePerCbm")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min per importer" hint="CBM, at least 1" error={v.errors.minCbm}>
                  <input className={inputClass} inputMode="decimal" value={f.minCbm} onChange={set("minCbm")} />
                </Field>
                <Field label="Max per importer" hint="CBM" error={v.errors.maxCbm}>
                  <input className={inputClass} inputMode="decimal" value={f.maxCbm} onChange={set("maxCbm")} />
                </Field>
              </div>
            </div>
          </Card>
          <Card title="Timing">
            <div className="mb-4 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-accent"
                  onClick={() => {
                    const now = Date.now();
                    setF((s) => ({ ...s, lockTime: toLocalInput(new Date(now + p.lock)), deadline: toLocalInput(new Date(now + p.deadline)) }));
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Lock time" hint="Last moment to reserve and commit; free withdrawal until then." error={v.errors.lockTime}>
                <input type="datetime-local" className={inputClass} value={f.lockTime} onChange={set("lockTime")} />
              </Field>
              <Field label="Deadline" hint="Settlement must happen before this, or the campaign fails." error={v.errors.deadline}>
                <input type="datetime-local" className={inputClass} value={f.deadline} onChange={set("deadline")} />
              </Field>
            </div>
          </Card>
          <Card title="Failure bond">
            <Field label="Bond (USDCx)" hint="Between 1% and 5% of the full container value." error={v.errors.bondUsdc}>
              <input className={inputClass} inputMode="decimal" value={f.bondUsdc} onChange={set("bondUsdc")} />
            </Field>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="Summary">
            <dl className="space-y-2 text-sm tabular">
              <Row label="Full container value" value={v.full !== null ? `${formatUsdc(v.full)} USDCx` : "—"} />
              <Row label="Bond" value={v.bondPct !== null ? `${v.bondPct.toFixed(2)}% of full value` : "—"} />
              <Row label="Threshold value" value={v.thresholdValue !== null ? `${formatUsdc(v.thresholdValue)} USDCx` : "—"} />
            </dl>
            <div className="mt-4 space-y-3">
              <Notice>Importers never see each other. You see every reservation, as you do today.</Notice>
              <InlineError error={error} />
              <Button type="submit" className="w-full" busy={submitting} disabled={!v.ok}>
                Propose campaign
              </Button>
              {!v.ok && <p className="text-xs text-slate-600">Fix the highlighted fields to continue.</p>}
            </div>
          </Card>
        </div>
      </form>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function validate(f: FormState) {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const cap = tryParse(f.capacityCbm, 3);
  const thr = tryParse(f.thresholdCbm, 3);
  const rate = tryParse(f.ratePerCbm, 6);
  const min = tryParse(f.minCbm, 3);
  const max = tryParse(f.maxCbm, 3);
  const bond = tryParse(f.bondUsdc, 6);
  if (!f.title.trim()) errors.title = "Give the campaign a title.";
  if (cap === null || cap <= 0n) errors.capacityCbm = "Enter a capacity in CBM (up to 3 decimals).";
  if (thr === null || thr <= 0n) errors.thresholdCbm = "Enter a threshold in CBM.";
  else if (cap !== null && thr > cap) errors.thresholdCbm = "The threshold cannot exceed the capacity.";
  if (rate === null || rate <= 0n) errors.ratePerCbm = "Enter a rate in USDCx.";
  else if (rate % 1000n !== 0n) errors.ratePerCbm = "Use at most 3 decimals for the rate.";
  if (min === null || min < 1000n) errors.minCbm = "At least 1 CBM.";
  if (max === null || max <= 0n) errors.maxCbm = "Enter a maximum.";
  else if (min !== null && max < min) errors.maxCbm = "Must be at least the minimum.";
  else if (cap !== null && max > cap) errors.maxCbm = "Cannot exceed the capacity.";
  const lock = Date.parse(f.lockTime);
  const dl = Date.parse(f.deadline);
  if (Number.isNaN(lock) || lock <= Date.now()) errors.lockTime = "Choose a lock time in the future.";
  if (Number.isNaN(dl) || (!Number.isNaN(lock) && dl <= lock)) errors.deadline = "The deadline must be after the lock time.";
  // Rate per milli-CBM in micro-USDCx = rate per CBM (micro) / 1000.
  const full = cap !== null && rate !== null ? (cap * rate) / 1000n : null;
  const thresholdValue = thr !== null && rate !== null ? (thr * rate) / 1000n : null;
  const bondPct = full !== null && full > 0n && bond !== null ? Number((bond * 10000n) / full) / 100 : null;
  if (bond === null || bond <= 0n) errors.bondUsdc = "Enter the bond in USDCx.";
  else if (bondPct !== null && (bond * 100n < full! || bond * 100n > full! * 5n))
    errors.bondUsdc = "The bond must be between 1% and 5% of the full container value.";
  return { ok: Object.keys(errors).length === 0, errors, full, thresholdValue, bondPct };
}
