"use client";

import type { MetricCardProps } from "@/components/metric-card";
import { Suspense, useMemo, useState } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { CalendarClock, CheckCircle2, Landmark, ListChecks, Table2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CspSafeBar } from "@/components/csp-safe-bar";
import { MetricGrid, DetailSheet, SectionCard, ListRow, ListDetailLayout, ListDetailNewButton, useListDetail, type DetailItem } from "@/components/mobile";
import { LoanFormPanel } from "./_components/loan-form-panel";
import { LoanDetail, LoanProgress, FREQUENCY_LABELS, loanDetailItems } from "./_components/loan-detail";
import { LoanAmortization } from "./_components/loan-amortization";
import { PageToolbar } from "@/components/page-toolbar";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { LOAN_FILTER_KEYS, LOAN_SORTS } from "@/lib/toolbar/list-configs";
import { sortRecords } from "@/lib/toolbar/sort";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { compareCaption, monthsBetween, seriesWindow } from "@/lib/metrics/period";
import { NO_HISTORY_CAPTION, resolveCard } from "@/lib/metrics/delta";
import { buildLoanSeries } from "@/lib/metrics/loan-series";
import { STATUS_DOT } from "@/lib/status-colour";
import { SectionPage } from "@/components/templates/section-page";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { isLoanCompleted } from "@/lib/loan-status";
import { localDateISO } from "@/lib/utils/date";
import type { Loan } from "./_components/loan-types";
import { loanNextDue } from "./_components/loan-next-due";

function LoansSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div>
        <div className="h-8 w-48 animate-shimmer rounded-lg" />
        <div className="h-4 w-72 animate-shimmer rounded-lg mt-2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 animate-shimmer rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-32 animate-shimmer rounded mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-border/50 bg-card p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="space-y-2">
              <div className="h-4 w-36 animate-shimmer rounded" />
              <div className="h-3 w-24 animate-shimmer rounded" />
            </div>
            <div className="h-5 w-20 animate-shimmer rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Same rose as the Total debt card sparkline (a literal colour: SVG gradient stops cannot resolve var()). */
const DEBT_CHART_COLOR = "#f43f5e";

type LoanTrend = { values: number[]; labels: string[] };

/** One loan row (the shared ListRow): status dot, name + rate/payment, balance chart, paid / principal bar, remaining balance. */
function LoanRow({ loan, paidOff, displayCurrency, onOpen, selected, trend }: { loan: Loan; paidOff: boolean; displayCurrency: string; onOpen: () => void; selected?: boolean; trend?: LoanTrend | null }) {
  const payment = loan.paymentPerPeriod ?? loan.monthlyPayment;
  const freq = FREQUENCY_LABELS[loan.paymentFrequency];
  const shown = loan.remainingBalanceDisplay;
  const converted = loan.currency !== displayCurrency && shown != null;
  const paidPct = loan.principal > 0 && loan.remainingBalance != null ? ((loan.principal - loan.remainingBalance) / loan.principal) * 100 : 0;
  return (
    <ListRow
      slot="loan"
      title={loan.name}
      subtitle={`${loan.annualRate}% · ${formatCurrency(payment, loan.currency)}${freq ? ` ${freq.toLowerCase()}` : ""}`}
      dot={STATUS_DOT[paidOff ? "completed" : "active"]}
      value={loan.remainingBalance != null ? formatCurrency(loan.remainingBalance, loan.currency) : "—"}
      delta={converted ? `≈ ${formatCurrency(shown, displayCurrency)}` : paidOff ? "Paid off" : `of ${formatCurrency(loan.principal, loan.currency)}`}
      deltaTitle="Remaining balance"
      trend={trend?.values ?? null}
      trendLabels={trend?.labels}
      trendColor={DEBT_CHART_COLOR}
      currency={displayCurrency}
      progress={{ pct: paidPct, tone: paidOff ? "pos" : "primary", label: `${Math.round(Math.min(100, Math.max(0, paidPct)))}%`, aria: `Loan ${loan.name} paid` }}
      strike={paidOff}
      chevron={false}
      selected={selected}
      onPress={onOpen}
    />
  );
}

