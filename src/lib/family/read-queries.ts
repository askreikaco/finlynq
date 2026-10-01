/**
 * Read-only data access for the Family Wealth overview section builders.
 *
 * Contract (enforced by tests/family/family-p4-guards.test.ts):
 *  - the section builders import data ONLY from this barrel (plus pure helpers);
 *  - no write verb (insert/update/delete/execute/transaction) appears in this file;
 *  - ciphertext columns (*_ct, symbol, note, alias, payee, tags) never leave this file:
 *    every wrapper returns plaintext numbers / structure only. Labels come exclusively from
 *    the family_labels sidecar (label-decrypt.ts), never from an entity row.
 *
 * Existing server functions are reused wherever one exists (balances, snapshots, budgets,
 * income/expense slices, loan summary, goal progress, net-worth history).
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  getAccountBalances,
  getBudgets,
  getCashSnapshotsInRange,
  getIncomeVsExpenses,
  getInvestmentSnapshotsInRange,
  getPortfolioHoldings,
  getSpendingByCategoryWithReporting,
} from "@/lib/queries";

export { getCashSnapshotsInRange, getIncomeVsExpenses, getInvestmentSnapshotsInRange };
export { getLinkedAccountBalances, summarizeLoan } from "@/lib/loan-summary";
export type { LoanSummaryInput, LoanSummaryResult } from "@/lib/loan-summary";
export { computeGoalProgress } from "@/lib/goals-progress";
export { buildNetWorthHistory } from "@/lib/net-worth-history";
export type { AccountSnapshot, LiveAccountValue, NetWorthPeriod } from "@/lib/net-worth-history";
export { convertReportingSlice } from "@/lib/fx/reporting-amount";

export type OwnerAccountRow = {
  id: number;
  type: string;
  group: string;
  currency: string;
  archived: boolean;
  isInvestment: boolean;
  /** SUM(transactions.amount) in the account currency (ledger basis). */
  ledgerBalance: number;
};

/** All accounts (archived included, same set as the dashboard hero), ciphertext stripped. */
export async function getOwnerAccountBalances(ownerId: string): Promise<OwnerAccountRow[]> {
  const rows = await getAccountBalances(ownerId, { includeArchived: true });
  return rows
    .map((r) => ({
      id: r.accountId,
      type: r.accountType,
      group: r.accountGroup ?? "",
      currency: r.currency,
      archived: Boolean(r.archived),
      isInvestment: Boolean(r.isInvestment),
      ledgerBalance: Number(r.balance ?? 0),
    }))
    .sort((a, b) => a.id - b.id);
}

export type OwnerBudgetRow = { categoryId: number; amount: number; currency: string };

export async function getOwnerBudgets(ownerId: string, month: string): Promise<OwnerBudgetRow[]> {
  const rows = await getBudgets(ownerId, month);
  return rows
    .map((r) => ({ categoryId: r.categoryId, amount: Number(r.amount), currency: r.currency }))
    .sort((a, b) => a.categoryId - b.categoryId);
}

export type SpendSlice = {
  categoryId: number | null;
  currency: string | null;
  reportingCurrency: string | null;
  totalAmount: number | null;
  totalReporting: number | null;
};

export async function getOwnerSpendSlices(ownerId: string, start: string, end: string): Promise<SpendSlice[]> {
  const rows = await getSpendingByCategoryWithReporting(ownerId, start, end);
  return rows.map((r) => ({
    categoryId: r.categoryId ?? null,
    currency: r.currency,
    reportingCurrency: r.reportingCurrency,
    totalAmount: r.totalAmount == null ? null : Number(r.totalAmount),
    totalReporting: r.totalReporting == null ? null : Number(r.totalReporting),
  }));
}

export type OwnerHoldingRow = {
  id: number;
  accountId: number | null;
  currency: string;
  isCash: boolean;
  isCrypto: boolean;
  quantity: number;
};

export async function getOwnerHoldings(ownerId: string): Promise<OwnerHoldingRow[]> {
  const rows = await getPortfolioHoldings(ownerId);
  return rows
    .map((r) => ({
      id: r.id,
      accountId: r.accountId ?? null,
      currency: r.currency,
      isCash: Boolean(r.isCash),
      isCrypto: Boolean(r.isCrypto),
      quantity: Number(r.currentShares ?? 0),
    }))
    .sort((a, b) => a.id - b.id);
}

export type OwnerGoalRow = {
  id: number;
  type: string;
  currency: string;
  targetAmount: number;
  deadline: string | null;
  status: string;
  accountIds: number[];
};

/** Goals + their linked accounts (goal_accounts join, same grain as GET /api/goals). */
export async function getOwnerGoals(ownerId: string): Promise<OwnerGoalRow[]> {
  const goals = await db
    .select({
      id: schema.goals.id,
      type: schema.goals.type,
      currency: schema.goals.currency,
      targetAmount: schema.goals.targetAmount,
      deadline: schema.goals.deadline,
      status: schema.goals.status,
    })
    .from(schema.goals)
    .where(eq(schema.goals.userId, ownerId));
  const links = await db
    .select({ goalId: schema.goalAccounts.goalId, accountId: schema.goalAccounts.accountId })
    .from(schema.goalAccounts)
    .where(eq(schema.goalAccounts.userId, ownerId));
  const byGoal = new Map<number, number[]>();
  for (const l of links) byGoal.set(l.goalId, [...(byGoal.get(l.goalId) ?? []), l.accountId]);
  return goals
    .map((g) => ({
      id: g.id,
      type: g.type,
      currency: g.currency,
      targetAmount: Number(g.targetAmount),
      deadline: g.deadline ?? null,
      status: g.status,
      accountIds: byGoal.get(g.id) ?? [],
    }))
    .sort((a, b) => a.id - b.id);
}

export type OwnerLoanRow = {
  id: number;
  type: string;
  accountId: number | null;
  currency: string;
  principal: number;
  annualRate: number;
  termMonths: number | null;
  startDate: string;
  paymentAmount: number | null;
  paymentFrequency: string;
  extraPayment: number | null;
  residualValue: number | null;
};

export async function getOwnerLoans(ownerId: string): Promise<OwnerLoanRow[]> {
  const rows = await db
    .select({
      id: schema.loans.id,
      type: schema.loans.type,
      accountId: schema.loans.accountId,
      currency: schema.loans.currency,
      principal: schema.loans.principal,
      annualRate: schema.loans.annualRate,
      termMonths: schema.loans.termMonths,
      startDate: schema.loans.startDate,
      paymentAmount: schema.loans.paymentAmount,
      paymentFrequency: schema.loans.paymentFrequency,
      extraPayment: schema.loans.extraPayment,
      residualValue: schema.loans.residualValue,
    })
    .from(schema.loans)
    .where(and(eq(schema.loans.userId, ownerId)));
  return rows.sort((a, b) => a.id - b.id);
}
