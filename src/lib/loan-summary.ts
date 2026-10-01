/**
 * Shared loan summary (balance, payoff, interest) used by GET /api/loans and the
 * Family Wealth overview. Single source of truth for "remaining balance": the
 * linked account's ledger (|sum|, liability balances are negative) when it has
 * activity, else the amortization projection. Numbers only, no names, no DEK.
 *
 * Extracted verbatim from src/app/api/loans/route.ts (FINLYNQ-136 / issue #213).
 */
import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { buildLoanSchedule, LoanValidationError } from "@/lib/loan-calculator";
import { parseYmdSafe } from "../../mcp-server/lib/date-validators";

// FINLYNQ-136: outstanding balance per linked account = SUM(transactions.amount)
// (same definition as getAccountBalances). txCount distinguishes "no ledger
// activity yet" (fall back to projection) from a genuinely zero balance.
export async function getLinkedAccountBalances(userId: string, accountIds: number[]) {
  const map = new Map<number, { balance: number; txCount: number }>();
  if (!accountIds.length) return map;
  const rows = await db
    .select({
      accountId: schema.transactions.accountId,
      balance: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
      txCount: sql<number>`COUNT(*)`,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), inArray(schema.transactions.accountId, accountIds)))
    .groupBy(schema.transactions.accountId)
    .all();
  for (const r of rows) {
    if (r.accountId != null) map.set(r.accountId, { balance: Number(r.balance), txCount: Number(r.txCount) });
  }
  return map;
}

export type LoanSummaryInput = {
  principal: number;
  annualRate: number;
  termMonths: number | null;
  startDate: string;
  paymentAmount: number | null;
  paymentFrequency: string;
  extraPayment: number | null;
  residualValue: number | null;
  accountId: number | null;
};

export type LoanSummaryOk = {
  monthlyPayment: number;
  paymentPerPeriod: number;
  monthlyEquivalentPayment: number;
  totalInterest: number;
  payoffDate: string | null;
  remainingBalance: number;
  balanceSource: "account" | "projection";
  principalPaid: number;
  interestPaid: number;
  periodsRemaining: number;
};

export type LoanSummaryResult = LoanSummaryOk | { integrity: { error: string; value: unknown } };

export function summarizeLoan(
  loan: LoanSummaryInput,
  acctBalances: Map<number, { balance: number; txCount: number }>,
  today: string,
): LoanSummaryResult {
  // Issue #213 — guard against legacy bad start_date so the whole list
  // doesn't crash with `Invalid time value`.
  if (parseYmdSafe(loan.startDate) === null) {
    return { integrity: { error: "invalid start_date", value: loan.startDate } };
  }
  let summary;
  try {
    summary = buildLoanSchedule({
      principal: loan.principal,
      annualRate: loan.annualRate,
      termMonths: loan.termMonths,
      startDate: loan.startDate,
      paymentAmount: loan.paymentAmount,
      paymentFrequency: loan.paymentFrequency as never,
      extraPayment: loan.extraPayment ?? 0,
      residualValue: loan.residualValue,
    });
  } catch (e) {
    // A legacy row whose payment no longer amortizes shouldn't poison the list.
    if (e instanceof LoanValidationError) return { integrity: { error: e.message, value: null } };
    throw e;
  }
  const paid = summary.schedule.filter((r) => r.date <= today);
  const principalPaid = paid.reduce((s, r) => s + r.principal, 0);
  const interestPaid = paid.reduce((s, r) => s + r.interest, 0);

  // Projection-derived fallback values.
  let remainingBalance = Math.max(loan.principal - principalPaid, 0);
  let balanceSource: "account" | "projection" = "projection";
  let payoffDate = summary.payoffDate;
  let periodsRemaining = summary.schedule.length - paid.length;

  // FINLYNQ-136: when a linked account has ledger activity, its balance is
  // the source of truth and the payoff projection is re-anchored to it.
  const acct = loan.accountId != null ? acctBalances.get(loan.accountId) : undefined;
  if (acct && acct.txCount > 0) {
    remainingBalance = Math.round(Math.abs(acct.balance) * 100) / 100;
    balanceSource = "account";
    const residual = loan.residualValue ?? 0;
    if (remainingBalance <= residual + 0.01) {
      payoffDate = today;
      periodsRemaining = 0;
    } else {
      try {
        const anchored = buildLoanSchedule({
          principal: remainingBalance,
          annualRate: loan.annualRate,
          startDate: today,
          paymentAmount: loan.paymentAmount ?? summary.paymentPerPeriod,
          paymentFrequency: loan.paymentFrequency as never,
          extraPayment: loan.extraPayment ?? 0,
          residualValue: loan.residualValue,
        });
        payoffDate = anchored.payoffDate;
        periodsRemaining = anchored.schedule.length;
      } catch {
        // Payment doesn't amortize the actual balance — keep projection dates.
      }
    }
  }

  return {
    monthlyPayment: summary.monthlyPayment,
    paymentPerPeriod: summary.paymentPerPeriod,
    monthlyEquivalentPayment: summary.monthlyEquivalentPayment,
    totalInterest: summary.totalInterest,
    payoffDate,
    remainingBalance,
    balanceSource,
    principalPaid:
      balanceSource === "account"
        ? Math.round(Math.max(loan.principal - remainingBalance, 0) * 100) / 100
        : Math.round(principalPaid * 100) / 100,
    interestPaid: Math.round(interestPaid * 100) / 100,
    periodsRemaining,
  };
}
