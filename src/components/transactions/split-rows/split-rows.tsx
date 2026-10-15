"use client";

import * as React from "react";

import { Split, StickyNote } from "lucide-react";

import { cn } from "@/lib/utils";
import { currencyDecimals, formatCurrency } from "@/lib/currency";
import { Field, FieldGroup } from "@/components/ui/field";
import { evaluateAmountExpression } from "@/lib/transactions/amount-expression";
import {
  computeRemainder,
  ensureRows,
  fromMinor,
  minorToText,
  parseAmountMinor,
  parseCount,
  resolveCategories,
  MAX_SPLITS,
  toMinor,
  visibleRows,
  type CountHint,
  type Remainder,
  type ResolvedCategory,
  type SplitRowModel,
} from "@/lib/transactions/split-math";

export type { SplitRowModel } from "@/lib/transactions/split-math";

/**
 * "entry": New Expense. Rows inherit the parent category and currency, have no category or account
 * chip, and show no context or allocated line. "page": split an existing transaction (per-row chips).
 */
export type SplitRowsVariant = "entry" | "page";

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
  /** Context line only ("page" variant). */
  parentPayee?: string;
  /** Per-row category chip labels ("page" variant). */
  categories?: SplitCategoryOption[];
  /** Split page only: rows with a non-null accountId show a read-only "Account: x" chip. */
  accounts?: SplitAccountOption[];
  /** Parent owns the CategorySelector; SplitRows only reports which row's chip was tapped ("page" variant). */
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
  /**
   * "Enter an amount" shows only when this is true for the row. A boolean applies to every row;
   * a function is evaluated per row id (the parent tracks touched rows). Defaults to true.
   * Save is still blocked, and the status line names the first hidden error.
   */
  showEmptyErrors?: boolean | ((rowId: string) => boolean);
  /** An editable amount lost focus: the parent marks that row touched. */
  onRowBlur?: (rowId: string) => void;
  /** Default "page". New Expense passes "entry". */
  variant?: SplitRowsVariant;
  /** True: the parent renders the count field itself (the entry Split accordion header); rows render as usual. */
  hideCount?: boolean;
}

