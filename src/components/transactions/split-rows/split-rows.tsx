"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { formatCurrency } from "@/lib/currency";
import {
  computeRemainder,
  ensureRows,
  fromMinor,
  parseAmountMinor,
  parseCount,
  resolveCategories,
  toMinor,
  visibleRows,
  type Remainder,
  type ResolvedCategory,
  type SplitRowModel,
} from "@/lib/transactions/split-math";
import { SplitAmountField } from "./split-amount-field";
import { SplitCountRow } from "./split-count-row";

export type { SplitRowModel } from "@/lib/transactions/split-math";

export interface SplitCategoryOption {
  id: string | number;
  name: string;
}

export interface SplitAccountOption {
  id: number;
  name: string;
}

export interface SplitRowsProps {
  /** Raw count text: "" | "0".."99" (typed). parseCount() decides the effective N (0 or 2..20). */
  count: string;
  /** Parent stores the next count text. SplitRows also fills missing rows in the same change. */
  onCountChange: (next: string) => void;
  /** Full row array, including the hidden tail beyond N (kept so growing again restores it). */
  rows: SplitRowModel[];
  onRowsChange: (rows: SplitRowModel[]) => void;
  /** Parent amount in `currency` (sign ignored). */
  parentAmount: number;
  currency: string;
  /** Inheritance source for row 1 ("" = none). */
  parentCategoryId: string;
  /** Context line only. */
  parentPayee?: string;
  categories: SplitCategoryOption[];
  /** Split page only: rows with a non-null accountId show a read-only "Account: x" chip. */
  accounts?: SplitAccountOption[];
  /** Parent owns the CategorySelector; SplitRows only reports which row's chip was tapped. */
  onOpenCategory: (rowId: string) => void;
  /** Row whose amount the shared numpad is writing to (highlighted). */
  padTargetRowId: string | null;
  /** An editable amount got focus: the parent opens the numpad for this row. */
  onOpenPad: (rowId: string) => void;
  /** Note, count or chip got focus/tap: the parent closes the numpad. */
  onClosePad: () => void;
  /** False hides the whole block (Transfer). Defaults to true. */
  showCount?: boolean;
  /** Prefix for DOM ids and generated row ids, e.g. "txnew-split" or "tx-split". */
  idPrefix: string;
}

export interface ValidateSplitsArgs {
  count: string;
  rows: readonly SplitRowModel[];
  parentAmount: number;
  currency: string;
  parentCategoryId: string;
}

export interface SplitValidation {
  /** True only when N >= 2, the parent amount is > 0, and nothing blocks saving. */
  canSave: boolean;
  /** Effective N (0 or 2..20). */
  n: number;
  /** Per-row message, keyed by row id. Shown under the row. */
  rowErrors: Record<string, string>;
  /** Status-line error (remainder zero or negative). */
  formError?: string;
  /** First save-time message in row order (remainder error last). For the parent's save toast. */
  firstError?: string;
  /** Row to focus for firstError (undefined when the error is the remainder). */
  firstErrorRowId?: string;
  /** Visible rows (first N). */
  visible: SplitRowModel[];
  /** Effective category per visible row. id "" = unresolvable. */
  resolved: ResolvedCategory[];
  /** Major-unit amounts per visible row; the last is the computed remainder. */
  amounts: number[];
  remainder: Remainder | null;
}

/** Rows filled to N; missing rows get ids `${prefix}-row-${index}` (index-based, so keys stay stable). */
function fillRows(rows: readonly SplitRowModel[], n: number, prefix: string): SplitRowModel[] {
  const start = rows.length;
  let k = 0;
  return ensureRows(rows, n, () => `${prefix}-row-${start + k++}`);
}

/**
 * Single source of split validation for both screens (new entry and split page).
 * Only the first N rows are checked; hidden rows are never validated or saved.
 * Messages: "Enter an amount", "Amount must be more than 0", "Choose a category" (per row);
 * "Splits exceed the total by {x}" and "Last split is 0 — lower the other splits or use fewer
 * splits" (status line). Parent amount <= 0 blocks save without a split error (the parent
 * shows its own amount error).
 */
