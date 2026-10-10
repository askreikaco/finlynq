"use client";

/**
 * TransactionSplitForm: split an existing transaction as a full page (S-5).
 * Uses the same SplitRows editor as the new-entry screen: count field, one card per
 * row, read-only remainder on the last row, NumpadDock for every amount. Saves through
 * POST/DELETE /api/transactions/splits. accountId/description/tags of loaded rows are
 * round-tripped (not shown). Validation is validateSplits (single source of messages).
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate, useSWRConfig } from "swr";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { TW } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";
import { currencyDecimals, formatCurrency } from "@/lib/currency";
import { revalidateTransactionLists } from "@/lib/transactions/revalidate";
import { parseCount, rowsFromSavedSplits, type SplitAdjustment, type SplitRowModel } from "@/lib/transactions/split-math";
import { FormRow } from "@/components/forms";
import { ListCard } from "@/app/(app)/transactions/new/_components/list-card";
import { CategorySelector } from "@/app/(app)/transactions/new/_components/category-selector";
import { NumpadDock } from "@/app/(app)/transactions/new/_components/numpad-dock";
import { SplitRows, validateSplits } from "@/components/transactions/split-rows";

export interface SplitCategory {
  id: number;
  name: string;
  type: string;
  group: string;
}
export interface SplitAccount {
  id: number;
  name: string;
  currency: string;
  type?: string | null;
  group?: string | null;
  archived?: boolean;
  isInvestment?: boolean;
}
export interface SplitTotal {
  id: number;
  amount: number;
  currency: string;
  categoryId: number | null;
  payee: string | null;
}

/** One saved split row as returned by GET /api/transactions/splits. */
export interface SavedSplitRow {
  categoryId: number | null;
  accountId: number | null;
  amount: number;
  note: string | null;
  description: string | null;
  tags: string | null;
}

export interface SplitEditorSeed {
  /** Raw count text ("2" for no saved splits, else the saved count). */
  count: string;
  rows: SplitRowModel[];
  /** One-time notice when saved splits did not sum to the total. */
  adjustment: SplitAdjustment | null;
}

const blankRow = (id: string): SplitRowModel => ({ id, categoryId: "", amount: "", note: "" });

/**
 * Editor state from the saved splits. No saved splits: two blank rows (row 1 typed,
 * row 2 = remainder). Saved splits: amounts made absolute (R2); if they do not sum to
 * the total, the last row becomes the remainder and `adjustment` is set (R6).
 */
export function seedSplitEditor(saved: readonly SavedSplitRow[], parentAmount: number, currency: string): SplitEditorSeed {
  if (saved.length === 0) {
    return { count: "2", rows: [blankRow("tx-split-row-0"), blankRow("tx-split-row-1")], adjustment: null };
  }
  const result = rowsFromSavedSplits(
    saved.map((s, i) => ({
      id: `tx-split-row-${i}`,
      categoryId: s.categoryId ? String(s.categoryId) : "",
      accountId: s.accountId ? String(s.accountId) : "",
      amount: s.amount,
      note: s.note ?? "",
      description: s.description ?? "",
      tags: s.tags ?? "",
    })),
    Math.abs(parentAmount),
    currency,
  );
  return { count: String(saved.length), rows: result.rows, adjustment: result.adjustment };
}

