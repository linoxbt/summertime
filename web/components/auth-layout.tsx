"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Eyebrow, PublicPage } from "./public";
import { ContainerDrawing } from "./drawings";
import { homeFor, useSession } from "@/lib/session";
import { cx, inputClass } from "./ui";

/** Two-column layout shared by sign-in, sign-up and password reset. */
export function AuthLayout({ eyebrow, title, children, below }: { eyebrow: string; title: string; children: ReactNode; below?: ReactNode }) {
  const router = useRouter();
  const session = useSession();
  useEffect(() => {
    if (session.data) router.replace(homeFor(session.data.role));
  }, [session.data, router]);

  return (
    <PublicPage>
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)] border-x border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section className="hidden flex-col justify-center gap-12 border-r border-line p-10 lg:flex">
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="display mt-6 text-7xl text-fg">{title}</h1>
            <p className="mt-4 max-w-sm text-muted">Your bookings, your reservations, your settlements. One account.</p>
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

        <section className="flex min-w-0 items-start justify-center px-4 py-10 sm:px-8 lg:items-center lg:py-14">
          <div className="w-full max-w-md">
            <h1 className="display text-5xl text-fg lg:hidden">{title}</h1>
            <div className="mt-6 rounded-3xl border border-line bg-panel p-6 shadow-lift sm:p-8 lg:mt-0">{children}</div>
            {below && <div className="mt-6 text-center text-sm text-muted">{below}</div>}
          </div>
        </section>
      </div>
    </PublicPage>
  );
}

/** Labelled text input sized for auth forms; the hint is linked as its description. */
export function AuthField({
  label,
  hint,
  ...rest
}: { label: string; hint?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label block text-muted">
        {label}
      </label>
      <input {...rest} id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={cx(inputClass, "mt-1.5 min-h-12 text-base", rest.className)} />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Password input with a show/hide toggle; the label names only the input. */
export function PasswordField({ label, hint, ...rest }: { label: string; hint?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label block text-muted">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          {...rest}
          id={id}
          type={shown ? "text" : "password"}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cx(inputClass, "min-h-12 pr-20 text-base")}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-controls={id}
          className="absolute inset-y-1.5 right-1.5 rounded-lg px-3 text-xs font-medium text-muted hover:bg-panel-2 hover:text-fg"
        >
          {shown ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} aria-live="polite" className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
