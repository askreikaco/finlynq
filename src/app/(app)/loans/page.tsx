"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Plus, Pencil, Trash2, Landmark, FileText, Calendar, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CspSafeBar } from "@/components/csp-safe-bar";
import { PageHeader } from "@/components/mobile";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { isLoanCompleted } from "@/lib/loan-status";
import type { Loan } from "./_components/loan-types";

type AmortRow = { period: number; date: string; payment: number; principal: number; interest: number; balance: number };
type AccrualRow = { month: string; interest: number };
type AmortResult = { monthlyPayment: number; totalPayments: number; totalInterest: number; payoffDate: string; residualValue: number; schedule: AmortRow[]; monthlyAccrual: AccrualRow[] };

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semi_monthly: "Semi-monthly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

const PERIODS_PER_YEAR: Record<string, number> = { weekly: 52, biweekly: 26, semi_monthly: 24, monthly: 12, quarterly: 4, annual: 1 };

// What-if is term-driven; for payment-driven loans (termMonths null) derive an
// equivalent term in months from the solved periods remaining.
function equivalentTermMonths(loan: Loan): number {
  if (loan.termMonths != null) return loan.termMonths;
  const perYear = PERIODS_PER_YEAR[loan.paymentFrequency] ?? 12;
  return Math.max(1, Math.round((loan.periodsRemaining / perYear) * 12));
}
type WhatIf = { extraPayment: number; monthsSaved: number; interestSaved: number; newPayoffDate: string; totalInterest: number };

const LOAN_TYPE_COLORS: Record<string, string> = {
  mortgage: "border-l-primary",
  lease: "border-l-warning",
  loan: "border-l-info",
  student_loan: "border-l-chart-5",
  credit_card: "border-l-destructive",
};

const LOAN_TYPE_BADGE_COLORS: Record<string, string> = {
  mortgage: "bg-primary/10 text-primary",
  lease: "bg-warning/10 text-warning",
  loan: "bg-info/10 text-info",
  student_loan: "bg-chart-5/10 text-chart-5",
  credit_card: "bg-destructive/10 text-destructive",
};

function LoansSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-48 animate-shimmer rounded-lg" />
        <div className="h-4 w-72 animate-shimmer rounded-lg mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl animate-shimmer" />
                <div className="h-4 w-24 animate-shimmer rounded" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-7 w-32 animate-shimmer rounded mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-36 animate-shimmer rounded" />
                <div className="h-5 w-16 animate-shimmer rounded-full" />
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-24 animate-shimmer rounded" />
                <div className="h-8 w-8 animate-shimmer rounded" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j}>
                  <div className="h-3 w-16 animate-shimmer rounded mb-1" />
                  <div className="h-5 w-24 animate-shimmer rounded" />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <div className="h-3 w-32 animate-shimmer rounded" />
                <div className="h-3 w-8 animate-shimmer rounded" />
              </div>
              <div className="h-2.5 w-full animate-shimmer rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LoansPageContent() {
  const router = useRouter();
  const { displayCurrency } = useDisplayCurrency();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [amort, setAmort] = useState<AmortResult | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIf[]>([]);
  const load = useCallback(() => {
    setLoadError(false);
    fetch("/api/loans")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load loans"))))
      .then((data) => { setLoans(Array.isArray(data) ? data : []); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function viewAmortization(loan: Loan) {
    setSelectedLoan(loan);
    const [amortRes, whatIfRes] = await Promise.all([
      fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "amortization", principal: loan.principal, annualRate: loan.annualRate, termMonths: loan.termMonths, startDate: loan.startDate, paymentAmount: loan.paymentAmount, extraPayment: loan.extraPayment, paymentFrequency: loan.paymentFrequency, residualValue: loan.residualValue }) }).then((r) => r.json()),
      fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "what-if", principal: loan.principal, annualRate: loan.annualRate, termMonths: equivalentTermMonths(loan), startDate: loan.startDate, extraAmounts: [100, 200, 500, 1000] }) }).then((r) => r.json()),
    ]);
    setAmort(amortRes);
    setWhatIf(Array.isArray(whatIfRes) ? whatIfRes : []);
  }

  async function handleDelete() {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await fetch(`/api/loans?id=${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  const deletingLoan = loans.find((l) => l.id === deleteId) ?? null;

  // FINLYNQ-123: totals sum the server's converted figures, NOT the native
  // ones. Adding a ₽8,116,000 balance to a USD book and labelling the result
  // "$" is an ~80x overstatement. `*Display` is null only for a row the server
  // couldn't schedule (dataIntegrity), which contributes nothing either way.
  const totalDebt = loans.reduce((s, l) => s + (l.remainingBalanceDisplay ?? 0), 0);
  // Paid-off loans sit in a collapsed "Completed" accordion and pay nothing.
  const activeLoans = loans.filter((l) => !isLoanCompleted(l));
  const completedLoans = loans.filter(isLoanCompleted);
  // Monthly-equivalent so weekly/quarterly/annual loans sum comparably.
  const totalMonthly = activeLoans.reduce((s, l) => s + (l.monthlyEquivalentPaymentDisplay ?? 0), 0);
  // Whether any loan is booked in something other than the display currency —
  // drives the "converted at today's rate" caveat on the two total tiles.
  const hasForeignLoan = loans.some((l) => l.currency && l.currency !== displayCurrency);

  const renderLoan = (loan: Loan) => {
        const paidPct = loan.principal > 0 ? ((loan.principal - loan.remainingBalance) / loan.principal) * 100 : 0;
        const borderClass = LOAN_TYPE_COLORS[loan.type] || "border-l-border";
        const badgeClass = LOAN_TYPE_BADGE_COLORS[loan.type] || "";
        return (
          <Card key={loan.id} className={`border-l-4 ${borderClass}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle>{loan.name}</CardTitle>
                  <Badge variant="secondary" className={badgeClass}>{loan.type}</Badge>
                  {loan.currency !== displayCurrency && (
                    <Badge variant="outline" className="font-mono text-xs">{loan.currency}</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => viewAmortization(loan)}>View Schedule</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit loan ${loan.name}`} onClick={() => router.push(`/loans/${loan.id}/edit`)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Delete loan ${loan.name}`} onClick={() => setDeleteId(loan.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Remaining{loan.balanceSource === "account" && <span className="ml-1 text-pos" title={`Live balance from ${loan.accountName ?? "linked account"}`}>· from account</span>}</p>
                  <p className="font-mono font-bold text-destructive">{formatCurrency(loan.remainingBalance, loan.currency)}</p>
                  {loan.currency !== displayCurrency && loan.remainingBalanceDisplay != null && (
                    <p className="text-xs text-muted-foreground font-mono">≈ {formatCurrency(loan.remainingBalanceDisplay, displayCurrency)}</p>
                  )}
                </div>
                <div><p className="text-xs text-muted-foreground">{FREQUENCY_LABELS[loan.paymentFrequency] ?? "Payment"}</p><p className="font-mono">{formatCurrency(loan.paymentPerPeriod ?? loan.monthlyPayment, loan.currency)}</p></div>
                <div><p className="text-xs text-muted-foreground">Rate</p><p className="font-mono">{loan.annualRate}%</p></div>
                <div><p className="text-xs text-muted-foreground">Total Interest</p><p className="font-mono">{formatCurrency(loan.totalInterest, loan.currency)}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">{loan.type === "lease" ? "Term end" : "Payoff"}</p>
                  <p className="font-mono">{loan.payoffDate}</p>
                  {loan.type === "lease" && loan.residualValue != null && loan.residualValue > 0 && (
                    <p className="text-xs text-muted-foreground">residual {formatCurrency(loan.residualValue, loan.currency)}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span>Principal paid: {formatCurrency(loan.principalPaid, loan.currency)}</span><span>{Math.round(paidPct)}%</span></div>
                <CspSafeBar
                  percent={paidPct}
                  className="bg-destructive/10"
                  fillClassName="bg-pos"
                  ariaLabel={`Loan ${loan.name} paid`}
                />
              </div>
            </CardContent>
          </Card>
        );
  };

  if (loading) return <LoansSkeleton />;
  if (loadError) return <ErrorState title="Couldn't load loans" message="We couldn't load your loans. Please try again." onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="space-y-6">
      <PageHeader
        className="flex flex-wrap items-center justify-between gap-3"
        title="Loans & Debt"
        subtitle="Track balances, amortization schedules, and payoff strategies"
        actionsClassName="contents"
        actions={
        <>
        {/* Create is a full page (iOS navigation), not a dialog. */}
        <Button id="add-loan-btn" onClick={() => router.push("/loans/new")}><Plus className="h-4 w-4 mr-1" /> Add Loan</Button>
        </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                <Landmark className="h-5 w-5 text-destructive" />
              </div>
              <CardTitle className="text-sm text-muted-foreground">Total Debt</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDebt, displayCurrency)}</p>
            {hasForeignLoan && <p className="text-xs text-muted-foreground mt-1">converted at today&apos;s rates</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10">
                <Calendar className="h-5 w-5 text-warning" />
              </div>
              <CardTitle className="text-sm text-muted-foreground">Monthly Payments</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalMonthly, displayCurrency)}</p>
            {hasForeignLoan && <p className="text-xs text-muted-foreground mt-1">converted at today&apos;s rates</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-sm text-muted-foreground">Active Loans</CardTitle>
            </div>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{activeLoans.length}</p></CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {loans.length === 0 && (
        <EmptyState
          icon={Landmark}
          title="No loans tracked yet"
          description="Add a mortgage, car loan, student loan, or any other debt to see amortization schedules and payoff projections."
          action={{ label: "Add your first loan", onClick: () => router.push("/loans/new") }}
        />
      )}

      {/* Loan cards */}
      {activeLoans.map(renderLoan)}

      {/* Paid-off loans: collapsed by default */}
      {completedLoans.length > 0 && (
        <Accordion defaultValue={null}>
          <AccordionItem
            value="completed"
            icon={<CheckCircle2 className="h-4 w-4" />}
            title={`Completed (${completedLoans.length})`}
            description="Paid-off loans"
          >
            <div className="space-y-6">{completedLoans.map(renderLoan)}</div>
          </AccordionItem>
        </Accordion>
      )}

      {/* Amortization detail modal */}
      {selectedLoan && amort && (
        <Card>
          {/* Every figure in this panel comes from the schedule the server
              computed in the loan's OWN currency — never the display one. */}
          <CardHeader><CardTitle>Amortization: {selectedLoan.name} <span className="text-sm font-normal text-muted-foreground font-mono">({selectedLoan.currency})</span></CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="chart">
              <TabsList><TabsTrigger value="chart">Chart</TabsTrigger><TabsTrigger value="table">Table</TabsTrigger><TabsTrigger value="monthly">Monthly Interest</TabsTrigger><TabsTrigger value="whatif">What-If</TabsTrigger></TabsList>
              <TabsContent value="chart">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={amort.schedule.filter((_, i) => i % Math.max(1, Math.floor(amort.schedule.length / 60)) === 0)}>
                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} /><YAxis fontSize={10} tickLine={false} axisLine={false} /><Tooltip /><Legend />
                    <Bar dataKey="principal" fill="#10b981" name="Principal" stackId="a" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="interest" fill="#f43f5e" name="Interest" stackId="a" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={200} className="mt-4">
                  <LineChart data={amort.schedule.filter((_, i) => i % Math.max(1, Math.floor(amort.schedule.length / 60)) === 0)}>
                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} /><YAxis fontSize={10} tickLine={false} axisLine={false} /><Tooltip />
                    <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={false} name="Balance" />
                  </LineChart>
                </ResponsiveContainer>
              </TabsContent>
              <TabsContent value="table">
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Payment</TableHead><TableHead>Principal</TableHead><TableHead>Interest</TableHead><TableHead>Balance</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {amort.schedule.map((r) => (
                        <TableRow key={r.period}><TableCell>{r.period}</TableCell><TableCell>{r.date}</TableCell><TableCell>{formatCurrency(r.payment, selectedLoan.currency)}</TableCell><TableCell className="text-pos">{formatCurrency(r.principal, selectedLoan.currency)}</TableCell><TableCell className="text-destructive">{formatCurrency(r.interest, selectedLoan.currency)}</TableCell><TableCell className="font-mono">{formatCurrency(r.balance, selectedLoan.currency)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="monthly">
                <p className="text-sm text-muted-foreground mb-4">Interest accrued per calendar month — the reportable figure, day-weighted when payments straddle month boundaries.</p>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Interest Accrued</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(amort.monthlyAccrual ?? []).map((m) => (
                        <TableRow key={m.month}><TableCell className="font-mono">{m.month}</TableCell><TableCell className="text-destructive font-mono">{formatCurrency(m.interest, selectedLoan.currency)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="whatif">
                <p className="text-sm text-muted-foreground mb-4">What if you added extra monthly payments? Amounts are in {selectedLoan.currency}.</p>
                <Table>
                  <TableHeader><TableRow><TableHead>Extra/Month</TableHead><TableHead>Months Saved</TableHead><TableHead>Interest Saved</TableHead><TableHead>New Payoff</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {whatIf.map((w) => (
                      <TableRow key={w.extraPayment}><TableCell className="font-mono">{formatCurrency(w.extraPayment, selectedLoan.currency)}</TableCell><TableCell className="text-pos font-bold">{w.monthsSaved} months</TableCell><TableCell className="text-pos font-bold">{formatCurrency(w.interestSaved, selectedLoan.currency)}</TableCell><TableCell>{w.newPayoffDate}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete loan"
        description={<>Are you sure you want to delete <strong>{deletingLoan?.name ?? "this loan"}</strong>? This cannot be undone.</>}
        confirmLabel="Delete loan"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function LoansPage() { return <LoansPageContent />; }