export interface ValidateSplitsArgs {
  count: string;
  rows: readonly SplitRowModel[];
  parentAmount: number;
  currency: string;
  parentCategoryId: string;
  /** Default "page". "entry": no per-row category; a missing parent category is one status error. */
  variant?: SplitRowsVariant;
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

const CHOOSE_PARENT_CATEGORY = "Choose a category first";

/** Rows filled to N; missing rows get ids `${prefix}-row-${index}` (index-based, so keys stay stable). */
function fillRows(rows: readonly SplitRowModel[], n: number, prefix: string): SplitRowModel[] {
  const start = rows.length;
  let k = 0;
  return ensureRows(rows, n, () => `${prefix}-row-${start + k++}`);
}

/**
 * Rows after the count changes from `prevN` to `nextN` (both effective, 0 or 2..20): filled to nextN, and when
 * growing the former remainder row becomes an editable row with an empty amount. Shared by SplitRows and the
 * entry Split accordion header.
 */
export function rowsForCount(
  rows: readonly SplitRowModel[],
  prevN: number,
  nextN: number,
  prefix: string,
): SplitRowModel[] {
  let nextRows = fillRows(rows, nextN, prefix);
  if (prevN >= 2 && nextN > prevN) {
    nextRows = nextRows.map((row, i) => (i === prevN - 1 ? { ...row, amount: "" } : row));
  }
  return nextRows;
}

/**
 * Single source of split validation for both screens (new entry and split page).
 * Only the first N rows are checked; hidden rows are never validated or saved.
 * Messages: "Enter an amount", "Amount must be more than 0" (per row); "Choose a category" (per row,
 * "page" only); "Choose a category first" (status, "entry" with no parent category);
 * "Splits exceed the total by {x}" and "Last split is 0 — lower the other splits or use fewer
 * splits" (status line). Parent amount <= 0 blocks save without a split error (the parent
 * shows its own amount error).
 */
export function validateSplits(args: ValidateSplitsArgs): SplitValidation {
  const { count, rows, parentAmount, currency, parentCategoryId, variant = "page" } = args;
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
  // Sign-agnostic: expenses carry a negative total, the split uses its magnitude.
  const parentAbs = Math.abs(parentAmount);
  const remainder = computeRemainder(visible, parentAbs, currency);
  const parentValid = toMinor(parentAbs, currency) > 0;

  const rowErrors: Record<string, string> = {};
  const amounts: number[] = [];
  // Entry rows inherit the parent category: a missing parent category is one status error, not per row.
  const categoryMissing = variant === "entry" && parentCategoryId === "";
  let firstError: string | undefined = categoryMissing ? CHOOSE_PARENT_CATEGORY : undefined;
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
    if (variant === "page" && resolved[i].id === "") {
      fail(row.id, "Choose a category", `Choose a category for split ${label}`);
    }
  });

  let formError: string | undefined;
  if (categoryMissing) {
    formError = CHOOSE_PARENT_CATEGORY;
  } else if (parentValid && remainder.flag === "negative") {
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

const COUNT_HINT_TEXT: Record<CountHint, string> = {
  "enter-two-or-more": "Enter 2 or more to split",
  "up-to-20": "Up to 20 splits",
};

/** Hint text under the count field. */
export const SPLIT_COUNT_HINT_TEXT = COUNT_HINT_TEXT;

/**
 * Stepper rule for the entry variant. "+" from empty/0/1 goes to 2, otherwise +1 up to 20.
 * "-" from 2 goes to empty ("none"), otherwise -1. Empty and 0 cannot go lower.
 */
export function stepCount(value: string, delta: 1 | -1): string {
  const current = /^\d+$/.test(value) ? Number(value) : 0;
  if (delta > 0) {
    if (current < 2) return "2";
    return String(Math.min(MAX_SPLITS, current + 1));
  }
  if (current <= 0) return "";
  if (current === 2) return "";
  return String(current - 1);
}

/** The shared amount Field of a split row: numpad on touch (inputMode none), expressions settle on blur. */
function splitAmountField(args: {
  id: string;
  ariaLabel: string;
  testId: string;
  label: React.ReactNode;
  currency: string;
  showCurrency?: boolean;
  value: string;
  readOnly?: boolean;
  invalid?: boolean;
  active?: boolean;
  error?: string;
  onChange?: (value: string) => void;
  onOpenPad?: () => void;
  onBlur?: () => void;
}) {
  const { id, ariaLabel, testId, label, currency, showCurrency = true, value, readOnly = false, invalid = false, active = false, error, onChange, onOpenPad, onBlur } = args;
  const placeholder = currencyDecimals(currency) > 0 ? "0.00" : "0";
  const settleExpression = () => {
    if (readOnly || !onChange) return;
    const evaluated = evaluateAmountExpression(value);
    if (evaluated === null) return;
    const minor = parseAmountMinor(evaluated, currency);
    if (minor === null) return;
    const settled = minorToText(minor, currency);
    if (settled !== value) onChange(settled);
  };
  return (
    <Field
      label={label}
      id={id}
      aria-label={ariaLabel}
      data-testid={testId}
      aria-readonly={readOnly || undefined}
      readOnly={readOnly}
      tabIndex={readOnly ? -1 : undefined}
      inputMode="none"
      placeholder={placeholder}
      value={value}
      invalid={invalid}
      error={error}
      onChange={(e) => onChange?.(e.target.value)}
      onFocus={readOnly ? undefined : onOpenPad}
      onBlur={() => {
        settleExpression();
        onBlur?.();
      }}
      controlClassName={cn("text-lg font-semibold tabular-nums", invalid && "text-neg")}
      className={cn(active && "rounded-lg ring-1 ring-inset ring-ring")}
      prefix={
        showCurrency ? (
          <span data-slot="split-currency" className="shrink-0 text-sm font-medium text-foreground">
            {currency}
          </span>
        ) : undefined
      }
      suffix={
        readOnly ? (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">auto</span>
        ) : undefined
      }
    />
  );
}

/**
 * Controlled split editor: count field, context line, one card per visible row, status line.
 * No Add/Delete buttons: the count creates and hides rows. The last visible row is the
 * computed remainder (read-only). All state lives in the parent; this renders from props.
 * variant "entry" (New Expense): stepper group card, "#n" rows with no chips, error lines only.
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
  categories = [],
  accounts,
  onOpenCategory,
  padTargetRowId,
  onOpenPad,
  onClosePad,
  showCount = true,
  idPrefix,
  showEmptyErrors = true,
  onRowBlur,
  variant = "page",
  hideCount = false,
}: SplitRowsProps) {
  const entry = variant === "entry";
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
    variant,
  });

  if (!showCount) return null;

  const parentAbs = Math.abs(parentAmount);
  const parentValid = toMinor(parentAbs, currency) > 0;
  const remainderFlag = parentValid && result.remainder ? result.remainder.flag : "ok";
  const allocatedMinor = result.visible
    .slice(0, -1)
    .reduce((sum, row) => sum + (parseAmountMinor(row.amount, currency) ?? 0), 0);

  const handleCountChange = (next: string) => {
    onCountChange(next);
    const nextN = parseCount(next).n;
    if (nextN < 2) return;
    onRowsChange(rowsForCount(rows, n, nextN, idPrefix));
  };

  const updateRow = (rowId: string, patch: Partial<SplitRowModel>) => {
    onRowsChange(view.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const emptyErrorShown = (rowId: string) =>
    typeof showEmptyErrors === "function" ? showEmptyErrors(rowId) : showEmptyErrors;
  // The row's message, unless it is an "Enter an amount" the parent has not revealed yet.
  const visibleRowError = (rowId: string) => {
    const message = result.rowErrors[rowId];
    return message === "Enter an amount" && !emptyErrorShown(rowId) ? undefined : message;
  };
  // Status line: the formError, or the first save-time error when its row hides it.
  const firstErrorHidden =
    result.firstErrorRowId !== undefined && visibleRowError(result.firstErrorRowId) === undefined;
  const statusError = result.formError ?? (firstErrorHidden ? result.firstError : undefined);

  const categoryName = (id: string) => categories.find((c) => String(c.id) === id)?.name;
  const accountName = (id: string) => accounts?.find((a) => String(a.id) === id)?.name ?? id;

  return (
    <div data-testid={`${idPrefix}-rows`} className="space-y-3">
      {!hideCount &&
        (entry ? (
          <FieldGroup>
            <Field
              control="stepper"
              icon={Split}
              label="Splits"
              id={`${idPrefix}-count`}
              data-testid="split-count"
              aria-label="Number of splits"
              stepLabel="splits"
              placeholder="0"
              maxLength={2}
              min={0}
              max={MAX_SPLITS}
              value={count}
              hint={parsed.hint ? COUNT_HINT_TEXT[parsed.hint] : undefined}
              onStep={(delta, current) => stepCount(current, delta)}
              onInteract={onClosePad}
              onValueChange={handleCountChange}
            />
          </FieldGroup>
        ) : (
          <FieldGroup>
            <Field
              icon={Split}
              label="Splits"
              id={`${idPrefix}-count`}
              data-testid="split-count"
              aria-label="Number of splits"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="0"
              value={count}
              hint={parsed.hint ? COUNT_HINT_TEXT[parsed.hint] : undefined}
              onChange={(e) => handleCountChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
              onFocus={() => onClosePad()}
              controlClassName="text-right tabular-nums"
            />
          </FieldGroup>
        ))}

      {!entry && n >= 2 && (
        <p data-testid={`${idPrefix}-context`} data-keep="data" className="px-1 text-xs text-muted-foreground">
          {`Payee ${parentPayee || "—"} · Total ${formatCurrency(parentAbs, currency)}`}
        </p>
      )}

      {result.visible.map((row, i) => {
        const num = i + 1;
        const isLast = i === n - 1;
        const rowError = visibleRowError(row.id);
        const amountValue = isLast ? (parentValid && result.remainder ? result.remainder.text : "—") : row.amount;
        const amountInvalid = isLast ? remainderFlag !== "ok" : rowError !== undefined;
        const noteId = `${idPrefix}-note-${num}`;
        const amount = splitAmountField({
          id: `${idPrefix}-amount-${num}`,
          ariaLabel: `Split ${num} amount`,
          testId: `split-amount-${num}`,
          label: entry ? `#${num}` : "Amount",
          currency,
          showCurrency: !entry,
          value: amountValue,
          readOnly: isLast,
          invalid: amountInvalid,
          active: !isLast && padTargetRowId === row.id,
          error: rowError,
          onChange: isLast ? undefined : (value: string) => updateRow(row.id, { amount: value }),
          onOpenPad: isLast ? undefined : () => onOpenPad(row.id),
          onBlur: isLast ? undefined : () => onRowBlur?.(row.id),
        });
        const note = (
          <Field
            id={noteId}
            label={entry ? `Split ${num} note` : "Note"}
            hideLabel={entry}
            icon={entry ? StickyNote : undefined}
            aria-label={`Split ${num} note`}
            data-testid={`split-note-${num}`}
            placeholder="Note (optional)"
            value={row.note}
            onChange={(e) => updateRow(row.id, { note: e.target.value })}
            onFocus={() => onClosePad()}
          />
        );

        if (entry) {
          return (
            <FieldGroup key={row.id} data-testid={`split-row-${num}`}>
              {amount}
              {note}
            </FieldGroup>
          );
        }

        const resolvedCategory = result.resolved[i];
        const unresolved = resolvedCategory.id === "";
        const name = unresolved ? undefined : (categoryName(resolvedCategory.id) ?? "Category");
        const chipLabel = unresolved
          ? "Choose category"
          : resolvedCategory.inherited
            ? `${name} · same as above`
            : name;

        return (
          <FieldGroup key={row.id} data-testid={`split-row-${num}`} label={isLast ? `Split ${num} · Remaining` : `Split ${num}`}>
            {amount}
            {note}
            <Field
              control="picker"
              label="Category"
              data-testid={`split-category-${num}`}
              value={chipLabel}
              invalid={unresolved}
              onClick={() => {
                onClosePad();
                onOpenCategory(row.id);
              }}
            />
            {row.accountId && accounts && (
              <Field control="custom" label="Account" testId={`split-account-${num}`}>
                <span className="text-base text-foreground">{accountName(row.accountId)}</span>
              </Field>
            )}
          </FieldGroup>
        );
      })}

      {entry
        ? statusError && (
            <p data-testid="split-status-error" className="px-1 text-sm font-medium text-neg">
              {statusError}
            </p>
          )
        : n >= 2 && (
            <div data-testid={`${idPrefix}-status`} className="flex items-center justify-between gap-3 px-1 text-sm">
              <span className="text-muted-foreground">
                {`Allocated ${formatCurrency(fromMinor(allocatedMinor, currency), currency)} of ${formatCurrency(parentAbs, currency)}`}
              </span>
              {statusError && (
                <span data-testid="split-status-error" className="font-medium text-neg">
                  {statusError}
                </span>
              )}
            </div>
          )}
    </div>
  );
}