export function validateSplits(args: ValidateSplitsArgs): SplitValidation {
  const { count, rows, parentAmount, currency, parentCategoryId } = args;
  const n = parseCount(count).n;
  if (n < 2) {
    return {
      canSave: false,
      n,
      rowErrors: {},
      visible: [],
      resolved: [],
      amounts: [],
      remainder: null,
    };
  }

  const visible = visibleRows(fillRows(rows, n, "split-missing"), n);
  const resolved = resolveCategories(visible, parentCategoryId);
  const remainder = computeRemainder(visible, parentAmount, currency);
  const parentValid = toMinor(parentAmount, currency) > 0;

  const rowErrors: Record<string, string> = {};
  const amounts: number[] = [];
  let firstError: string | undefined;
  let firstErrorRowId: string | undefined;
  const fail = (rowId: string, rowMessage: string, saveMessage: string) => {
    if (!(rowId in rowErrors)) rowErrors[rowId] = rowMessage;
    if (firstError === undefined) {
      firstError = saveMessage;
      firstErrorRowId = rowId;
    }
  };

  visible.forEach((row, i) => {
    const label = i + 1;
    if (i < n - 1) {
      const minor = parseAmountMinor(row.amount, currency);
      if (minor === null) {
        fail(row.id, "Enter an amount", `Enter an amount for split ${label}`);
        amounts.push(0);
      } else {
        if (minor <= 0) {
          fail(row.id, "Amount must be more than 0", `Amount must be more than 0 for split ${label}`);
        }
        amounts.push(fromMinor(minor, currency));
      }
    }
    if (resolved[i].id === "") {
      fail(row.id, "Choose a category", `Choose a category for split ${label}`);
    }
  });

  let formError: string | undefined;
  if (parentValid && remainder.flag === "negative") {
    formError = `Splits exceed the total by ${formatCurrency(fromMinor(-remainder.minor, currency), currency)}`;
  } else if (parentValid && remainder.flag === "zero") {
    formError = "Last split is 0 — lower the other splits or use fewer splits";
  }
  if (formError !== undefined && firstError === undefined) firstError = formError;

  return {
    canSave: parentValid && firstError === undefined,
    n,
    rowErrors,
    formError,
    firstError,
    firstErrorRowId,
    visible,
    resolved,
    amounts: [...amounts, remainder.amount],
    remainder,
  };
}

/**
 * Controlled split editor: count field, context line, one card per visible row, status line.
 * No Add/Delete buttons: the count creates and hides rows. The last visible row is the
 * computed remainder (read-only). All state lives in the parent; this renders from props.
 */
