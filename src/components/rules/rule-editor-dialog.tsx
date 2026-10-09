"use client";

/**
 * RuleEditorDialog: modal wrapper around RuleEditorForm (rule-editor-form.tsx).
 *
 * Only transaction-dialog.tsx still opens this (the "Customize…" rule flow).
 * To be removed once /settings/rules/new is used by transactions.
 * The all-exports re-export keeps the old import path (types + constants) working.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RuleEditorForm, type RuleEditorFormProps } from "./rule-editor-form";

export * from "./rule-editor-form";

/**
 * Transaction-dialog wrapper around RuleEditorForm.
 * Still used by transaction-dialog.tsx ("Customize…" rule flow).
 * To be removed once /settings/rules/new is used by transactions.
 */
export function RuleEditorDialog({
  rule,
  initialName,
  initialConditions,
  initialActions,
  initialPriority,
  initialIsActive,
  categories,
  accounts,
  holdings,
  onClose,
  onSubmit,
  submitLabel,
  title,
}: RuleEditorDialogProps) {
  const computedTitle = title ?? (rule ? "Edit rule" : "New rule");
  const computedSubmitLabel = submitLabel ?? (rule ? "Update rule" : "Create rule");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(false); }}>
      <DialogContent className="regular:max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{computedTitle}</DialogTitle>
        </DialogHeader>
        <RuleEditorForm
          rule={rule}
          initialName={initialName}
          initialConditions={initialConditions}
          initialActions={initialActions}
          initialPriority={initialPriority}
          initialIsActive={initialIsActive}
          categories={categories}
          accounts={accounts}
          holdings={holdings}
          onSubmit={onSubmit}
          onSaved={() => onClose(true)}
          renderActions={({ submitting, save }) => (
            <DialogFooter>
              <Button variant="ghost" onClick={() => onClose(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={save} disabled={submitting}>
                {submitting ? "Saving…" : computedSubmitLabel}
              </Button>
            </DialogFooter>
          )}
        />
      </DialogContent>
    </Dialog>
  );
}

export interface RuleEditorDialogProps extends Omit<RuleEditorFormProps, "onSaved" | "renderActions"> {
  onClose: (saved: boolean) => void;
  /** Defaults to "Create rule" / "Update rule" based on whether `rule` is set. */
  submitLabel?: string;
  /** Defaults to "New rule" / "Edit rule" based on whether `rule` is set. */
  title?: string;
}
