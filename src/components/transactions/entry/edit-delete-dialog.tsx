"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Edit mode: Delete asks first. The caller owns the DELETE call and reports its error here. */
export function EditDeleteDialog({
  open,
  onOpenChange,
  isTransfer,
  deleting,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTransfer: boolean;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="regular:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isTransfer ? "Delete this transfer?" : "Delete this transaction?"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isTransfer
            ? "Both legs of this transfer will be deleted. This cannot be undone."
            : "This transaction will be deleted. This cannot be undone."}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" className="flex-1" disabled={deleting} onClick={onConfirm}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