export function SplitRows({
  count,
  onCountChange,
  rows,
  onRowsChange,
  parentAmount,
  currency,
  parentCategoryId,
  parentPayee,
  categories,
  accounts,
  onOpenCategory,
  padTargetRowId,
  onOpenPad,
  onClosePad,
  showCount = true,
  idPrefix,
}: SplitRowsProps) {
  const effectiveCount = showCount ? count : "";
  const parsed = parseCount(effectiveCount);
  const n = parsed.n;
  const view = n >= 2 ? fillRows(rows, n, idPrefix) : rows;
  const result = validateSplits({
    count: effectiveCount,
    rows: view,
    parentAmount,
    currency,
    parentCategoryId,
  });

  if (!showCount) return null;

  const parentValid = toMinor(parentAmount, currency) > 0;
  const remainderFlag = parentValid && result.remainder ? result.remainder.flag : "ok";
  const allocatedMinor = result.visible
    .slice(0, -1)
    .reduce((sum, row) => sum + (parseAmountMinor(row.amount, currency) ?? 0), 0);

  const handleCountChange = (next: string) => {
    onCountChange(next);
    const nextN = parseCount(next).n;
    if (nextN < 2) return;
    let nextRows = fillRows(rows, nextN, idPrefix);
    // Growing: the former remainder row becomes an editable row with an empty amount.
    if (n >= 2 && nextN > n) {
      nextRows = nextRows.map((row, i) => (i === n - 1 ? { ...row, amount: "" } : row));
    }
    onRowsChange(nextRows);
  };

  const updateRow = (rowId: string, patch: Partial<SplitRowModel>) => {
    onRowsChange(view.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const categoryName = (id: string) => categories.find((c) => String(c.id) === id)?.name;
  const accountName = (id: string) => accounts?.find((a) => String(a.id) === id)?.name ?? id;

  return (
    <div data-testid={`${idPrefix}-rows`} className="space-y-3">
      <SplitCountRow
        id={`${idPrefix}-count`}
        value={count}
        hint={parsed.hint}
        onChange={handleCountChange}
        onFocus={onClosePad}
      />

      {n >= 2 && (
        <p data-testid={`${idPrefix}-context`} className="px-1 text-xs text-muted-foreground">
          {`Payee ${parentPayee || "—"} · Total ${formatCurrency(Math.abs(parentAmount), currency)}`}
        </p>
      )}

      {result.visible.map((row, i) => {
        const num = i + 1;
        const isLast = i === n - 1;
        const resolvedCategory = result.resolved[i];
        const unresolved = resolvedCategory.id === "";
        const name = unresolved ? undefined : (categoryName(resolvedCategory.id) ?? "Category");
        const chipLabel = unresolved
          ? "Choose category"
          : resolvedCategory.inherited
            ? `${name} · same as above`
            : name;
        const noteId = `${idPrefix}-note-${num}`;
        const rowError = result.rowErrors[row.id];

        return (
          <section
            key={row.id}
            data-testid={`split-row-${num}`}
            className={cn("rounded-group border border-border bg-card", TW.group)}
          >
            <div className="flex items-center justify-between gap-2 px-4 pt-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <span>{isLast ? `Split ${num} · Remaining` : `Split ${num}`}</span>
            </div>

            <SplitAmountField
              id={`${idPrefix}-amount-${num}`}
              ariaLabel={`Split ${num} amount`}
              testId={`split-amount-${num}`}
              currency={currency}
              value={isLast ? (parentValid && result.remainder ? result.remainder.text : "—") : row.amount}
              readOnly={isLast}
              invalid={isLast ? remainderFlag !== "ok" : rowError !== undefined}
              active={!isLast && padTargetRowId === row.id}
              onChange={isLast ? undefined : (value) => updateRow(row.id, { amount: value })}
              onOpenPad={isLast ? undefined : () => onOpenPad(row.id)}
            />

            <div className={cn("flex items-center gap-3 px-4", TW.rowTall)}>
              <label
                htmlFor={noteId}
                className={cn("shrink-0 text-sm text-muted-foreground", TW.rowLabelNarrow)}
              >
                Note
              </label>
              <input
                id={noteId}
                type="text"
                data-testid={`split-note-${num}`}
                aria-label={`Split ${num} note`}
                placeholder="Note (optional)"
                value={row.note}
                onChange={(e) => updateRow(row.id, { note: e.target.value })}
                onFocus={() => onClosePad()}
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              <button
                type="button"
                data-testid={`split-category-${num}`}
                onClick={() => {
                  onClosePad();
                  onOpenCategory(row.id);
                }}
                className={cn(
                  "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-sm transition-colors active:bg-muted",
                  unresolved ? "border-warning text-warning" : "border-input text-foreground",
                )}
              >
                <span className="truncate">{chipLabel}</span>
              </button>
              {row.accountId && accounts && (
                <span
                  data-testid={`split-account-${num}`}
                  className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                >
                  {`Account: ${accountName(row.accountId)}`}
                </span>
              )}
            </div>

            {rowError && (
              <p data-testid={`split-error-${num}`} className="px-4 pb-2 text-xs text-destructive">
                {rowError}
              </p>
            )}
          </section>
        );
      })}

      {n >= 2 && (
        <div data-testid={`${idPrefix}-status`} className="flex items-center justify-between gap-3 px-1 text-sm">
          <span className="text-muted-foreground">
            {`Allocated ${formatCurrency(fromMinor(allocatedMinor, currency), currency)} of ${formatCurrency(Math.abs(parentAmount), currency)}`}
          </span>
          {result.formError && (
            <span data-testid="split-status-error" className="font-medium text-neg">
              {result.formError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
