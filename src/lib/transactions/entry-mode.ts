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
  /** Installment rows only: which payments the edit applies to (omitted = the server default, this row). */
  scope?: "this" | "following";
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
    ...(a.scope ? { scope: a.scope } : {}),
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

// ─── Offline queue (local-first L3, flag off by default) ───────────────

/** What the screen knows when deciding whether a failed save may go to the on-device queue. */
export interface OfflineEligibilityInput {
  txType: "Expense" | "Income" | "Transfer";
  splitActive: boolean;
  /** A Repeat or Installment series on a new entry. */
  hasSeries: boolean;
  /** Posting a due subscription occurrence. */
  isPostTarget: boolean;
  isBusiness: boolean;
  mode: EntryMode;
}

/**
 * Simple create/edit only. Splits, repeat/installment, transfers, subscription posting, the business flag
 * (not in the offline field allowlist) and edits of linked, installment, repeat or portfolio rows stay online-only.
 */
export function isOfflineQueueEligible(a: OfflineEligibilityInput): boolean {
  if (a.txType === "Transfer" || a.splitActive || a.hasSeries || a.isPostTarget || a.isBusiness) return false;
  if (a.mode.kind === "edit-transfer") return false;
  if (a.mode.kind === "edit") {
    const t = a.mode.tx;
    if (t.linkId || t.installmentGroupId || t.subscriptionId != null || t.portfolioHolding || t.quantity != null) return false;
    if (t.isBusiness === 1) return false; // saving would silently keep a flag the queue cannot write
  }
  return true;
}

/** A list row as far as offline delete eligibility is concerned (GET /api/transactions fields). */
export interface OfflineDeleteCandidate {
  amount: number;
  linkId?: string | null;
  installmentGroupId?: string | null;
  subscriptionId?: number | null;
  portfolioHolding?: string | null;
  quantity?: number | null;
  isBusiness?: number | null;
  kind?: string | null;
  tradeLinkId?: string | null;
}

/**
 * A delete may go to the queue only for the rows an offline edit may touch (same rule as isOfflineQueueEligible in edit
 * mode), plus: no portfolio operation kind / trade pair, and the repeat/installment membership must be KNOWN (a row
 * whose list payload lacks those fields is treated as online-only). Splits are checked by the caller (needs a request).
 */
export function isOfflineDeleteEligible(t: OfflineDeleteCandidate): boolean {
  if (t.installmentGroupId === undefined || t.subscriptionId === undefined) return false;
  if (t.kind || t.tradeLinkId) return false;
  return isOfflineQueueEligible({
    txType: t.amount < 0 ? "Expense" : "Income",
    splitActive: false,
    hasSeries: false,
    isPostTarget: false,
    isBusiness: false,
    mode: { kind: "edit", tx: t as unknown as DialogTransaction, splits: [], returnTo: "" },
  });
}

/**
 * Whether a failed DELETE request goes to the offline queue: the queue is on, the failure is "no connection", the row is
 * eligible AND the row is known to have no splits (`hasSplits` false; null = could not be read = online-only).
 */
export function canQueueOfflineDelete(a: { queueActive: boolean; error: unknown; row: OfflineDeleteCandidate; hasSplits: boolean | null }): boolean {
  return a.queueActive && isNetworkFailure(a.error) && a.hasSplits === false && isOfflineDeleteEligible(a.row);
}

/** Fields of a queued create (same names the POST body uses; empty payee/note/tags omitted as the POST does). */
export function buildOfflineCreateFields(a: {
  date: string;
  accountId: number;
  categoryId: number;
  enteredCurrency: string;
  enteredAmount: number;
  payee: string;
  note: string;
  tags: string;
}): Record<string, string | number> {
  return {
    date: a.date,
    accountId: a.accountId,
    categoryId: a.categoryId,
    enteredCurrency: a.enteredCurrency,
    enteredAmount: a.enteredAmount,
    ...(a.payee.trim() ? { payee: a.payee.trim() } : {}),
    ...(a.note.trim() ? { note: a.note.trim() } : {}),
    ...(a.tags.trim() ? { tags: a.tags.trim() } : {}),
  };
}

/** Changed allowlisted fields of an edit, plus the server values they replace (the conflict baseline). */
export function buildOfflineEditPatch(
  tx: DialogTransaction,
  a: { date: string; accountId: number; categoryId: number; enteredCurrency: string; enteredAmount: number; payee: string; note: string; tags: string },
): { patch: Record<string, string | number>; current: Record<string, string | number | null> } {
  const current: Record<string, string | number | null> = {
    date: tx.date,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    enteredCurrency: tx.enteredCurrency ?? tx.currency,
    enteredAmount: tx.enteredAmount ?? tx.amount,
    payee: tx.payee ?? "",
    note: tx.note ?? "",
    tags: tx.tags ?? "",
  };
  const next: Record<string, string | number> = {
    date: a.date,
    accountId: a.accountId,
    categoryId: a.categoryId,
    enteredCurrency: a.enteredCurrency,
    enteredAmount: a.enteredAmount,
    payee: a.payee,
    note: a.note,
    tags: a.tags,
  };
  const patch: Record<string, string | number> = {};
  for (const k of Object.keys(next)) if (next[k] !== current[k]) patch[k] = next[k];
  // Baseline as the API reports empty text columns (null), so the drain's server-equals-baseline check holds.
  for (const k of ["payee", "note", "tags"]) if (current[k] === "") current[k] = null;
  return { patch, current };
}

/** True when a thrown fetch error means "no connection" (fetch rejects with TypeError) or the browser reports offline. */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError;
}
