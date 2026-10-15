"use client";

/**
 * LoanDetail: THE loan detail content (remaining balance, paid progress, fields, amortization schedule and what-if).
 * The /loans split view renders it in the pane (one narrow column); /loans/[id] renders it inside DetailPage (the header).
 * Editing and deleting live in the loan form (LoanFormPanel), which the pane header's Edit opens.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { CspSafeBar } from "@/components/csp-safe-bar";
import { ErrorState } from "@/components/error-state";
import { formatCurrency } from "@/lib/currency";
import { isLoanCompleted } from "@/lib/loan-status";
import { localDateISO } from "@/lib/utils/date";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useDisplayCurrency } from "@/components/currency-provider";
import { DetailList, usePaneTitle, type DetailItem } from "@/components/mobile";
import type { Loan } from "./loan-types";
import { loanNextDue } from "./loan-next-due";
import { LoanAmortization } from "./loan-amortization";

export const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semi_monthly: "Semi-monthly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

/** Label/value rows for a loan (the phone sheet and the detail share them). Every money figure is in the loan's own currency. */
export function loanDetailItems(loan: Loan, displayCurrency: string, nextDue: string | null, paidOff: boolean): DetailItem[] {
  const payment = loan.paymentPerPeriod ?? loan.monthlyPayment;
  const shownRemaining = loan.remainingBalanceDisplay;
  const converted = loan.currency !== displayCurrency && shownRemaining != null;
  return [
    { label: "Type", value: loan.type.replace("_", " ") },
    { label: "Principal", value: formatCurrency(loan.principal, loan.currency) },
    {
      label: "Remaining",
      value: converted
        ? `${formatCurrency(loan.remainingBalance, loan.currency)} (≈ ${formatCurrency(shownRemaining, displayCurrency)})`
        : formatCurrency(loan.remainingBalance, loan.currency),
    },
    { label: "Rate", value: `${loan.annualRate}%` },
    { label: FREQUENCY_LABELS[loan.paymentFrequency] ?? "Payment", value: formatCurrency(payment, loan.currency) },
    { label: "Next due (est.)", value: nextDue ?? (paidOff ? "Paid off" : "—") },
    { label: "Total interest", value: formatCurrency(loan.totalInterest, loan.currency) },
    {
      label: loan.type === "lease" ? "Term end" : "Payoff",
      value: loan.type === "lease" && loan.residualValue != null && loan.residualValue > 0
        ? `${loan.payoffDate} (residual ${formatCurrency(loan.residualValue, loan.currency)})`
        : loan.payoffDate,
    },
  ];
}

export function LoanProgress({ loan }: { loan: Loan }) {
  const paidPct = loan.principal > 0 ? ((loan.principal - loan.remainingBalance) / loan.principal) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs">
        <span>Principal paid: {formatCurrency(loan.principalPaid, loan.currency)}</span>
        <span>{Math.round(paidPct)}%</span>
      </div>
      <CspSafeBar percent={paidPct} className="bg-destructive/10" fillClassName="bg-pos" ariaLabel={`Loan ${loan.name} paid`} />
    </div>
  );
}

/**
 * The detail content of one loan. The pane renders it `compact` (charts sized to the 25% pane); /loans/[id] wraps it in
 * DetailPage, which owns the header.
 */
export function LoanDetail({ id: idProp, compact = false }: { id: string | number; compact?: boolean }) {
  const id = Number(idProp);
  const { displayCurrency } = useDisplayCurrency();
  const { data, loading, error } = useCacheFirstJson<Loan[]>("/api/loans");
  const loans = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const loan = loans.find((l) => l.id === id) ?? null;
  usePaneTitle(loan?.name);

  if (!loan) {
    return loading
      ? <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-shimmer rounded-xl" />)}</div>
      : (
        <ErrorState
          title={error ? "Couldn't load loan" : "Loan not found"}
          message={error ? "We couldn't load this loan. Please try again." : "This loan doesn't exist, or it isn't one of yours."}
        />
      );
  }

  const paidOff = isLoanCompleted(loan);
  const nextDue = loanNextDue(loan, paidOff, localDateISO());
  const shown = loan.remainingBalanceDisplay;
  const converted = loan.currency !== displayCurrency && shown != null;
  return (
    <div className="w-full space-y-4" data-testid="loan-detail-root">
      <div className="flex max-w-full flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">{loan.currency}</Badge>
        {paidOff && <Badge variant="secondary" className="text-xs">Paid off</Badge>}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Remaining balance</p>
        <p className="text-xl font-semibold tabular-nums">{loan.remainingBalance != null ? formatCurrency(loan.remainingBalance, loan.currency) : "—"}</p>
        {converted && <p className="text-xs text-muted-foreground">≈ {formatCurrency(shown, displayCurrency)}</p>}
      </div>
      <LoanProgress loan={loan} />
      <DetailList items={loanDetailItems(loan, displayCurrency, nextDue, paidOff)} />
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Schedule</h3>
        <LoanAmortization loan={loan} compact={compact} />
      </section>
    </div>
  );
}
