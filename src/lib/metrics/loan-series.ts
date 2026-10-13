import { buildLoanSchedule, LoanValidationError } from "@/lib/loan-calculator";
import type { MonthPoint } from "./period";

/** The fields of a GET /api/loans row the monthly series needs. */
export type SeriesLoan = {
  principal: number; annualRate: number; termMonths: number | null; startDate: string;
  paymentAmount: number | null; paymentFrequency: string; extraPayment: number; residualValue: number | null;
  currency: string; remainingBalance: number | null; remainingBalanceDisplay: number | null;
  monthlyEquivalentPayment?: number | null; monthlyEquivalentPaymentDisplay: number | null;
};

export type LoanSeries = { balance: MonthPoint[]; payment: MonthPoint[]; active: MonthPoint[] };

function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Native -> display factor from the server's own conversions (so the series uses the same rate as the totals). */
function fxOf(l: SeriesLoan, displayCurrency: string): number | null {
  if (l.currency === displayCurrency) return 1;
  if (l.remainingBalance && l.remainingBalanceDisplay != null && l.remainingBalance > 0) return l.remainingBalanceDisplay / l.remainingBalance;
  if (l.monthlyEquivalentPayment && l.monthlyEquivalentPaymentDisplay != null && l.monthlyEquivalentPayment > 0) {
    return l.monthlyEquivalentPaymentDisplay / l.monthlyEquivalentPayment;
  }
  return null;
}

/**
 * Month-end balance, monthly-equivalent payment and active-loan count per month, from each loan's own amortization
 * schedule (the same buildLoanSchedule the server uses, so it works offline from the cached /api/loans rows).
 * null when any loan cannot be scheduled or converted: a partial total would be a fake series.
 */
export function buildLoanSeries(loans: SeriesLoan[], months: string[], displayCurrency: string): LoanSeries | null {
  if (loans.length === 0 || months.length === 0) return null;
  const prepared: Array<{ fx: number; startMonth: string; monthly: number; rows: Array<{ date: string; balance: number }>; principal: number; payoffMonth: string }> = [];
  for (const l of loans) {
    const fx = fxOf(l, displayCurrency);
    if (fx == null || !/^\d{4}-\d{2}-\d{2}$/.test(l.startDate)) return null;
    try {
      const s = buildLoanSchedule({
        principal: l.principal, annualRate: l.annualRate, termMonths: l.termMonths, startDate: l.startDate,
        paymentAmount: l.paymentAmount, paymentFrequency: l.paymentFrequency, extraPayment: l.extraPayment, residualValue: l.residualValue,
      });
      prepared.push({
        fx, startMonth: l.startDate.slice(0, 7), monthly: s.monthlyEquivalentPayment, principal: l.principal,
        rows: s.schedule.map((r) => ({ date: r.date, balance: r.balance })), payoffMonth: s.payoffDate.slice(0, 7),
      });
    } catch (e) {
      if (e instanceof LoanValidationError) return null;
      throw e;
    }
  }
  const balance: MonthPoint[] = [];
  const payment: MonthPoint[] = [];
  const active: MonthPoint[] = [];
  for (const month of months) {
    const end = monthEnd(month);
    let b = 0, p = 0, n = 0;
    for (const l of prepared) {
      if (month < l.startMonth) continue;
      let bal = l.principal;
      for (const r of l.rows) if (r.date <= end) bal = r.balance; else break;
      b += bal * l.fx;
      if (bal > 0.5 && month <= l.payoffMonth) { p += l.monthly * l.fx; n += 1; }
    }
    balance.push({ month, value: Math.round(b * 100) / 100 });
    payment.push({ month, value: Math.round(p * 100) / 100 });
    active.push({ month, value: n });
  }
  return { balance, payment, active };
}
