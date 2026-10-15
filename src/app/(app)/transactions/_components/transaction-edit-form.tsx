"use client";

/**
 * TransactionEditForm — the full-page Edit transaction / Edit transfer form
 * (PKG1 tx-edit). Logic: useTransactionForm (moved out of TransactionDialog).
 * Fields: TransactionFormBody with variant "page". Chrome: glass PageHeader
 * with one phone primary (Save, icon-only check, submits the form by id),
 * Duplicate/Split/Delete in the overflow menu. Delete asks first in the shared confirm dialog (lot-locked rows offer
 * "Reallocate & delete"; no connection queues a simple row).
 * Back, save and delete all navigate to returnTo (validated) or /transactions.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate, useSWRConfig } from "swr";
import { Copy, Split, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/mobile";
import type { MoreItem } from "@/components/mobile";
import { EditDeleteDialog } from "@/components/transactions/entry/edit-delete-dialog";
import { EditDetails } from "@/components/transactions/entry/edit-details";
import { useTransactionDelete } from "@/lib/transactions/use-transaction-delete";
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
  /** Stored splits of the row (read-only count in Details). */
  splitCount?: number | null;
}

export function TransactionEditForm({
  initialState,
  accounts,
  categories,
  holdings,
  returnTo,
  splitCount,
}: TransactionEditFormProps) {
  const router = useRouter();
  const { mutate: swrMutate, cache } = useSWRConfig();
  const isTransfer = initialState.kind === "transfer-edit";
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);

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
  const del = useTransactionDelete<NonNullable<typeof editingTx>>({
    onDeleted: () => {
      refreshLists();
      goBack();
    },
  });

  const more: MoreItem[] = isTransfer
    ? [{ label: "Delete transfer", icon: Trash2, destructive: true, onSelect: () => setTransferConfirmOpen(true) }]
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
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => editingTx && del.open(editingTx) },
      ];

  return (
    <div data-testid="tx-edit-root" className="w-full">
      <PageHeader
        title={isTransfer ? "Edit transfer" : "Edit transaction"}
        back={{ href: returnTo }}
        more={more}
        primary={{
          kind: "save",
          label: "Save",
          form: FORM_ID,
          busy: f.saving,
          disabled: f.saving || f.transferDeleting,
          testId: "tx-edit-save",
        }}
      />
      <div className={`mt-3 px-4 ${TW.form} ${TW.formPad}`}>
        <TransactionFormBody
          f={f}
          variant="page"
          formId={FORM_ID}
          onLinkedSiblingClick={(s) => router.push(transactionEditHref(s.id, returnTo))}
        />
        {editingTx && <EditDetails tx={editingTx} splitCount={splitCount} />}
      </div>

      <EditDeleteDialog
        open={isTransfer ? transferConfirmOpen : del.target !== null}
        onOpenChange={(open) => {
          if (open) return;
          if (isTransfer) setTransferConfirmOpen(false);
          else del.close();
        }}
        isTransfer={isTransfer}
        deleting={isTransfer ? f.transferDeleting : del.deleting}
        error={isTransfer ? null : del.error}
        onConfirm={() => {
          if (isTransfer) {
            setTransferConfirmOpen(false);
            void f.handleTransferDelete();
          } else {
            void del.confirm();
          }
        }}
        blocked={del.blocked}
        preview={del.preview}
        previewLoading={del.previewLoading}
        onReallocate={() => void del.reallocate()}
      />
    </div>
  );
}
