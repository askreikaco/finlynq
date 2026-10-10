/**
 * Modes of the one transaction entry screen (TransactionEntryScreen) and the seed each mode starts from.
 *
 *   create         blank form (or a Duplicate prefill read by the screen itself)
 *   edit           one plain transaction, prefilled from the loaded row (+ its splits)
 *   edit-transfer  a clean two-leg transfer pair, prefilled from both legs
 *
 * Pure: no React, no I/O. The save payloads the edit modes send live here too, so the screen and the
 * golden-payload tests build them from one place. They are byte-for-byte what the old edit form
 * (useTransactionForm.handleSubmit / handleTransferSubmit) sent.
 */

import type { DialogTransaction } from "@/components/transactions/transaction-dialog";
import type { EditInitialState } from "@/app/(app)/transactions/_components/use-edit-source";
import type { SplitRowModel } from "@/lib/transactions/split-math";

/** One stored split row of a transaction, as GET /api/transactions/splits?transactionId= returns it. */
export interface EditSplit {
  categoryId: number | null;
  amount: number;
  note: string | null;
}

export type EntryMode =
  | { kind: "create" }
  | { kind: "edit"; tx: DialogTransaction; splits: EditSplit[]; returnTo: string }
  | { kind: "edit-transfer"; linkId: string; debit: DialogTransaction; credit: DialogTransaction; returnTo: string };

export type EditEntryMode = Exclude<EntryMode, { kind: "create" }>;

export function isEditMode(mode: EntryMode): mode is EditEntryMode {
  return mode.kind !== "create";
}

/** Mode for a loaded edit source (the caller has already decided canEditInEntryScreen). */
export function toEntryMode(
  initialState: EditInitialState,
  splits: EditSplit[],
  returnTo: string,
): EditEntryMode {
  if (initialState.kind === "transfer-edit") {
    return { kind: "edit-transfer", linkId: initialState.linkId, debit: initialState.debit, credit: initialState.credit, returnTo };
  }
  return { kind: "edit", tx: initialState.tx, splits, returnTo };
}

/** Prefix of the generated split row ids (SplitSection idPrefix "txnew-split"). */
const SPLIT_ROW_PREFIX = "txnew-split";

export interface EntrySeed {
  txType: "Expense" | "Income" | "Transfer";
  date: string;
  /** Unsigned amount text; Expense/Income carry the sign in txType. */
  amount: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  payee: string;
  note: string;
  tags: string;
  isBusiness: boolean;
  /** Entered currency. "" = follow the (From) account's currency. */
  currencyChoice: string;
  /** Transfer: amount the destination receives ("" unless the legs are in different currencies). */
  receivedAmount: string;
  splitCount: string;
  splitRows: SplitRowModel[];
  showMore: boolean;
}

/** Field values an edit mode starts from. Same mapping the old edit form seeded (seedFromInitialState). */
export function buildEntrySeed(mode: EditEntryMode): EntrySeed {
  if (mode.kind === "edit-transfer") {
    const { debit, credit } = mode;
    const tags = debit.tags || credit.tags || "";
    // The destination leg's `amount` is the only column in the DESTINATION currency (FINLYNQ-317);
    // the sent amount is the debit leg's entered amount (source currency).
    const crossCcy = debit.currency !== credit.currency;
    return {
      txType: "Transfer",
      date: debit.date,
      amount: String(Math.abs(debit.enteredAmount ?? debit.amount)),
      accountId: String(debit.accountId),
      toAccountId: String(credit.accountId),
      categoryId: "",
      payee: "",
      note: debit.note || credit.note || "",
      tags,
      isBusiness: false,
      currencyChoice: "",
      receivedAmount: crossCcy ? String(Math.abs(credit.amount)) : "",
      splitCount: "",
      splitRows: [],
      showMore: !!tags,
    };
  }
  const { tx, splits } = mode;
  const signed = tx.enteredAmount ?? tx.amount;
  const splitActive = splits.length >= 2;
  return {
    txType: signed < 0 ? "Expense" : "Income",
    date: tx.date,
    amount: String(Math.abs(signed)),
    accountId: String(tx.accountId),
    toAccountId: "",
    categoryId: String(tx.categoryId),
    payee: tx.payee || "",
    note: tx.note || "",
    tags: tx.tags || "",
    isBusiness: tx.isBusiness === 1,
    currencyChoice: tx.enteredCurrency ?? tx.currency,
    receivedAmount: "",
    splitCount: splitActive ? String(splits.length) : "",
    // Every stored split carries the parent's category (canEditInEntryScreen), so rows inherit it.
    // The last row is the computed remainder; its typed amount is ignored.
    splitRows: splitActive
      ? splits.map((s, i) => ({
          id: `${SPLIT_ROW_PREFIX}-row-${i}`,
          categoryId: "",
          amount: i === splits.length - 1 ? "" : String(Math.abs(s.amount)),
          note: s.note ?? "",
        }))
      : [],
    showMore: !!tx.tags || tx.isBusiness === 1 || splitActive,
  };
}

// ─── Save payloads (same shapes the old edit form sent) ────────────────

/** PUT /api/transactions body. payee/note/tags are sent as typed (an empty string clears the field). */
export function buildTransactionPutBody(a: {
  id: number;
  date: string;
  accountId: number;
  categoryId: number;
  enteredCurrency: string;
  /** Signed: Expense negative, Income positive. */
  enteredAmount: number;
  payee: string;
  note: string;
  tags: string;
  isBusiness: boolean;
  confirmReallocation?: boolean;
}): Record<string, unknown> {
  return {
    id: a.id,
    date: a.date,
    accountId: a.accountId,
    categoryId: a.categoryId,
    enteredCurrency: a.enteredCurrency,
    enteredAmount: a.enteredAmount,
    payee: a.payee,
    note: a.note,
    tags: a.tags,
    isBusiness: a.isBusiness ? 1 : 0,
    // FINLYNQ-176: on the confirm pass, opt into reallocating dependents.
    ...(a.confirmReallocation ? { confirmReallocation: true } : {}),
  };
}

/** POST /api/transactions/splits body after the PUT: rows carry the parent's sign; note as typed. */
export function buildSplitsBody(a: {
  transactionId: number;
  sign: 1 | -1;
  rows: Array<{ categoryId: number | null; amount: number; note: string }>;
}): { transactionId: number; splits: Array<{ categoryId: number | null; amount: number; note: string }> } {
  return {
    transactionId: a.transactionId,
    splits: a.rows.map((r) => ({ categoryId: r.categoryId, amount: a.sign * Math.abs(r.amount), note: r.note })),
  };
}

/**
 * PUT /api/transactions/transfer body for a cash transfer edit (the only kind the entry screen edits).
 * note/tags are sent only when non-empty; the in-kind fields are explicitly cleared (null), as before.
 */
export function buildTransferPutBody(a: {
  linkId: string;
  fromAccountId: number;
  toAccountId: number;
  enteredAmount: number;
  date: string;
  receivedAmount?: number;
  note: string;
  tags: string;
}): Record<string, unknown> {
  return {
    fromAccountId: a.fromAccountId,
    toAccountId: a.toAccountId,
    enteredAmount: a.enteredAmount,
    date: a.date,
    ...(a.receivedAmount != null ? { receivedAmount: a.receivedAmount } : {}),
    ...(a.note ? { note: a.note } : {}),
    ...(a.tags ? { tags: a.tags } : {}),
    linkId: a.linkId,
    holdingName: null,
    destHoldingName: null,
    quantity: null,
    destQuantity: null,
  };
}
