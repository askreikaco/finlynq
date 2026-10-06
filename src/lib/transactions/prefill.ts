/**
 * Duplicate transaction via sessionStorage prefill.
 *
 * Duplicate action writes to sessionStorage (not URL). Page reads once on mount,
 * clears it immediately. One-shot per tab, never in URL.
 */

import type { Transaction } from "@/app/(app)/transactions/_types";

export type PrefillData = {
  v: 1;
  amount: string;
  accountId: string;
  categoryId: string;
  payee: string;
  note: string;
  tags: string;
  isBusiness: boolean;
  txType: "Expense" | "Income";
  ts: number;
};

const STORAGE_KEY = "finlynq:tx-prefill";
const VERSION = 1;
const EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Determine if a transaction can be duplicated.
 * - No transfer legs (linkId present = part of transfer pair)
 * - No investment/trades (tradeLinkId, kind, or quantity present)
 * - No multi-currency mismatch (enteredCurrency != account currency)
 */
export function canDuplicate(tx: Transaction, accountCurrency: string): boolean {
  // Transfer leg: never duplicate
  if (tx.linkId) return false;

  // Investment/trade: never duplicate
  if (tx.tradeLinkId || tx.kind || (tx.quantity != null && tx.quantity !== 0))
    return false;

  // Multi-currency: enteredCurrency differs from account currency = don't offer
  if (
    tx.enteredCurrency &&
    tx.enteredCurrency !== accountCurrency
  )
    return false;

  return true;
}

/**
 * Build prefill data from a source transaction.
 * - Copies: amount (absolute), accountId, categoryId, payee, note, tags, isBusiness
 * - txType inferred from amount sign: negative = Expense, positive = Income
 * - Never copies: id, importHash, linkId, reconcile, createdAt, source
 */
export function buildPrefill(tx: Transaction): PrefillData {
  // txType from sign of amount
  const txType: "Expense" | "Income" =
    (tx.enteredAmount ?? tx.amount ?? 0) < 0 ? "Expense" : "Income";

  return {
    v: VERSION,
    amount: String(Math.abs(tx.enteredAmount ?? tx.amount ?? 0)),
    accountId: String(tx.accountId || ""),
    categoryId: String(tx.categoryId || ""),
    payee: tx.payee || "",
    note: tx.note || "",
    tags: tx.tags || "",
    isBusiness: tx.isBusiness === 1,
    txType,
    ts: Date.now(),
  };
}

/**
 * Write prefill to sessionStorage. Called by Duplicate action before navigate.
 */
export function writePrefill(data: PrefillData): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to write prefill to sessionStorage:", e);
  }
}

/**
 * Read and clear prefill from sessionStorage. Called once on page mount.
 * Returns null if missing, malformed, wrong version, or expired (>2 min).
 */
export function readAndClearPrefill(now: number): PrefillData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    sessionStorage.removeItem(STORAGE_KEY);

    const data = JSON.parse(raw) as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      (data as any).v !== VERSION
    ) {
      return null;
    }

    const prefill = data as PrefillData;
    if (now - prefill.ts > EXPIRY_MS) {
      return null;
    }

    return prefill;
  } catch (e) {
    console.error("Failed to read prefill from sessionStorage:", e);
    // Still try to clear it
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}
