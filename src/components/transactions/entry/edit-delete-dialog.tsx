"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type DeleteScope = "this" | "following";

/**
 * Edit mode: Delete asks first. The caller owns the DELETE call and reports its error here.
 * An installment row offers two choices (this payment only / this and following); any other row
 * keeps the single confirm.
 */
export function EditDeleteDialog({
  open,
  onOpenChange,
  isTransfer,
  isInstallment = false,
  deleting,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTransfer: boolean;
  /** The row belongs to an installment plan: show the scope choice. */
  isInstallment?: boolean;
  deleting: boolean;
  error: string | null;
  onConfirm: (scope: DeleteScope) => void;
}) {
  const title = isTransfer
    ? "Delete this transfer?"
    : isInstallment
      ? "Delete this installment?"
      : "Delete this transaction?";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="regular:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isTransfer
            ? "Both legs of this transfer will be deleted. This cannot be undone."
            : isInstallment
              ? "Choose what to delete. This cannot be undone."
              : "This transaction will be deleted. This cannot be undone."}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {isInstallment ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 w-full"
              disabled={deleting}
              onClick={() => onConfirm("this")}
            >
              This payment only
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 w-full"
              disabled={deleting}
              onClick={() => onConfirm("following")}
            >
              This and following
            </Button>
            <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={deleting}
              onClick={() => onConfirm("this")}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
