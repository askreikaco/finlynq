/**
 * Split math for the transaction split editors (plan S-1). Pure: no React, no I/O.
 *
 * Money is held as integer minor units (currencyDecimals: VND/JPY 0, USD 2) so
 * float drift (0.1 + 0.2) cannot leak into a remainder. Floats appear only at
 * the input/output edges (typed strings in, display strings / numbers out).
 *
 * Known difference: currencyDecimals (Intl) and roundMoney (src/lib/money.ts,
 * fixed 0dp set) disagree for IDR/CLP. Split code always uses currencyDecimals.
 */

import { currencyDecimals } from "@/lib/currency";

export const MAX_SPLITS = 20;

export interface SplitRowModel {
  id: string;
  /** "" = inherit from the row above (row 0 inherits the parent category). */
  categoryId: string;
  /** Typed amount text in the parent's displayed currency. Ignored on the remainder row. */
  amount: string;
  note: string;
  /** Round-trip only (never edited on the split UI). */
  accountId?: string;
  description?: string;
  tags?: string;
}

export type CountHint = "enter-two-or-more" | "up-to-20";

export interface CountParse {
  /** 0 = no split, otherwise 2..MAX_SPLITS. */
  n: number;
  /** True when the typed number was above MAX_SPLITS and got clamped. */
  capped: boolean;
  hint: CountHint | null;
}

/**
 * Parse the raw "Splits" count text.
 * "" / "0" / non-numeric = no split. "1" = no split + hint. 2..20 = that many rows.
 * >20 = clamped to 20 with `capped`.
 */
export function parseCount(raw: string): CountParse {
  const text = (raw ?? "").trim();
  if (!/^\d+$/.test(text)) return { n: 0, capped: false, hint: null };
  const value = Number(text);
  if (value > MAX_SPLITS) return { n: MAX_SPLITS, capped: true, hint: "up-to-20" };
  if (value === 1) return { n: 0, capped: false, hint: "enter-two-or-more" };
  if (value < 2) return { n: 0, capped: false, hint: null };
  return { n: value, capped: false, hint: null };
}

/** Round half away from zero, never returning -0. */
function roundMinor(value: number): number {
  const rounded = value < 0 ? -Math.round(-value) : Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

/** Amount in major units -> integer minor units for the currency. */
export function toMinor(amount: number, currency: string): number {
  return roundMinor(amount * 10 ** currencyDecimals(currency));
}

/** Integer minor units -> major-unit number. */
export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyDecimals(currency);
}

/** Integer minor units -> fixed-decimal text, e.g. 2000 USD -> "20.00", 2000 VND -> "2000". */
export function minorToText(minor: number, currency: string): string {
  return fromMinor(minor, currency).toFixed(currencyDecimals(currency));
}

const AMOUNT_TEXT = /^-?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Typed amount text -> minor units. Null for empty or non-numeric text.
 * Rounds to the currency's decimals (VND "333.33" -> 333).
 */
export function parseAmountMinor(raw: string, currency: string): number | null {
  const text = (raw ?? "").trim();
  if (!AMOUNT_TEXT.test(text)) return null;
  return toMinor(Number(text), currency);
}

/**
 * Grow `rows` to `n` rows (n < 2 = no change). Never shrinks: rows beyond `n`
 * are hidden by visibleRows() but keep their data, so growing again restores them.
 * New rows get fresh ids from `newId`.
 */
export function ensureRows<T extends SplitRowModel>(
  rows: readonly T[],
  n: number,
  newId: () => string,
): T[] {
  const out = [...rows];
  const target = Math.min(n, MAX_SPLITS);
  if (target < 2) return out;
  while (out.length < target) {
    out.push({ id: newId(), categoryId: "", amount: "", note: "" } as T);
  }
  return out;
}

/** The rows the split actually uses: first n when n >= 2, otherwise none. */
export function visibleRows<T extends SplitRowModel>(rows: readonly T[], n: number): T[] {
  if (n < 2) return [];
  return rows.slice(0, Math.min(n, MAX_SPLITS));
}

export type RemainderFlag = "ok" | "zero" | "negative";

export interface Remainder {
  minor: number;
  amount: number;
  text: string;
  flag: RemainderFlag;
}

/**
 * Last visible row = |parent| - sum of the other visible rows, in minor units.
 * Empty or non-numeric amounts count as 0. The last row's own typed amount is ignored.
 * flag "zero" or "negative" means the split cannot be saved.
 */
