/**
 * Routing helpers for the full-page transaction edit flows (PKG1 tx-edit).
 * Edit, transfer-edit and split are pages, never dialogs. The transactions
 * table and the inbox/reconcile lists only navigate; the page loaders decide
 * which page a row belongs to.
 */
import { opHref, type OpKey } from "@/components/portfolio/forms/op-catalog";
import type {
  DialogAccount,
  DialogCategory,
  DialogLinkedSibling,
  DialogTransaction,
  TransactionDialogInitialState,
} from "@/components/transactions/transaction-dialog";
import { MAX_SPLITS, toMinor } from "@/lib/transactions/split-math";
import type { EditSplit } from "@/lib/transactions/entry-mode";

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

// ─── Which edit UI a row opens in ──────────────────────────────────────

/** What the decision needs besides the row: the lookups (archived accounts included) and the stored splits. */
export interface EntryEditContext {
  accounts?: readonly DialogAccount[];
  categories?: readonly DialogCategory[];
  /** Stored splits of the transaction. null/undefined = could not be loaded. */
  splits?: readonly EditSplit[] | null;
}

/** Why a row stays on the old edit form (TransactionEditForm). null from entryEditFallbackReason = the entry screen. */
export type EntryEditFallbackReason =
  | "not-an-edit"
  | "lookups-missing"
  | "linked-rows"
  | "holdings-fields"
  | "investment-account"
  | "archived-account"
  | "zero-amount"
  | "uncategorized"
  | "category-sign-mismatch"
  | "entered-currency-differs"
  | "splits-unavailable"
  | "split-single-row"
  | "split-too-many"
  | "split-currency-differs"
  | "split-category-differs"
  | "split-unbalanced";

/** Category type normalised the way the entry screen filters its category list. */
function categoryKind(type: string | null | undefined): "E" | "I" | null {
  if (type === "E" || type?.toLowerCase() === "expense") return "E";
  if (type === "I" || type?.toLowerCase() === "income") return "I";
  return null;
}

/** An account the entry screen can show: it lists only active, non-investment accounts. */
function accountFallback(
  accountId: number,
  accounts: readonly DialogAccount[],
): "investment-account" | "archived-account" | null {
  const a = accounts.find((x) => x.id === accountId);
  if (!a) return "archived-account";
  if (a.isInvestment === true) return "investment-account";
  if (a.archived === true) return "archived-account";
  return null;
}

/**
 * The reason a loaded edit row cannot be edited faithfully in TransactionEntryScreen, or null when it can.
 * Every excluded case keeps the old edit form so nothing regresses:
 *
 *   not-an-edit            the state is not transaction-edit / transfer-edit.
 *   lookups-missing        accounts or categories did not load: cannot judge, stay on the old form.
 *   linked-rows            transaction with a link_id that is not a clean transfer pair (N>2 legs, same-account
 *                          conversion, orphan leg) or with linked siblings: the old form lists the siblings.
 *   holdings-fields        quantity or portfolio holding set (either leg of a transfer): the screen has no holdings
 *                          fields, and an in-kind transfer needs holdingName/quantity.
 *   investment-account     an account is an investment account: the screen lists only non-investment accounts and
 *                          the old form asks for the holding.
 *   archived-account       an account is archived or missing from the lookups: not in the screen's account list.
 *   zero-amount            amount 0: the screen needs an amount > 0 and a sign for Expense/Income.
 *   uncategorized          no category (or one that no longer exists): the screen requires one.
 *   category-sign-mismatch the category type disagrees with the sign (refund on an expense category, transfer
 *                          category, ...): the screen filters categories by Expense/Income and would drop it.
 *   entered-currency-differs  transfer whose leg was entered in a currency other than its account's: the transfer
 *                          PUT carries no entered currency, so the screen could not round-trip it.
 *   splits-unavailable     the stored splits could not be loaded.
 *   split-single-row       exactly one stored split row: the screen's split editor starts at 2.
 *   split-too-many         more than MAX_SPLITS rows.
 *   split-currency-differs splits on a row entered in another currency than its account: stored split amounts are
 *                          in the account currency, the screen edits them in the entered currency.
 *   split-category-differs a split carries a category other than the parent's: the screen's rows inherit the parent.
 *   split-unbalanced       split amounts do not add up to the total, or a split is 0: the screen derives the last
 *                          split as the remainder.
 */
export function entryEditFallbackReason(
  initialState: TransactionDialogInitialState,
  ctx: EntryEditContext = {},
): EntryEditFallbackReason | null {
  if (initialState.kind !== "transaction-edit" && initialState.kind !== "transfer-edit") return "not-an-edit";
  const { accounts, categories } = ctx;
  if (!accounts || !categories) return "lookups-missing";

  if (initialState.kind === "transfer-edit") {
    const { debit, credit } = initialState;
    for (const leg of [debit, credit]) {
      if (leg.quantity != null || leg.portfolioHolding) return "holdings-fields";
    }
    for (const leg of [debit, credit]) {
      const bad = accountFallback(leg.accountId, accounts);
      if (bad) return bad;
    }
    if (!(Math.abs(debit.enteredAmount ?? debit.amount) > 0)) return "zero-amount";
    if (debit.enteredCurrency && debit.enteredCurrency !== debit.currency) return "entered-currency-differs";
    return null;
  }

  const { tx, linkedSiblings } = initialState;
  if (tx.linkId || (linkedSiblings?.length ?? 0) > 0) return "linked-rows";
  if (tx.quantity != null || tx.portfolioHolding) return "holdings-fields";
  const bad = accountFallback(tx.accountId, accounts);
  if (bad) return bad;

  const signed = tx.enteredAmount ?? tx.amount;
  if (!Number.isFinite(signed) || signed === 0) return "zero-amount";

  const category = tx.categoryId ? categories.find((c) => c.id === tx.categoryId) : undefined;
  if (!category) return "uncategorized";
  if (categoryKind(category.type) !== (signed < 0 ? "E" : "I")) return "category-sign-mismatch";

  const splits = ctx.splits;
  if (!Array.isArray(splits)) return "splits-unavailable";
  if (splits.length === 0) return null;
  if (splits.length === 1) return "split-single-row";
  if (splits.length > MAX_SPLITS) return "split-too-many";
  if ((tx.enteredCurrency ?? tx.currency) !== tx.currency) return "split-currency-differs";
  if (splits.some((s) => s.categoryId !== tx.categoryId)) return "split-category-differs";
  const minors = splits.map((s) => toMinor(Math.abs(s.amount), tx.currency));
  const total = minors.reduce((sum, m) => sum + m, 0);
  if (minors.some((m) => m <= 0) || total !== toMinor(Math.abs(signed), tx.currency)) return "split-unbalanced";
  return null;
}

/** True when the Edit page renders TransactionEntryScreen for this row; false keeps the old TransactionEditForm. */
export function canEditInEntryScreen(
  initialState: TransactionDialogInitialState,
  ctx: EntryEditContext = {},
): boolean {
  return entryEditFallbackReason(initialState, ctx) === null;
}
