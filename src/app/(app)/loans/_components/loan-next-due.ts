import { addDays, nextOnOrAfter, normalizeFrequency } from "@/lib/subscriptions/schedule";
import { isLoanCompleted } from "@/lib/loan-status";
import type { Loan } from "./loan-types";

/**
 * Estimated next payment date for a loan, YYYY-MM-DD, or null when there is none.
 *
 * The loans API does not return a next-due date. The amortization schedule (loan-calculator)
 * puts payment i at startDate + i periods, so the first payment is one period after the start.
 * This derives the next occurrence on or after `today` from startDate and paymentFrequency.
 * Null for paid-off loans and for frequencies the subscription cadence cannot express
 * (semi_monthly). Callers label it "estimated".
 */
export function loanNextDue(loan: Pick<Loan, "startDate" | "paymentFrequency">, completed: boolean, today: string): string | null {
  if (completed) return null;
  const freq = normalizeFrequency(loan.paymentFrequency);
  if (!freq || !loan.startDate) return null;
  // Occurrence 0 is the start date itself, which is not a payment. Search from the later of
  // today and the day after the start. nextOnOrAfter also projects occurrences before the anchor,
  // so this lower bound is what keeps the result a real payment date.
  const from = today > loan.startDate ? today : addDays(loan.startDate, 1);
  return nextOnOrAfter(loan.startDate, freq, from);
}
