"use client";

/**
 * LoanAmortization: THE amortization view of one loan (chart, schedule, monthly interest, what-if). Every figure comes from the
 * schedule the server computed in the loan's OWN currency. The /loans page renders it in a SectionCard (phones); the loan
 * detail renders it `compact` in the split-view pane (charts sized to the 25% pane).
 */
import { useEffect, useState } from "react";
import { CalendarClock, Percent, TrendingDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { TxRow } from "@/components/mobile";
import { formatCurrency } from "@/lib/currency";
import type { Loan } from "./loan-types";
import { InfoTip } from "@/components/ui/info-tip";

type AmortRow = { period: number; date: string; payment: number; principal: number; interest: number; balance: number };
type AccrualRow = { month: string; interest: number };
type AmortResult = { monthlyPayment: number; totalPayments: number; totalInterest: number; payoffDate: string; residualValue: number; schedule: AmortRow[]; monthlyAccrual: AccrualRow[] };
type WhatIf = { extraPayment: number; monthsSaved: number; interestSaved: number; newPayoffDate: string; totalInterest: number };

export const PERIODS_PER_YEAR: Record<string, number> = { weekly: 52, biweekly: 26, semi_monthly: 24, monthly: 12, quarterly: 4, annual: 1 };

// What-if is term-driven; for payment-driven loans (termMonths null) derive an
// equivalent term in months from the solved periods remaining.
export function equivalentTermMonths(loan: Loan): number {
  if (loan.termMonths != null) return loan.termMonths;
  const perYear = PERIODS_PER_YEAR[loan.paymentFrequency] ?? 12;
  return Math.max(1, Math.round((loan.periodsRemaining / perYear) * 12));
}

function post(body: Record<string, unknown>) {
  return fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
}

export function LoanAmortization({ loan, compact = false }: { loan: Loan; compact?: boolean }) {
  const [amort, setAmort] = useState<AmortResult | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIf[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([
      post({ action: "amortization", principal: loan.principal, annualRate: loan.annualRate, termMonths: loan.termMonths, startDate: loan.startDate, paymentAmount: loan.paymentAmount, extraPayment: loan.extraPayment, paymentFrequency: loan.paymentFrequency, residualValue: loan.residualValue }),
      post({ action: "what-if", principal: loan.principal, annualRate: loan.annualRate, termMonths: equivalentTermMonths(loan), startDate: loan.startDate, extraAmounts: [100, 200, 500, 1000] }),
    ])
      .then(([amortRes, whatIfRes]) => {
        if (!live) return;
        setAmort(amortRes);
        setWhatIf(Array.isArray(whatIfRes) ? whatIfRes : []);
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [loan]);

  if (failed) return <p className="text-sm text-muted-foreground">Couldn&apos;t load the schedule.</p>;
  if (!amort || !Array.isArray(amort.schedule)) return <div className="h-40 animate-shimmer rounded-xl" />;
  const sampled = amort.schedule.filter((_, i) => i % Math.max(1, Math.floor(amort.schedule.length / 60)) === 0);
  const rowsMax = compact ? "max-h-72" : "max-h-[60dvh]";
  return (
    <Tabs defaultValue="chart" data-testid="loan-amortization" data-compact={compact ? "true" : undefined}>
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="chart">Chart</TabsTrigger>
        <TabsTrigger value="table">Schedule</TabsTrigger>
        <TabsTrigger value="monthly">{compact ? "Interest" : "Monthly Interest"}</TabsTrigger>
        <TabsTrigger value="whatif">What-If</TabsTrigger>
      </TabsList>
      <TabsContent value="chart">
        <ResponsiveContainer width="100%" height={compact ? 180 : 300}>
          <BarChart data={sampled}>
            <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} hide={compact} /><YAxis fontSize={10} tickLine={false} axisLine={false} hide={compact} /><Tooltip /><Legend />
            <Bar dataKey="principal" fill="#10b981" name="Principal" stackId="a" radius={[2, 2, 0, 0]} />
            <Bar dataKey="interest" fill="#f43f5e" name="Interest" stackId="a" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={compact ? 140 : 200} className="mt-4">
          <LineChart data={sampled}>
            <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} hide={compact} /><YAxis fontSize={10} tickLine={false} axisLine={false} hide={compact} /><Tooltip />
            <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={false} name="Balance" />
          </LineChart>
        </ResponsiveContainer>
      </TabsContent>
      <TabsContent value="table">
        <div className={`${rowsMax} overflow-y-auto [&>*:not(:last-child)]:shadow-[var(--list-divider)]`}>
          {amort.schedule.map((r) => (
            <TxRow
              key={r.period}
              icon={CalendarClock}
              title={`#${r.period} · ${r.date}`}
              subtitle={`Principal ${formatCurrency(r.principal, loan.currency)} · Interest ${formatCurrency(r.interest, loan.currency)}`}
              amount={-r.payment}
              currency={loan.currency}
              meta={`Balance ${formatCurrency(r.balance, loan.currency)}`}
            />
          ))}
        </div>
      </TabsContent>
      <TabsContent value="monthly">
        <div className="mb-2 flex items-center gap-0.5 text-sm text-muted-foreground">
          Interest by month
          <InfoTip label="About monthly interest" text="Interest accrued per calendar month — the reportable figure, day-weighted when payments straddle month boundaries." />
        </div>
        <div className={`${rowsMax} overflow-y-auto [&>*:not(:last-child)]:shadow-[var(--list-divider)]`}>
          {(amort.monthlyAccrual ?? []).map((m) => (
            <TxRow key={m.month} icon={Percent} tile="neg" title={m.month} amount={m.interest} currency={loan.currency} amountTone="neg" />
          ))}
        </div>
      </TabsContent>
      <TabsContent value="whatif">
        <div className="mb-2 flex items-center gap-0.5 text-sm text-muted-foreground">
          Extra payments ({loan.currency})
          <InfoTip label="About extra payments" text={`What if you added extra monthly payments? Amounts are in ${loan.currency}.`} />
        </div>
        <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
          {whatIf.map((w) => (
            <TxRow
              key={w.extraPayment}
              icon={TrendingDown}
              tile="pos"
              title={`Extra ${formatCurrency(w.extraPayment, loan.currency)} / month`}
              subtitle={`New payoff ${w.newPayoffDate}`}
              value={<span className="tabular-nums text-sm font-semibold text-pos">{w.monthsSaved} months</span>}
              meta={`Interest saved ${formatCurrency(w.interestSaved, loan.currency)}`}
              metaTone="pos"
            />
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
