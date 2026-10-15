"use client";

import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/ui/overlay";

export type SaveScope = "this" | "following";

/**
 * Edit mode on an installment row: Save asks which payments the change applies to (same pattern as
 * EditDeleteDialog). The caller owns the PUT and reports its error in the screen's alert.
 */
export function EditSaveDialog({
  open,
  onOpenChange,
  dateChanged,
  amountChanged,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The date was edited: it only ever applies to this payment. */
  dateChanged: boolean;
  /** The amount was edited: "following" sets that amount on every later payment. */
  amountChanged: boolean;
  saving: boolean;
  onConfirm: (scope: SaveScope) => void;
}) {
  return (
    <Overlay
      open={open}
      onClose={() => onOpenChange(false)}
      size="sm"
      testId="edit-save-dialog"
      title="Save changes to this installment?"
    >
        <p className="text-sm text-muted-foreground">Choose which payments get these changes.</p>
        {dateChanged && (
          <p data-testid="edit-save-date-note" className="text-xs text-muted-foreground">
            The new date applies to this payment only. The following payments keep their dates.
          </p>
        )}
        {amountChanged && (
          <p data-testid="edit-save-amount-note" className="text-xs text-muted-foreground">
            This and following sets the same amount on every following payment. The plan&rsquo;s total is not rebalanced.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button type="button" className="min-h-11 w-full" disabled={saving} onClick={() => onConfirm("this")}>
            This payment only
          </Button>
          <Button type="button" className="min-h-11 w-full" disabled={saving} onClick={() => onConfirm("following")}>
            This and following
          </Button>
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
    </Overlay>
  );
}
