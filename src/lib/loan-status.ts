/** Paid off: nothing left to pay (balance rounds to zero or no periods remain). */
export function isLoanCompleted(loan: { remainingBalance: number; periodsRemaining: number }): boolean {
  return loan.remainingBalance <= 0.5 || loan.periodsRemaining <= 0;
}
