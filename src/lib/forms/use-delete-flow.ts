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
 */
import { useCallback, useState } from "react";
import { parseSaveError } from "@/lib/save-error";

export interface UseDeleteFlowOptions<R> {
  request: (record: R) => Promise<Response>;
  onDeleted?: (record: R) => void;
  fallback?: string;
}

export function useDeleteFlow<R>(opts: UseDeleteFlowOptions<R>) {
  const { request, onDeleted, fallback = "Could not delete. Please try again." } = opts;
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
    try {
      const res = await request(target);
      if (!res.ok) {
        setError(await parseSaveError(res, fallback));
        return;
      }
      setTarget(null);
      onDeleted?.(target);
    } catch {
      setError(fallback);
    } finally {
      setDeleting(false);
    }
  }, [target, request, onDeleted, fallback]);

  return { target, open, close, confirm, deleting, error };
}