export function computeRemainder(
  visible: readonly Pick<SplitRowModel, "amount">[],
  parentAmount: number,
  currency: string,
): Remainder {
  let minor = toMinor(Math.abs(parentAmount), currency);
  for (let i = 0; i < visible.length - 1; i++) {
    minor -= parseAmountMinor(visible[i].amount, currency) ?? 0;
  }
  const flag: RemainderFlag = minor > 0 ? "ok" : minor === 0 ? "zero" : "negative";
  return {
    minor,
    amount: fromMinor(minor, currency),
    text: minorToText(minor, currency),
    flag,
  };
}

export interface ResolvedCategory {
  id: string;
  /** True when the row has no own category and takes one from above. */
  inherited: boolean;
}

/**
 * Effective category per visible row. Empty = same as the row above (row 0: parent).
 * An explicit pick breaks the chain for that row only. id "" = unresolvable.
 */
export function resolveCategories(
  visible: readonly Pick<SplitRowModel, "categoryId">[],
  parentCategoryId: string,
): ResolvedCategory[] {
  let above = parentCategoryId;
  return visible.map((row) => {
    if (row.categoryId !== "") {
      above = row.categoryId;
      return { id: row.categoryId, inherited: false };
    }
    return { id: above, inherited: above !== "" };
  });
}

export interface CreatedTxAmounts {
  /** Account-currency total of the created transaction. */
  amount: number;
  /** Entered-currency total of the created transaction. */
  enteredAmount: number;
  /** Account currency. */
  currency: string;
}

/**
 * Entered-currency split amounts -> account-currency amounts, using the created
 * transaction's ratio (amount / enteredAmount). Every leg but the last is rounded
 * to account decimals; the last leg is total minus the others, so the sum equals
 * created.amount exactly. Throws when enteredAmount is 0 or not finite.
 */
export function toAccountCurrencySplits(
  enteredAmounts: readonly number[],
  created: CreatedTxAmounts,
): number[] {
  if (enteredAmounts.length === 0) return [];
  if (!Number.isFinite(created.enteredAmount) || created.enteredAmount === 0) {
    throw new RangeError("toAccountCurrencySplits: entered total must be non-zero");
  }
  const ratio = created.amount / created.enteredAmount;
  const totalMinor = toMinor(created.amount, created.currency);
  const legs = enteredAmounts
    .slice(0, -1)
    .map((amount) => toMinor(amount * ratio, created.currency));
  const last = totalMinor - legs.reduce((sum, leg) => sum + leg, 0);
  return [...legs, last].map((minor) => fromMinor(minor, created.currency));
}

export interface SplitAdjustment {
  /** Index of the adjusted (last) row. */
  index: number;
  /** Absolute amounts before and after the adjustment. */
  from: number;
  to: number;
}

export interface SavedSplitsResult<T> {
  rows: Array<Omit<T, "amount"> & { amount: string }>;
  adjusted: boolean;
  adjustment: SplitAdjustment | null;
}

/**
 * Saved split rows -> editor rows. Amounts become absolute (saved expense splits
 * are negative). If they do not sum to |parent|, the last row is set to the
 * remainder and `adjusted` is true so the UI can show a notice. Other fields pass through.
 */
export function rowsFromSavedSplits<T extends { amount: number }>(
  saved: readonly T[],
  parentAbs: number,
  currency: string,
): SavedSplitsResult<T> {
  if (saved.length === 0) return { rows: [], adjusted: false, adjustment: null };

  const minors = saved.map((row) => toMinor(Math.abs(row.amount), currency));
  const lastIndex = minors.length - 1;
  const parentMinor = toMinor(Math.abs(parentAbs), currency);
  const othersMinor = minors.slice(0, lastIndex).reduce((sum, m) => sum + m, 0);
  const oldLast = minors[lastIndex];
  const newLast = parentMinor - othersMinor;
  minors[lastIndex] = newLast;

  const adjusted = newLast !== oldLast;
  const rows = saved.map((row, i) => ({
    ...row,
    amount: minorToText(minors[i], currency),
  })) as Array<Omit<T, "amount"> & { amount: string }>;

  return {
    rows,
    adjusted,
    adjustment: adjusted
      ? {
          index: lastIndex,
          from: fromMinor(oldLast, currency),
          to: fromMinor(newLast, currency),
        }
      : null,
  };
}
