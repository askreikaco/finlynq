"use client";

/**
 * TransactionEditForm — the full-page Edit transaction / Edit transfer form
 * (PKG1 tx-edit). Logic: useTransactionForm (moved out of TransactionDialog).
 * Fields: TransactionFormBody with variant "page". Chrome: glass PageHeader
 * with one phone primary (Save, icon-only check, submits the form by id),
 * Duplicate/Split/Delete in the overflow menu. Delete asks first in a confirm dialog.
 * Back, save and delete all navigate to returnTo (validated) or /transactions.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate, useSWRConfig } from "swr";
import { Check, Copy, Split, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/mobile";
import type { OverflowAction } from "@/components/mobile/page-header";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/ui/overlay";
import { TW } from "@/lib/design/tokens";
import { useTransactionForm } from "@/components/transactions/use-transaction-form";
import { TransactionFormBody } from "@/components/transactions/transaction-form-body";
import type {
  DialogAccount,
  DialogCategory,
  DialogHolding,
} from "@/components/transactions/transaction-dialog";
import { revalidateTransactionLists } from "@/lib/transactions/revalidate";
import { buildPrefill, canDuplicate, writePrefill } from "@/lib/transactions/prefill";
import { transactionEditHref, transactionSplitHref } from "@/lib/transactions/edit-flow";
import type { EditInitialState } from "./use-edit-source";

const FORM_ID = "transaction-edit-form";

export interface TransactionEditFormProps {
  initialState: EditInitialState;
  accounts: DialogAccount[];
  categories: DialogCategory[];
  holdings: DialogHolding[];
  /** Validated same-app path to go back to after save, delete or Back. */
  returnTo: string;
}

export function TransactionEditForm({
  initialState,
  accounts,
  categories,
  holdings,
  returnTo,
}: TransactionEditFormProps) {
  const router = useRouter();
  const { mutate: swrMutate, cache } = useSWRConfig();
  const isTransfer = initialState.kind === "transfer-edit";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const goBack = () => router.push(returnTo);
  const refreshLists = () => {
    void revalidateTransactionLists(swrMutate, cache);
    void mutate("/api/accounts");
  };

  const f = useTransactionForm({
    open: true,
    onOpenChange: (open) => {
      if (!open) goBack();
    },
    accounts,
    categories,
    holdings,
    initialState,
    onSaved: () => refreshLists(),
  });
  const { editingTx } = f;

  const onDuplicate = () => {
    if (!editingTx || !canDuplicate(editingTx, editingTx.currency)) return;
    writePrefill(buildPrefill(editingTx as unknown as Parameters<typeof buildPrefill>[0]));
    router.push("/transactions/new?prefill=1");
  };

  // Single-transaction delete (transfers delete through the hook: both legs at once).
  async function deleteTransaction() {
    if (!editingTx) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/transactions?id=${editingTx.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(
          data?.code === "portfolio_edit_blocked"
            ? (data.error ?? "Delete blocked by portfolio dependencies.")
            : (data?.error ?? `Delete failed (${res.status})`),
        );
        return;
      }
      setConfirmOpen(false);
      refreshLists();
      goBack();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not reach the server.");
    } finally {
      setDeleting(false);
    }
  }

  const overflow: OverflowAction[] = isTransfer
    ? [{ label: "Delete transfer", icon: Trash2, destructive: true, onSelect: () => setConfirmOpen(true) }]
    : [
        {
          label: "Duplicate",
          icon: Copy,
          disabled: !editingTx || !canDuplicate(editingTx, editingTx.currency),
          onSelect: onDuplicate,
        },
        {
          label: "Split",
          icon: Split,
          disabled: !editingTx,
          onSelect: () => editingTx && router.push(transactionSplitHref(editingTx.id, returnTo)),
        },
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirmOpen(true) },
      ];

  return (
    <div data-testid="tx-edit-root" className="w-full">
      <PageHeader
        title={isTransfer ? "Edit transfer" : "Edit transaction"}
        backHref={returnTo}
        backLabel="Back"
        overflow={overflow}
        actions={
          <Button
            type="submit"
            form={FORM_ID}
            data-testid="tx-edit-save"
            disabled={f.saving || f.transferDeleting}
            className="h-11 gap-1.5"
          >
            <Check className="size-4" aria-hidden="true" />
            Save
          </Button>
        }
      />
      <div className={`mt-3 px-4 ${TW.form} ${TW.formPad}`}>
        <TransactionFormBody
          f={f}
          variant="page"
          formId={FORM_ID}
          onLinkedSiblingClick={(s) => router.push(transactionEditHref(s.id, returnTo))}
        />
      </div>

      <Overlay
        variant="confirm"
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setDeleteError(null);
        }}
        title={isTransfer ? "Delete this transfer?" : "Delete this transaction?"}
        message={
          isTransfer
            ? "Both legs of this transfer will be deleted. This cannot be undone."
            : "This transaction will be deleted. This cannot be undone."
        }
        confirmLabel="Delete"
        busy={deleting || f.transferDeleting}
        onConfirm={() => {
          if (isTransfer) {
            setConfirmOpen(false);
            void f.handleTransferDelete();
          } else {
            void deleteTransaction();
          }
        }}
      >
        {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
      </Overlay>
    </div>
  );
}
