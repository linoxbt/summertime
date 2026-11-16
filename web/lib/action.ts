"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError, newIdempotencyKey } from "./api";

/**
 * State for one irreversible user action behind a confirmation sheet.
 *
 * A fresh Idempotency-Key is created for each confirmed action. If the request never reached
 * the server (network failure), the same key is reused on retry so the API can deduplicate it.
 */
export function useAction<T>(fn: (idempotencyKey: string) => Promise<T>, onDone?: (result: T) => void) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const keyRef = useRef<string | null>(null);

  const openSheet = useCallback(() => {
    setError(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);

  const run = useCallback(async () => {
    if (busy) return;
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setBusy(true);
    setError(null);
    try {
      const r = await fn(keyRef.current);
      keyRef.current = null;
      setOpen(false);
      onDone?.(r);
    } catch (e) {
      // Keep the key only when the request may not have arrived; otherwise start fresh.
      if (!(e instanceof ApiError && e.code === "NETWORK")) keyRef.current = null;
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [busy, fn, onDone]);

  return { open, busy, error, openSheet, close, run };
}