function LoansPageContent() {
  const router = useRouter();
  const { displayCurrency } = useDisplayCurrency();
  // Split view (regular+): a row opens the edit form in the pane (?sel=<id>); phones keep the detail sheet.
  const detail = useListDetail();
  // Cache-first when the local read cache is on (Settings > Data > Offline mode); a plain fetch otherwise.
  const { data: loansData, loading, error: loadError, reload: load } = useCacheFirstJson<Loan[]>("/api/loans");
  const loans = useMemo(() => (Array.isArray(loansData) ? loansData : []), [loansData]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const openLoan = (id: number) => (detail.split ? detail.select(id) : setDetailId(id));
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  // Phones: "View schedule" in the detail sheet opens the amortization panel below the list. Split view: the pane's detail has its own.
  function viewAmortization(loan: Loan) {
    setDetailId(null);
    setSelectedLoan(loan);
  }

  // Create and edit are full pages (iOS navigation), not dialogs.
  function editLoan(loan: Loan) {
    router.push(`/loans/${loan.id}/edit`);
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
  const detailLoan = loans.find((l) => l.id === detailId) ?? null;

  // FINLYNQ-123: totals sum the server's converted figures, NOT the native
  // ones. Adding a ₽8,116,000 balance to a USD book and labelling the result
  // "$" is an ~80x overstatement. `*Display` is null only for a row the server
  // couldn't schedule (dataIntegrity), which contributes nothing either way.
  const totalDebt = loans.reduce((s, l) => s + (l.remainingBalanceDisplay ?? 0), 0);
  // Paid-off loans sit in a collapsed "Completed" accordion and pay nothing.
  const activeLoans = loans.filter((l) => !isLoanCompleted(l));
  // Toolbar: search, filter page (status, type) and sort apply to the lists; the cards cover every loan.
  const tb = useListToolbar({ filterPath: "/filter/loans", sorts: LOAN_SORTS, filterKeys: LOAN_FILTER_KEYS });
  const needle = tb.q.trim().toLowerCase();
  const shownLoans = sortRecords(
    loans.filter(
      (l) =>
        (!tb.filters.type || l.type === tb.filters.type) &&
        (!needle || `${l.name ?? ""} ${l.accountName ?? ""}`.toLowerCase().includes(needle)),
    ),
    tb.sort,
    { date: (l) => l.payoffDate, name: (l) => l.name, amount: (l) => l.remainingBalanceDisplay ?? l.remainingBalance },
  );
  const activeList = tb.filters.status === "completed" ? [] : shownLoans.filter((l) => !isLoanCompleted(l));
  const completedList = tb.filters.status === "active" ? [] : shownLoans.filter(isLoanCompleted);
  // Monthly-equivalent so weekly/quarterly/annual loans sum comparably.
  const totalMonthly = activeLoans.reduce((s, l) => s + (l.monthlyEquivalentPaymentDisplay ?? 0), 0);
  // Whether any loan is booked in something other than the display currency —
  // drives the "converted at today's rate" caveat on the two total tiles.
  const hasForeignLoan = loans.some((l) => l.currency && l.currency !== displayCurrency);
  const today = localDateISO();
  const caveat = hasForeignLoan ? "converted at today's rates" : undefined;

  // Metric cards: current value for the selected period, % + signed difference vs the previous period, and the
  // monthly series from each loan's own amortization schedule (computed from the same /api/loans rows, so offline too).
  const { selection, explicit, period, setSelection } = useMetricRange();
  const win = seriesWindow(period);
  const loanSeries = useMemo(
    () => buildLoanSeries(loans, monthsBetween(`${win.from}-01`, `${win.to}-01`), displayCurrency),
    [loans, win.from, win.to, displayCurrency],
  );
  // Per-loan balance history for the row chart (own schedule, display currency). No series = no chart, never fake data.
  const trendOf = useMemo(() => {
    const m = new Map<number, LoanTrend | null>();
    const months = monthsBetween(`${win.from}-01`, `${win.to}-01`);
    for (const l of loans) {
      const pts = buildLoanSeries([l], months, displayCurrency)?.balance ?? null;
      m.set(l.id, pts && pts.length > 1 ? { values: pts.map((p) => p.value), labels: pts.map((p) => p.month) } : null);
    }
    return m;
  }, [loans, win.from, win.to, displayCurrency]);
  const caption = compareCaption(selection);
  const common = { period, isDefault: !explicit, currency: displayCurrency, caption } as const;
  const debtCard = resolveCard({ ...common, points: loanSeries?.balance, mode: "last", pageValue: totalDebt, kind: "money" });
  const payCard = resolveCard({ ...common, points: loanSeries?.payment, mode: "last", pageValue: totalMonthly, kind: "money" });
  const activeCard = resolveCard({ ...common, points: loanSeries?.active, mode: "last", pageValue: activeLoans.length, kind: "count" });
  const metrics: MetricCardProps[] = [
    {
      id: "total-debt", label: "Total debt", icon: Landmark, tone: "rose", value: debtCard.value ?? totalDebt, currency: displayCurrency,
      delta: { pct: debtCard.badgePct, text: debtCard.delta ?? NO_HISTORY_CAPTION, invert: true }, note: caveat,
      sparkData: debtCard.sparkData, sparkLabels: debtCard.sparkLabels, sparkColor: "#f43f5e",
    },
    {
      id: "monthly-payments", label: "Monthly payments", icon: CalendarClock, tone: "amber", value: payCard.value ?? totalMonthly, currency: displayCurrency,
      delta: { pct: payCard.badgePct, text: payCard.delta ?? NO_HISTORY_CAPTION, invert: true }, note: caveat,
      sparkData: payCard.sparkData, sparkLabels: payCard.sparkLabels, sparkColor: "#f59e0b",
    },
    {
      id: "active-loans", label: "Active loans", icon: ListChecks, tone: "indigo", value: <span>{Math.round(activeCard.value ?? activeLoans.length)}</span>,
      delta: { pct: activeCard.badgePct, text: activeCard.delta ?? NO_HISTORY_CAPTION, invert: true },
      sparkData: activeCard.sparkData, sparkLabels: activeCard.sparkLabels, sparkColor: "#6366f1",
    },
  ];

  if (loading) return <LoansSkeleton />;
  if (loadError) return <ErrorState title="Couldn't load loans" message="We couldn't load your loans. Please try again." onRetry={load} />;

  const detailPaidOff = detailLoan ? isLoanCompleted(detailLoan) : false;
  const detailNextDue = detailLoan ? loanNextDue(detailLoan, detailPaidOff, today) : null;

  return (
    <SectionPage
      id="loans"
      title="Loans & Debt"
      info="Track balances, amortization schedules, and payoff strategies"
      width="report"
            header={{
        filter: { href: tb.filterHref, activeCount: tb.activeCount },
        actions: (
          <ListDetailNewButton href="/loans/new" label="Add Loan" />
        ),
      }}
    >
      <ListDetailLayout
          entity="loan"
          newLabel="Add Loan"
          detailTitle="Loan"
          detailHref={(id) => `/loans/${id}`}
          renderDetail={(id) => <LoanDetail id={id} compact />}
          renderForm={(api) => (
            <LoanFormPanel
              embedded
              mode={api.isNew ? "create" : "edit"}
              id={api.selectedId ?? undefined}
              onSaved={() => { load(); api.afterSaved(); }}
              onCancel={api.cancel}
              onDeleted={() => { load(); api.afterDeleted(); }}
            />
          )}
      >
      <PageToolbar refresh
        range={{ selection, onChange: setSelection }}
        search={{ value: tb.q, onChange: tb.setQ, placeholder: "Search loans" }}
      />
      <MetricGrid metrics={metrics} />

            <div className="space-y-6">
              {loans.length === 0 && (
                <EmptyState
                  icon={Landmark}
                  title="No loans tracked yet"
                  description="Add a mortgage, car loan or other debt."
                  action={{ label: "Add your first loan", onClick: () => (detail.split ? detail.selectNew() : router.push("/loans/new")) }}
                />
              )}
          {activeList.length > 0 && (
            <SectionCard label="Active" icon={Landmark} tone="indigo" list className="[&>*]:min-w-0">
              {activeList.map((loan) => (
                <LoanRow key={loan.id} loan={loan} paidOff={false} displayCurrency={displayCurrency} onOpen={() => openLoan(loan.id)} selected={detail.selectedId === String(loan.id)} trend={trendOf.get(loan.id)} />
              ))}
            </SectionCard>
          )}

          {/* Paid-off loans: collapsed by default */}
          {completedList.length > 0 && (
            <Accordion defaultValue={null}>
              <AccordionItem
                value="completed"
                icon={<CheckCircle2 className="h-4 w-4" />}
                title={`Completed (${completedList.length})`}
                description="Paid-off loans"
              >
                <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                  {completedList.map((loan) => (
                    <LoanRow key={loan.id} loan={loan} paidOff displayCurrency={displayCurrency} onOpen={() => openLoan(loan.id)} selected={detail.selectedId === String(loan.id)} trend={trendOf.get(loan.id)} />
                  ))}
                </div>
              </AccordionItem>
            </Accordion>
          )}

          {/* Amortization panel (phones; in the split view the pane's detail has the schedule). */}
          {selectedLoan && !detail.split && (
            <SectionCard label={`Amortization: ${selectedLoan.name} (${selectedLoan.currency})`} icon={Table2} tone="cyan">
              <LoanAmortization loan={selectedLoan} />
            </SectionCard>
          )}
            </div>
      </ListDetailLayout>

      {detailLoan && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) setDetailId(null); }}
          title={detailLoan.name}
          description={`${detailLoan.currency} loan`}
          items={loanDetailItems(detailLoan, displayCurrency, detailNextDue, detailPaidOff)}
        >
          <LoanProgress loan={detailLoan} />
          <Button variant="outline" onClick={() => viewAmortization(detailLoan)}>View schedule</Button>
          <Button variant="outline" onClick={() => { setDetailId(null); editLoan(detailLoan); }}>Edit</Button>
          <Button variant="outline" className="text-destructive" onClick={() => { setDetailId(null); setDeleteId(detailLoan.id); }}>Delete</Button>
        </DetailSheet>
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
    </SectionPage>
  );
}

export default function LoansPage() {
  return (
    <Suspense fallback={<LoansSkeleton />}>
      <LoansPageContent />
    </Suspense>
  );
}
