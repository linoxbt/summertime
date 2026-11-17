"use client";

import { useEffect, useState } from "react";

/** Header chip showing whether the demo backend answers. Nothing is shown until it is known. */
export function DemoStatus() {
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/healthz", { cache: "no-store" })
      .then((r) => alive && setLive(r.ok))
      .catch(() => alive && setLive(false));
    return () => {
      alive = false;
    };
  }, []);
  if (live === null) return null;
  return (
    <span className="fade-in label hidden items-center gap-2 rounded-full border border-line-strong bg-panel px-3 py-1 text-muted lg:inline-flex">
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-ok" : "bg-amber"}`} aria-hidden="true" />
      {live ? "Demo live" : "Demo offline"}
    </span>
  );
}
