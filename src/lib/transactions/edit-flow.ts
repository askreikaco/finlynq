/**
 * Routing helpers for the full-page transaction edit flows (PKG1 tx-edit).
 * Edit, transfer-edit and split are pages, never dialogs. The transactions
 * table and the inbox/reconcile lists only navigate; the page loaders decide
 * which page a row belongs to.
 */
import { opHref, type OpKey } from "@/components/portfolio/forms/op-catalog";
import type { DialogLinkedSibling, DialogTransaction } from "@/components/transactions/transaction-dialog";

/** Row kinds that the generic editor must not touch: they open the portfolio op page instead. */
const PORTFOLIO_KIND_OP: Record<string, OpKey> = {
  buy: "buy",
  buy_cash_leg: "buy",
  sell: "sell",
  sell_cash_leg: "sell",
  in_kind_transfer_in: "transfer",
  in_kind_transfer_out: "transfer",
  fx_from: "fx-conversion",
  fx_to: "fx-conversion",
  fx_fee: "fx-conversion",
  portfolio_income: "income-expense",
  portfolio_expense: "income-expense",
  brokerage_deposit_in: "deposit",
  brokerage_deposit_out: "deposit",
  brokerage_withdrawal_in: "withdrawal",
  brokerage_withdrawal_out: "withdrawal",
};

/** Portfolio op page for a portfolio-kind row, or null when the row is an ordinary transaction. */
export function portfolioEditHref(kind: string | null | undefined, id: number): string | null {
  if (!kind) return null;
  const op = PORTFOLIO_KIND_OP[kind];
  return op ? opHref(op, `?editId=${id}`) : null;
}

/** returnTo is appended only when given, so the edit page can go back to the list the user came from. */
function withReturnTo(path: string, returnTo?: string): string {
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
}

export function transactionEditHref(id: number, returnTo?: string): string {
  return withReturnTo(`/transactions/${id}/edit`, returnTo);
}

export function transferEditHref(linkId: string, returnTo?: string): string {
  return withReturnTo(`/transactions/transfer/${encodeURIComponent(linkId)}/edit`, returnTo);
}

export function transactionSplitHref(id: number, returnTo?: string): string {
  return withReturnTo(`/transactions/${id}/split`, returnTo);
}

/**
 * Four-check rule for "open this row in unified Transfer mode":
 *   1. the row has a link_id
 *   2. exactly one sibling shares it (two legs)
 *   3. the two legs reference DIFFERENT accounts
 * Anything else (WP liquidations with N>2 legs, same-account conversions)
 * stays a standard transaction edit with linked siblings listed.
 */
export function isCleanTransferPair(
  tx: { accountId: number; linkId: string | null },
  siblings: DialogLinkedSibling[],
): boolean {
  return (
    !!tx.linkId &&
    siblings.length === 1 &&
    siblings[0].accountId != null &&
    siblings[0].accountId !== tx.accountId
  );
}

/** Convert a /api/transactions/linked sibling into the row shape the form seeds from. */
export function siblingToTransaction(s: DialogLinkedSibling): DialogTransaction {
  return {
    id: s.id,
    date: s.date,
    accountId: s.accountId ?? 0,
    categoryId: s.categoryId ?? 0,
    currency: s.currency,
    amount: s.amount,
    enteredAmount: s.enteredAmount,
    enteredCurrency: s.enteredCurrency,
    enteredFxRate: s.enteredFxRate,
    quantity: s.quantity,
    portfolioHolding: s.portfolioHolding,
    note: s.note ?? "",
    payee: s.payee ?? "",
    tags: s.tags ?? "",
    isBusiness: null,
    linkId: null,
  };
}
