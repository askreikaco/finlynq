"use client";

/**
 * useSubmit — wraps a mutating fetch for a form.
 *
 *   const { saving, error, clearError, run } = useSubmit();
 *   const res = await run(() => fetch(url, { method: "POST", body }));
 *   if (res) router.push(returnTo);
 *
 * - `run` sets `saving` while the request is in flight.
 * - A non-ok Response is turned into `error` via parseSaveError (423 always
 *   maps to DEK_LOCKED_MESSAGE). `run` then resolves null and the dialog stays open.
 * - A thrown network error sets `error` to `networkMessage` and resolves null.
 */
import { useCallback, useState } from "react";
import { parseSaveError } from "@/lib/save-error";

export const SUBMIT_FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export interface UseSubmitOptions {
  /** Generic message when the server gives none. */
  fallback?: string;
  /** Message when the request never reached the server. */
  networkMessage?: string;
}

export function useSubmit(opts: UseSubmitOptions = {}) {
  const fallback = opts.fallback ?? SUBMIT_FALLBACK_MESSAGE;
  const networkMessage = opts.networkMessage ?? fallback;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const run = useCallback(
    async (request: () => Promise<Response>): Promise<Response | null> => {
      setSaving(true);
      setError(null);
      try {
        const res = await request();
        if (res.ok) return res;
        setError(await parseSaveError(res, fallback));
        return null;
      } catch {
        setError(networkMessage);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [fallback, networkMessage],
  );

  return { saving, error, setError, clearError, run };
}
