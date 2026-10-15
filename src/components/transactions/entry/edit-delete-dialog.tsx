"use client";

import Link from "next/link";
import { Overlay, type OverlayAction } from "@/components/ui/overlay";
import { Notice } from "@/components/notice";
import { LotReallocationNotice } from "@/components/portfolio/lot-reallocation-notice";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import type { LotReallocationPreview } from "@/lib/portfolio/lots/types";
import type { DeleteBlocked } from "@/lib/transactions/use-transaction-delete";

export type DeleteScope = "this" | "following";

/**
 * Edit page: Delete asks first (Overlay confirm). The caller owns the DELETE call (useTransactionDelete) and reports
 * its error here. An installment row offers two choices (this payment only / this and following); any other row keeps
 * the single confirm. A lot-locked row (`blocked`) swaps the body for the reallocation preview and offers
 * "Reallocate & delete".
 */
export function EditDeleteDialog({
  open,
  onOpenChange,
  isTransfer,
  isInstallment = false,
  deleting,
  error,
  onConfirm,
  blocked = null,
  preview = null,
  previewLoading = false,
  onReallocate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTransfer: boolean;
  /** The row belongs to an installment plan: show the scope choice. */
  isInstallment?: boolean;
  deleting: boolean;
  error: string | null;
  onConfirm: (scope: DeleteScope) => void;
  /** The server refused: the row opened a lot that was sold or transferred out. */
  blocked?: DeleteBlocked | null;
  preview?: LotReallocationPreview | null;
  previewLoading?: boolean;
  onReallocate?: (scope: DeleteScope) => void;
}) {
  const title = isTransfer
    ? "Delete this transfer?"
    : isInstallment
      ? "Delete this installment?"
      : "Delete this transaction?";
  const close = () => onOpenChange(false);
  const cancel: OverlayAction = { label: "Cancel", disabled: deleting };
  const realloc = (label: string, scope: DeleteScope): OverlayAction => ({
    label,
    kind: "destructive",
    busy: deleting,
    busyLabel: "Deleting…",
    disabled: previewLoading,
    onClick: () => onReallocate?.(scope),
  });

  let actions: OverlayAction[] | undefined;
  if (blocked) {
    actions = isInstallment
      ? [realloc("Reallocate & delete this payment", "this"), realloc("Reallocate & delete this and following", "following"), cancel]
      : [cancel, realloc("Reallocate & delete", "this")];
  } else if (isInstallment) {
    actions = [
      { label: "This payment only", kind: "destructive", disabled: deleting, onClick: () => onConfirm("this") },
      { label: "This and following", kind: "destructive", disabled: deleting, onClick: () => onConfirm("following") },
      cancel,
    ];
  }

  return (
    <Overlay
      variant="confirm"
      open={open}
      onClose={close}
      title={title}
      message={
        blocked
          ? undefined
          : isTransfer
            ? "Both legs of this transfer will be deleted. This cannot be undone."
            : isInstallment
              ? "Choose what to delete. This cannot be undone."
              : "This transaction will be deleted. This cannot be undone."
      }
      confirmLabel="Delete"
      busy={deleting}
      onConfirm={() => onConfirm("this")}
      actions={actions}
    >
      {error && !blocked && <Notice tone="danger">{error}</Notice>}
      {blocked && (
        <div className="space-y-3" data-testid="delete-blocked">
          <p className="text-sm text-warning">{blocked.message}</p>
          <p className="text-sm text-foreground">
            This transaction opened a lot that has since been sold or transferred out. You can still delete it: the
            dependent transactions will be re-matched to your other lots.
          </p>
          <LotReallocationNotice preview={preview} loading={previewLoading} />
          {blocked.blockingIds.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="mb-1.5 font-medium">Dependent rows:</p>
              <ul className="space-y-1">
                {blocked.blockingIds.map((id) => (
                  <li key={id}>
                    <Link href={buildTxDrillUrl({ id: String(id) })} className="text-primary underline hover:no-underline" onClick={close}>
                      Transaction #{id}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* The first refusal is already the message above; show only a later failure (e.g. the retry). */}
          {error && error !== blocked.message && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
    </Overlay>
  );
}
