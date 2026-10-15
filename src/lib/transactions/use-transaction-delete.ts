"use client";

/**
 * useTransactionDelete — the delete flow of ONE transaction on the edit page (entry screen and the full edit form).
 * It is useDeleteFlow (confirm, request, error, close) plus the three transaction-only branches the old list dialog had:
 *
 *   - lot-locked row: the server answers 409 `portfolio_edit_blocked`. `blocked` is set, the dry-run reallocation
 *     preview loads (`preview`), and `reallocate()` repeats the DELETE with `confirmReallocation=1` (FINLYNQ-176).
 *   - no connection while the offline queue is on: a simple row (no splits, no series, no portfolio) is kept on this
 *     device as a queued delete (hidden from the list, synced later). The splits check runs while the request still
 *     works, when the confirm opens.
 *   - installment row: `scope` ("this" | "following") rides on the request.
 *
 * `onDeleted(row, how)`: "deleted" = the server removed it, "queued" = it is waiting on this device.
 */
import { useCallback, useRef, useState } from "react";
import { useDeleteFlow } from "@/lib/forms/use-delete-flow";
import { canQueueOfflineDelete, isNetworkFailure, type OfflineDeleteCandidate } from "@/lib/transactions/entry-mode";
import { isLocalWriteQueueActive, queueOfflineDelete } from "@/lib/data/local-write-queue";
import type { LotReallocationPreview } from "@/lib/portfolio/lots/types";

export type TransactionDeleteScope = "this" | "following";
export type TransactionDeleteOutcome = "deleted" | "queued";

/** Server refusal for a lot-locked row: the message and the later rows that depend on it. */
export interface DeleteBlocked {
  message: string;
  blockingIds: number[];
}

export type DeletableRow = OfflineDeleteCandidate & { id: number };

export interface UseTransactionDeleteOptions<R extends DeletableRow> {
  /** Default: DELETE /api/transactions?id=<id> (+ scope, + confirmReallocation). Transfers pass their own. */
  request?: (row: R, scope: TransactionDeleteScope) => Promise<Response>;
  /** False for rows that never go to the offline queue (transfers). Default true. */
  queueable?: boolean;
  onDeleted: (row: R, how: TransactionDeleteOutcome) => void;
}

/** Plain-object stand-in for a successful Response: the queued delete took the place of the request. */
const QUEUED_OK = { ok: true, status: 202 } as Response;

export function useTransactionDelete<R extends DeletableRow>(opts: UseTransactionDeleteOptions<R>) {
  const { request: customRequest, queueable = true, onDeleted } = opts;
  const [blocked, setBlocked] = useState<DeleteBlocked | null>(null);
  const [preview, setPreview] = useState<LotReallocationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const scopeRef = useRef<TransactionDeleteScope>("this");
  const reallocateRef = useRef(false);
  const outcomeRef = useRef<TransactionDeleteOutcome>("deleted");
  // Whether the row has splits, read while the request still works (queue active only). null = unknown.
  const splitsRef = useRef<{ id: number; result: Promise<boolean | null> } | null>(null);

  const loadPreview = useCallback(async (id: number) => {
    setPreview(null);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/transactions/lot-replan-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "delete", id }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.preview) setPreview(data.preview as LotReallocationPreview);
      }
    } catch {
      // The preview is best-effort: without it the user still sees the warning and can proceed.
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const flow = useDeleteFlow<R>({
    request: async (row) => {
      outcomeRef.current = "deleted";
      const scope = scopeRef.current;
      let res: Response;
      try {
        res = customRequest
          ? await customRequest(row, scope)
          : await fetch(
              `/api/transactions?id=${row.id}${row.installmentGroupId ? `&scope=${scope}` : ""}${reallocateRef.current ? "&confirmReallocation=1" : ""}`,
              { method: "DELETE" },
            );
      } catch (err) {
        const chk = splitsRef.current;
        if (
          queueable &&
          isLocalWriteQueueActive() &&
          isNetworkFailure(err) &&
          chk &&
          chk.id === row.id &&
          canQueueOfflineDelete({ queueActive: true, error: err, row, hasSplits: await chk.result }) &&
          (await queueOfflineDelete(row.id, row as unknown as Record<string, unknown>))
        ) {
          outcomeRef.current = "queued";
          return QUEUED_OK;
        }
        // Not queued: show the failure as the old dialog did (the thrown message, e.g. "Failed to fetch").
        const message = err instanceof Error ? err.message : "Could not reach the server.";
        return { ok: false, status: 0, json: async () => ({ error: message }) } as Response;
      }
      if (!res.ok && !reallocateRef.current) {
        const body = await (typeof res.clone === "function" ? res.clone() : res).json().catch(() => ({}));
        if (body?.code === "portfolio_edit_blocked") {
          setBlocked({
            message: body.error ?? "Delete blocked by portfolio dependencies.",
            blockingIds: Array.isArray(body.blockingClosureTxIds) ? (body.blockingClosureTxIds as number[]) : [],
          });
          void loadPreview(row.id);
        }
      }
      return res;
    },
    onDeleted: (row) => {
      setBlocked(null);
      setPreview(null);
      onDeleted(row, outcomeRef.current);
    },
  });

  const open = useCallback(
    (row: R) => {
      setBlocked(null);
      setPreview(null);
      reallocateRef.current = false;
      scopeRef.current = "this";
      if (queueable && row.id > 0 && isLocalWriteQueueActive()) {
        splitsRef.current = {
          id: row.id,
          result: fetch(`/api/transactions/splits?transactionId=${row.id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d: unknown) => (Array.isArray(d) ? d.length > 0 : null))
            .catch(() => null),
        };
      } else {
        splitsRef.current = null;
      }
      flow.open(row);
    },
    [flow, queueable],
  );

  const close = useCallback(() => {
    if (flow.deleting) return;
    setBlocked(null);
    setPreview(null);
    reallocateRef.current = false;
    flow.close();
  }, [flow]);

  const confirm = useCallback(
    (scope: TransactionDeleteScope = "this") => {
      scopeRef.current = scope;
      reallocateRef.current = false;
      return flow.confirm();
    },
    [flow],
  );

  /** Lot-locked row: delete anyway; the dependent rows are re-matched to other lots. */
  const reallocate = useCallback(
    (scope: TransactionDeleteScope = "this") => {
      scopeRef.current = scope;
      reallocateRef.current = true;
      return flow.confirm();
    },
    [flow],
  );

  return {
    target: flow.target,
    deleting: flow.deleting,
    error: flow.error,
    blocked,
    preview,
    previewLoading,
    open,
    close,
    confirm,
    reallocate,
  };
}
