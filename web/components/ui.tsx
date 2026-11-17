"use client";

import { useEffect, useId, useRef, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { friendlyError } from "@/lib/api";
import { percent } from "@/lib/format";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "primary",
  busy,
  className,
  children,
  disabled,
  ...rest
}: ComponentPropsWithRef<"button"> & { variant?: Variant; busy?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-fg text-page hover:bg-accent-strong disabled:bg-panel-2 disabled:text-faint",
    secondary: "bg-panel text-fg border border-fg hover:bg-panel-2 disabled:text-faint disabled:border-line-strong",
    danger: "bg-panel text-danger border border-danger hover:bg-danger-soft disabled:text-faint disabled:border-line",
    ghost: "text-muted hover:bg-panel-2",
  };
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        styles[variant],
        className,
      )}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin text-current", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("min-w-0 border border-line bg-panel p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="label flex min-w-0 flex-1 items-center gap-2 text-muted">
              <span className="grid h-3 w-3 flex-none place-items-center rounded-full border border-fg" aria-hidden="true">
                <span className="h-1.5 w-1.5 rounded-full bg-fg" />
              </span>
              <span className="truncate">{title}</span>
              <span className="h-px flex-1 bg-line" aria-hidden="true" />
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "neutral" | "accent" | "success" | "danger" | "info";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const styles: Record<Tone, string> = {
    neutral: "border-line-strong text-muted",
    accent: "border-amber bg-amber-soft text-amber",
    success: "border-ok bg-ok-soft text-ok",
    danger: "border-danger bg-danger-soft text-danger",
    info: "border-fg bg-fg text-page",
  };
  return <span className={cx("label inline-flex items-center border px-2 py-0.5 whitespace-nowrap", styles[tone])}>{children}</span>;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 border border-line bg-panel p-6 text-sm text-muted">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="border border-danger bg-danger-soft p-5 text-sm text-danger">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1">{friendlyError(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="hatch border border-line-strong p-3">
      <div className="bg-page p-5 text-center">
        <p className="font-semibold text-fg">{title}</p>
        {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      </div>
    </div>
  );
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="border-l-2 border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
      {friendlyError(error)}
    </p>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "accent"; children: ReactNode }) {
  return (
    <p className={cx("border-l-2 px-3 py-2 text-sm", tone === "accent" ? "border-fg bg-panel-2 text-fg" : "border-line-strong bg-panel-2 text-muted")}>{children}</p>
  );
}

/** Shown on every personal importer screen (spec 23.1). */
export function PrivacyLine() {
  return (
    <p className="flex items-center gap-2 text-xs text-muted">
      <LockIcon /> Private: you, your forwarder, Summertime
    </p>
  );
}

/** Shown on every signing screen in pilot mode (spec 21). */
export function CustodyNotice() {
  return (
    <Notice tone="accent">
      <strong>Pilot mode:</strong> Summertime signs for you
    </Notice>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-none" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 2a4 4 0 0 0-4 4v2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function KeyValues({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="flex justify-between gap-3 border-b border-line py-1.5 sm:block sm:border-0 sm:py-0">
          <dt className="label self-center text-faint">{it.label}</dt>
          <dd className="text-right font-medium text-fg tabular sm:text-left">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Capacity bar: committed (solid), held but not committed (light), threshold marker.
 * Values in any unit; all relative to `capacity`.
 */
export function CapacityBar({
  committed,
  held,
  threshold,
  capacity,
  label,
}: {
  committed: number;
  held?: number;
  threshold: number;
  capacity: number;
  label: string;
}) {
  const c = percent(committed, capacity);
  const h = Math.max(0, percent(held ?? 0, capacity) - c);
  const t = percent(threshold, capacity);
  return (
    <div>
      <div
        className="relative h-3 w-full overflow-hidden border border-fg bg-panel"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={committed}
      >
        <div className="absolute inset-y-0 left-0 bg-fg" style={{ width: `${c}%` }} />
        {h > 0 && <div className="hatch absolute inset-y-0" style={{ left: `${c}%`, width: `${h}%` }} />}
        {t < 100 && <div className="absolute inset-y-0 w-0.5 bg-amber" style={{ left: `calc(${t}% - 1px)` }} title="Threshold" />}
      </div>
    </div>
  );
}

export function CopyText({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <code className="truncate bg-panel-2 px-1.5 py-0.5 font-mono text-xs text-fg" title={value}>
        {value}
      </code>
      <button
        type="button"
        className="text-xs font-semibold text-link hover:underline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
        aria-label={`Copy ${label ?? "value"}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

/**
 * Confirmation sheet for irreversible actions (spec 23.2): restates amount, deadline and what
 * happens on failure. Bottom sheet on phones, centred dialog on larger screens.
 */
export function ConfirmSheet({
  open,
  title,
  rows,
  consequence,
  children,
  confirmLabel,
  tone = "primary",
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  rows: { label: string; value: ReactNode }[];
  consequence?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-fg/50" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[92vh] w-full overflow-y-auto border border-fg bg-panel p-5 shadow-[8px_8px_0_0_#0b0a09] sm:max-w-lg"
      >
        <h2 id={titleId} className="display text-3xl text-fg">
          {title}
        </h2>
        <dl className="mt-4 divide-y divide-line border border-line">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
              <dt className="label self-center text-faint">{r.label}</dt>
              <dd className="text-right font-semibold text-fg tabular">{r.value}</dd>
            </div>
          ))}
        </dl>
        {consequence ? <div className="mt-4 text-sm text-muted">{consequence}</div> : null}
        {children && <div className="mt-4 space-y-3">{children}</div>}
        {error ? (
          <div className="mt-4">
            <InlineError error={error} />
          </div>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button ref={confirmRef} variant={tone === "danger" ? "danger" : "primary"} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-semibold text-danger">{error}</span>}
    </label>
  );
}

export const inputClass =
  "block w-full min-h-11 border border-line-strong bg-panel px-3 py-2 text-sm text-fg tabular placeholder:text-faint focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15";

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="display text-4xl text-fg sm:text-5xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
