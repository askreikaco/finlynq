"use client";

/**
 * TransactionSplitForm — Split transaction as a full page (PKG1 tx-edit).
 * Replaces split-dialog.tsx. Same rows (category, account, amount, note,
 * description, tags), same balance rule (rows must sum to the total), and the
 * same POST/DELETE /api/transactions/splits payloads as the dialog. Layout:
 * one ListCard per row with the New Transaction row primitives and pickers.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate, useSWRConfig } from "swr";
import { Check, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/amount-input";
import { formatCurrency } from "@/lib/currency";
import { revalidateTransactionLists } from "@/lib/transactions/revalidate";
import { FormRow } from "@/app/(app)/transactions/new/_components/form-row";
import { ListCard } from "@/app/(app)/transactions/new/_components/list-card";
import { CategorySelector } from "@/app/(app)/transactions/new/_components/category-selector";
import { AccountSelector } from "@/app/(app)/transactions/new/_components/account-selector";

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
  archived?: boolean;
  isInvestment?: boolean;
}
export interface SplitTotal {
  id: number;
  amount: number;
  currency: string;
}

export interface SplitRowState {
  categoryId: string;
  accountId: string;
  amount: string;
  note: string;
  description: string;
  tags: string;
}

const emptyRow = (amount = ""): SplitRowState => ({
  categoryId: "",
  accountId: "",
  amount,
  note: "",
  description: "",
  tags: "",
});

/** Existing splits from GET /api/transactions/splits, or one empty row carrying the full total. */
export function rowsFromSplits(
  data: Array<{ categoryId: number | null; accountId: number | null; amount: number; note: string | null; description: string | null; tags: string | null }>,
  totalAmount: number,
): SplitRowState[] {
  if (data.length > 0) {
    return data.map((s) => ({
      categoryId: s.categoryId ? String(s.categoryId) : "",
      accountId: s.accountId ? String(s.accountId) : "",
      amount: String(s.amount),
      note: s.note ?? "",
      description: s.description ?? "",
      tags: s.tags ?? "",
    }));
  }
  return [emptyRow(String(Math.abs(totalAmount)))];
}

