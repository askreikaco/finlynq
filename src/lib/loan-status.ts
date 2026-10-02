/**
 * Paid off: nothing left to pay (balance rounds to zero or no periods remain).
 *
 * `GET /api/loans` returns `remainingBalance`/`periodsRemaining` as `null` for a
 * loan it couldn't schedule (`dataIntegrity` rows). That is NOT paid off — it is
 * the loan most in need of attention — and `null <= 0.5` is `true` in JS, so an
 * unguarded comparison filed it under the collapsed "Completed" section.
 */
export function isLoanCompleted(loan: {
  remainingBalance: number | null;
  periodsRemaining: number | null;
}): boolean {
  if (loan.remainingBalance == null || loan.periodsRemaining == null) return false;
  return loan.remainingBalance <= 0.5 || loan.periodsRemaining <= 0;
}
