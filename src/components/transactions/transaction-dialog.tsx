"use client";

/**
 * TransactionDialog — Add/Edit Transaction dialog. Still used for the
 * create-mode callers (accounts/[id], reconcile/import materialize). Edit
 * flows are full pages: /transactions/[id]/edit and
 * /transactions/transfer/[linkId]/edit (PKG1).
 *
 * Form state and save logic: use-transaction-form.ts. Fields: transaction-form-body.tsx.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRightLeft } from "lucide-react";
import { type TransactionSource } from "@/lib/tx-source";
import { RuleEditorDialog } from "@/components/rules/rule-editor-dialog";
import { useTransactionForm } from "./use-transaction-form";
import { TransactionFormBody } from "./transaction-form-body";

// ─── Public types ──────────────────────────────────────────────────────

export interface DialogAccount {
  id: number;
  name: string;
  currency: string;
  alias?: string | null;
  type?: string | null;
  isInvestment?: boolean;
  /** Archived accounts are hidden when CREATING but kept when EDITING — an
   *  existing transaction may well belong to one, and dropping it from the
   *  list would blank out the account select on an otherwise valid row. Same
   *  `!!editId ||` idiom as `isInvestment`. */
  archived?: boolean;
}

export interface DialogCategory {
  id: number;
  name: string;
  type: string;
  group: string;
}

export interface DialogHolding {
  id: number;
  accountId: number | null;
  name: string;
  symbol: string | null;
  accountName: string | null;
  currentShares?: number | null;
}

export interface DialogTransaction {
  id: number;
  date: string;
  accountId: number;
  categoryId: number;
  currency: string;
  amount: number;
  enteredAmount?: number | null;
  enteredCurrency?: string | null;
  enteredFxRate?: number | null;
  quantity: number | null;
  portfolioHolding: string | null;
  note: string;
  payee: string;
  tags: string;
  isBusiness: number | null;
  linkId: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  source?: TransactionSource | null;
}

export interface DialogLinkedSibling {
  id: number;
  date: string;
  accountId: number | null;
  accountName: string | null;
  accountCurrency: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryType: string | null;
  amount: number;
  currency: string;
  enteredAmount: number | null;
  enteredCurrency: string | null;
  enteredFxRate: number | null;
  quantity: number | null;
  portfolioHolding: string | null;
  payee: string | null;
  note: string | null;
  tags: string | null;
}

export interface TransactionFormValues {
  date: string;
  accountId: string;
  categoryId: string;
  currency: string;
  amount: string;
  payee: string;
  note: string;
  tags: string;
  isBusiness: boolean;
  quantity: string;
  portfolioHoldingId: string;
}

export type TransactionDialogInitialState =
  | {
      kind: "transaction-edit";
      tx: DialogTransaction;
      linkedSiblings?: DialogLinkedSibling[];
    }
  | {
      kind: "transfer-edit";
      debit: DialogTransaction;
      credit: DialogTransaction;
      linkId: string;
    }
  | {
      kind: "transaction-prefill";
      values: Partial<TransactionFormValues>;
      /** Optional Transfer-tab seed (reconcile materialize, 2026-06-04). When
       *  present, the Transfer tab is pre-filled from the same bank row so
       *  switching tabs no longer wipes the context. A non-empty `toAccountId`
       *  (sourced from a matched `create_transfer` rule) also opens the dialog
       *  directly in Transfer mode. */
      transferSeed?: {
        fromAccountId?: string;
        toAccountId?: string;
        date?: string;
        amount?: string;
        note?: string;
      };
    }
  | {
      /** Open in Transfer mode (Quick-add Transfer entry). `fromAccountId`
       *  optionally presets the source account (account page "Transfer"). */
      kind: "transfer-create";
      fromAccountId?: string;
    };

export interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: DialogAccount[];
  categories: DialogCategory[];
  holdings: DialogHolding[];
  /** Mode discriminator. Unset = plain create. */
  initialState?: TransactionDialogInitialState | null;
  /** FINLYNQ-125 — opt-in: when true AND the dialog is in new-entry
   *  transaction mode with a payee + category set, offer an "Also create a
   *  rule for next time" affordance (auto-create or seed the RuleEditorDialog).
   *  Wired `true` only from the reconcile/import inbox tabs; the generic
   *  /transactions dialog leaves it at the default (off). */
  offerRuleSuggestion?: boolean;
  /** Invoked after a successful create or update (single tx OR transfer
   *  pair). For transfer mode, `savedTxId` is the debit leg id. */
  onSaved: (
    savedTxId: number,
    ctx: { mode: "create" | "update"; isTransfer: boolean },
  ) => void | Promise<void>;
}


export function TransactionDialog(props: TransactionDialogProps) {
  const { open, onOpenChange } = props;
  const f = useTransactionForm(props);
  const { editId, dialogMode, setDialogMode, setSubmitError, ruleEditorOpen, ruleSeed, ruleSeedName, ruleSeedConditions, ruleSeedActions, ruleEditorCategories, ruleEditorAccounts, ruleEditorHoldings, setRuleEditorOpen, setRuleSeed } = f;
  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) f.resetOnClose();
      }}
    >
      <DialogContent className="regular:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {dialogMode === "transfer"
              ? editId
                ? "Edit Transfer"
                : "New Transfer"
              : editId
                ? "Edit Transaction"
                : "New Transaction"}
          </DialogTitle>
        </DialogHeader>

        {!editId && (
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5 self-start">
            <button
              type="button"
              onClick={() => {
                setDialogMode("transaction");
                setSubmitError(null);
              }}
              className={`px-3 py-1 text-sm rounded transition-colors ${dialogMode === "transaction" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Transaction
            </button>
            <button
              type="button"
              onClick={() => {
                setDialogMode("transfer");
                setSubmitError(null);
              }}
              className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1.5 ${dialogMode === "transfer" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer
            </button>
          </div>
        )}
        <TransactionFormBody
          f={f}
          variant="dialog"
        />
      </DialogContent>
    </Dialog>

    {/* Rule editor: TODO(PKG1 tx-edit) — package 5 owns the rule routes; once /settings/rules/new exists,
        route "Customize…" there instead of this sibling dialog. */}
    {/* Rule editor — SIBLING of the main dialog (NOT nested), so it opens as
        the main dialog closes on the "Customize…" path. Nesting two base-ui
        dialogs triggers stacking bugs (CLAUDE.md base-ui handoff). Seeded with
        the same payee + category the user just chose; the user can refine
        (exact vs contains, add conditions) before creating. */}
    {ruleEditorOpen && ruleSeed && (
      <RuleEditorDialog
        initialName={ruleSeedName}
        initialConditions={ruleSeedConditions}
        initialActions={ruleSeedActions}
        categories={ruleEditorCategories}
        accounts={ruleEditorAccounts}
        holdings={ruleEditorHoldings}
        submitLabel="Create rule"
        title="Create rule from this transaction"
        onClose={() => {
          setRuleEditorOpen(false);
          setRuleSeed(null);
        }}
        onSubmit={async (payload) => {
          try {
            const res = await fetch("/api/rules", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              return { ok: false, error: data?.error ?? "Rule creation failed" };
            }
            return { ok: true };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : "Rule creation failed" };
          }
        }}
      />
    )}
    </>
  );
}
