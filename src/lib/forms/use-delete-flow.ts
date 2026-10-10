"use client";

/**
 * useDeleteFlow — confirm-then-delete state for a form or list row.
 *
 *   const del = useDeleteFlow<Loan>({
 *     request: (loan) => fetch(`/api/loans/${loan.id}`, { method: "DELETE" }),
 *     onDeleted: () => router.push(returnTo),
 *   });
 *   <button onClick={() => del.open(loan)}>Delete</button>
 *   <ConfirmDialog open={!!del.target} onConfirm={del.confirm} onCancel={del.close} />
 *
 * - `confirm` runs `request` for `target`. Success calls `onDeleted` and closes.
 * - A failed request keeps the dialog open with `error` set (parseSaveError rules).
 *
 * Optional (defaults = the behaviour above):
 * - `keepOpenOnError: false` closes the dialog on failure and keeps `error`
 *   (loans/subscriptions pattern).
 * - `ignoreStatus: true` treats any resolved Response as success (goals pattern).
 * - `errorMessage` shows fixed copy on failure instead of parseSaveError.
 */
import { useCallback, useState } from "react";
import { parseSaveError } from "@/lib/save-error";

export interface UseDeleteFlowOptions<R> {
  request: (record: R) => Promise<Response>;
  onDeleted?: (record: R) => void;
  fallback?: string;
  keepOpenOnError?: boolean;
  ignoreStatus?: boolean;
  errorMessage?: string;
}

export function useDeleteFlow<R>(opts: UseDeleteFlowOptions<R>) {
  const {
    request,
    onDeleted,
    fallback = "Could not delete. Please try again.",
    keepOpenOnError = true,
    ignoreStatus = false,
    errorMessage,
  } = opts;
  const [target, setTarget] = useState<R | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((record: R) => {
    setError(null);
    setTarget(record);
  }, []);

  const close = useCallback(() => {
    if (deleting) return;
    setError(null);
    setTarget(null);
  }, [deleting]);

  const confirm = useCallback(async () => {
    if (target === null) return;
    setDeleting(true);
    setError(null);
    const fail = async (res: Response | null) => {
      const message = errorMessage ?? (res ? await parseSaveError(res, fallback) : fallback);
      setError(message);
      if (!keepOpenOnError) setTarget(null);
    };
    try {
      const res = await request(target);
      if (!res.ok && !ignoreStatus) {
        await fail(res);
        return;
      }
      setTarget(null);
      onDeleted?.(target);
    } catch {
      await fail(null);
    } finally {
      setDeleting(false);
    }
  }, [target, request, onDeleted, fallback, keepOpenOnError, ignoreStatus, errorMessage]);

  return { target, open, close, confirm, deleting, error };
}