export function TransactionSplitForm({
  transactionId,
  total,
  categories,
  accounts,
  initialRows,
  hasSplitsInitially,
  returnTo,
}: {
  transactionId: number;
  total: SplitTotal;
  categories: SplitCategory[];
  accounts: SplitAccount[];
  initialRows: SplitRowState[];
  hasSplitsInitially: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const { mutate: swrMutate, cache } = useSWRConfig();
  const [rows, setRows] = useState<SplitRowState[]>(initialRows);
  const [hasSplits] = useState(hasSplitsInitially);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Which row a picker is editing: { kind, index } or null.
  const [picker, setPicker] = useState<{ kind: "category" | "account"; index: number } | null>(null);

  const allocated = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const remaining = Math.abs(total.amount) - allocated;
  const isBalanced = Math.abs(remaining) < 0.01;
  const currency = total.currency;

  const categoryById = useMemo(() => new Map(categories.map((c) => [String(c.id), c])), [categories]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [String(a.id), a])), [accounts]);
  // Destination picker for a new split leg: archived accounts excluded (as the dialog did).
  const pickableAccounts = useMemo(() => accounts.filter((a) => a.archived !== true), [accounts]);

  const refresh = () => {
    void revalidateTransactionLists(swrMutate, cache);
    void mutate("/api/accounts");
  };

  function updateRow(index: number, field: keyof SplitRowState, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  async function handleSave() {
    setError("");
    if (rows.length < 2) {
      setError("A split requires at least 2 rows.");
      return;
    }
    if (!isBalanced) {
      setError(`Splits must sum to ${formatCurrency(Math.abs(total.amount), currency)}. Difference: ${formatCurrency(Math.abs(remaining), currency)}`);
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
          splits: rows.map((r) => ({
            categoryId: r.categoryId ? parseInt(r.categoryId) : null,
            accountId: r.accountId ? parseInt(r.accountId) : null,
            amount: sign * Math.abs(parseFloat(r.amount) || 0),
            note: r.note,
            description: r.description,
            tags: r.tags,
          })),
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
    <div data-testid="tx-split-root" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Split transaction"
        backHref={returnTo}
        backLabel="Back"
        actions={
          <Button
            type="button"
            data-testid="tx-split-save"
            onClick={() => void handleSave()}
            disabled={saving || !isBalanced}
            className="h-11 gap-1.5"
          >
            <Check className="size-4" aria-hidden="true" />
            Save splits
          </Button>
        }
      />

      <div className="mt-3 space-y-3 px-4 pb-[calc(var(--sab,0px)+1.5rem)]">
        <ListCard>
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm">
            <span className="text-muted-foreground">Total amount</span>
            <span className="font-mono font-semibold text-foreground">{formatCurrency(Math.abs(total.amount), currency)}</span>
          </div>
        </ListCard>

        {rows.map((row, i) => {
          const cat = categoryById.get(row.categoryId);
          const acc = accountById.get(row.accountId);
          return (
            <ListCard key={i} data-testid={`split-row-${i}`}>
              <FormRow
                variant="button"
                testId={`split-row-${i}-category`}
                label="Category"
                value={cat?.name}
                placeholder="Select Category"
                onClick={() => setPicker({ kind: "category", index: i })}
              />
              <FormRow
                variant="button"
                testId={`split-row-${i}-account`}
                label="Account"
                value={acc?.name}
                placeholder="Select Account"
                onClick={() => setPicker({ kind: "account", index: i })}
              />
              <div className="flex min-h-12 items-center gap-3 px-4">
                <label htmlFor={`split-${i}-amount`} className="w-24 shrink-0 text-sm text-muted-foreground">
                  Amount
                </label>
                <AmountInput
                  id={`split-${i}-amount`}
                  step="0.01"
                  min="0"
                  value={row.amount}
                  onValueChange={(nv) => updateRow(i, "amount", nv)}
                  placeholder="0.00"
                  className="min-w-0 flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                />
              </div>
              <FormRow
                variant="input"
                id={`split-${i}-note`}
                testId={`split-row-${i}-note`}
                label="Note"
                inputValue={row.note}
                onInputChange={(v) => updateRow(i, "note", v)}
                placeholder="Note"
                autoComplete="off"
              />
              <FormRow
                variant="input"
                id={`split-${i}-tags`}
                testId={`split-row-${i}-tags`}
                label="Tags"
                inputValue={row.tags}
                onInputChange={(v) => updateRow(i, "tags", v)}
                placeholder="Comma-separated"
                autoComplete="off"
              />
              <div className="flex min-h-12 items-center justify-end px-4">
                <button
                  type="button"
                  aria-label="Remove split row"
                  disabled={rows.length <= 1}
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-4" aria-hidden="true" /> Remove
                </button>
              </div>
            </ListCard>
          );
        })}

        <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" /> Add row
        </Button>

        <div className="flex items-center justify-between px-1 text-sm">
          <span className="text-muted-foreground">
            Allocated <span className="font-mono text-foreground">{formatCurrency(allocated, currency)}</span>
          </span>
          {isBalanced ? (
            <span className="rounded-full border border-pos/30 bg-pos/10 px-2 py-0.5 text-xs text-pos">Balanced</span>
          ) : (
            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              {remaining > 0
                ? `${formatCurrency(remaining, currency)} left`
                : `${formatCurrency(Math.abs(remaining), currency)} over`}
            </span>
          )}
        </div>

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

      <CategorySelector
        open={picker?.kind === "category"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        categories={categoryPickerEntries}
        selectedCategoryId={picker?.kind === "category" ? rows[picker.index]?.categoryId : undefined}
        onSelect={(id) => {
          if (picker?.kind === "category") updateRow(picker.index, "categoryId", id);
          setPicker(null);
        }}
      />
      <AccountSelector
        open={picker?.kind === "account"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        accounts={pickableAccounts.map((a) => ({ ...a, id: a.id }))}
        selectedAccountId={picker?.kind === "account" ? rows[picker.index]?.accountId : undefined}
        title="Select Account"
        onSelect={(id) => {
          if (picker?.kind === "account") updateRow(picker.index, "accountId", id);
          setPicker(null);
        }}
      />
    </div>
  );
}