export function TransactionSplitForm({
  transactionId,
  total,
  categories,
  accounts,
  initialSeed,
  hasSplitsInitially,
  returnTo,
}: {
  transactionId: number;
  total: SplitTotal;
  categories: SplitCategory[];
  accounts: SplitAccount[];
  initialSeed: SplitEditorSeed;
  hasSplitsInitially: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const { mutate: swrMutate, cache } = useSWRConfig();
  const [count, setCount] = useState(initialSeed.count);
  const [rows, setRows] = useState<SplitRowModel[]>(initialSeed.rows);
  const [notice] = useState<SplitAdjustment | null>(initialSeed.adjustment);
  const [padRowId, setPadRowId] = useState<string | null>(null);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [hasSplits] = useState(hasSplitsInitially);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currency = total.currency;
  const parentAbs = Math.abs(total.amount);
  const parentCategoryId = total.categoryId ? String(total.categoryId) : "";
  const verdict = validateSplits({ count, rows, parentAmount: parentAbs, currency, parentCategoryId });

  const categoryById = useMemo(() => new Map(categories.map((c) => [String(c.id), c])), [categories]);
  const parentCategoryName = categoryById.get(parentCategoryId)?.name ?? "—";
  const pickedRow = pickerRowId ? rows.find((r) => r.id === pickerRowId) : undefined;
  const padRow = padRowId ? rows.find((r) => r.id === padRowId) : undefined;

  const refresh = () => {
    void revalidateTransactionLists(swrMutate, cache);
    void mutate("/api/accounts");
  };

  function updateRow(rowId: string, patch: Partial<SplitRowModel>) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setError("");
    if (!verdict.canSave) {
      setError(verdict.firstError ?? "Splits can't be saved yet.");
      return;
    }
    setSaving(true);
    try {
      const sign = total.amount < 0 ? -1 : 1;
      const res = await fetch("/api/transactions/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          splits: verdict.visible.map((row, i) => {
            const categoryId = verdict.resolved[i].id;
            return {
              categoryId: categoryId ? parseInt(categoryId) : null,
              accountId: row.accountId ? parseInt(row.accountId) : null,
              amount: sign * Math.abs(verdict.amounts[i]),
              note: row.note,
              description: row.description ?? "",
              tags: row.tags ?? "",
            };
          }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save splits");
        return;
      }
      refresh();
      router.push(returnTo);
    } catch {
      setError("Failed to save splits");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearSplits() {
    setSaving(true);
    try {
      await fetch(`/api/transactions/splits?transactionId=${transactionId}`, { method: "DELETE" });
      refresh();
      router.push(returnTo);
    } catch {
      setError("Failed to clear splits");
    } finally {
      setSaving(false);
    }
  }

  const categoryPickerEntries = categories.map((c) => ({ ...c, id: c.id }));

  return (
    <div
      data-testid="tx-split-root"
      className={cn("mx-auto w-full", TW.form, padRowId !== null && "pointer-coarse:pb-[209px]")}
    >
      <PageHeader
        title="Split transaction"
        backHref={returnTo}
        backLabel="Back"
        actions={
          <Button
            type="button"
            data-testid="tx-split-save"
            onClick={() => void handleSave()}
            disabled={saving || !verdict.canSave}
            className="h-11 gap-1.5"
          >
            <Check className="size-4" aria-hidden="true" />
            Save splits
          </Button>
        }
      />

      <div className={`mt-3 space-y-3 px-4 ${TW.formPad}`}>
        <ListCard>
          <FormRow variant="custom" label="Total amount" labelWidth="narrow" height="tall">
            <span className="font-mono font-semibold text-foreground">{formatCurrency(parentAbs, currency)}</span>
          </FormRow>
          <FormRow variant="custom" label="Category" labelWidth="narrow" height="tall">
            <span data-testid="tx-split-category" className="text-sm text-foreground">
              {parentCategoryName}
            </span>
          </FormRow>
        </ListCard>

        {notice && (
          <p data-testid="tx-split-adjusted" role="status" className="px-1 text-xs text-muted-foreground">
            {`Last split adjusted from ${formatCurrency(notice.from, currency)} to ${formatCurrency(notice.to, currency)} to match the total.`}
          </p>
        )}

        <SplitRows
          idPrefix="tx-split"
          count={count}
          onCountChange={setCount}
          rows={rows}
          onRowsChange={setRows}
          parentAmount={parentAbs}
          currency={currency}
          parentCategoryId={parentCategoryId}
          parentPayee={total.payee ?? undefined}
          categories={categories}
          accounts={accounts}
          onOpenCategory={(rowId) => setPickerRowId(rowId)}
          padTargetRowId={padRowId}
          onOpenPad={(rowId) => setPadRowId(rowId)}
          onClosePad={() => setPadRowId(null)}
        />

        {verdict.n < 2 && parseCount(count).hint === null && (
          <p data-testid="tx-split-hint" className="px-1 text-xs text-muted-foreground">
            {hasSplits ? "Enter 2 or more, or use Clear splits" : "Enter 2 or more to split"}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {hasSplits && (
          <Button type="button" variant="outline" className="h-11 w-full text-destructive" disabled={saving} onClick={() => void handleClearSplits()}>
            Clear splits
          </Button>
        )}
      </div>

      <NumpadDock
        activeId={padRowId}
        activeValue={padRow?.amount ?? ""}
        onChange={(id, value) => updateRow(id, { amount: value })}
        onDone={() => setPadRowId(null)}
        decimals={currencyDecimals(currency)}
      />

      <CategorySelector
        open={pickerRowId !== null}
        onOpenChange={(open) => {
          if (!open) setPickerRowId(null);
        }}
        categories={categoryPickerEntries}
        selectedCategoryId={pickedRow?.categoryId}
        onSelect={(id) => {
          if (pickerRowId !== null) updateRow(pickerRowId, { categoryId: id });
          setPickerRowId(null);
        }}
      />
    </div>
  );
}
