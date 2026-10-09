/** GET /api/loans row as the loans pages use it. Amounts are in `currency` (the loan's own). */
export type Loan = {
  id: number; name: string; type: string; principal: number; annualRate: number;
  termMonths: number | null; startDate: string; paymentFrequency: string; extraPayment: number;
  paymentAmount: number | null; residualValue: number | null;
  monthlyPayment: number; paymentPerPeriod: number; monthlyEquivalentPayment: number;
  totalInterest: number; payoffDate: string;
  remainingBalance: number; balanceSource: "account" | "projection" | null;
  principalPaid: number; interestPaid: number; periodsRemaining: number;
  accountName: string | null;
  accountId: number | null;
  // FINLYNQ-123 dual basis. Every amount above is in `currency` (the loan's
  // own). The `*Display` companions are the server's current-rate conversion
  // into `displayCurrency` and are the ONLY figures safe to sum across loans.
  currency: string;
  displayCurrency: string;
  remainingBalanceDisplay: number | null;
  monthlyEquivalentPaymentDisplay: number | null;
};

export type LoanAccount = { id: number; name: string; currency?: string | null };

export const LOAN_TYPE_OPTIONS = [
  { value: "mortgage", label: "Mortgage" },
  { value: "lease", label: "Lease" },
  { value: "loan", label: "Loan" },
  { value: "student_loan", label: "Student Loan" },
  { value: "credit_card", label: "Credit Card" },
] as const;
