"use client";

import { Suspense, useMemo, type MouseEvent } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useRouter } from "next/navigation";
import { Card, type CardProps } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { CalendarClock, CheckCircle2, Landmark, ListChecks } from "lucide-react";
import { MetricGrid, ListRow, ListDetailLayout, useListDetail } from "@/components/mobile";
import { Notice } from "@/components/notice";
import { LoanFormPanel } from "./_components/loan-form-panel";
import { LoanDetail, FREQUENCY_LABELS } from "./_components/loan-detail";
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
import type { Loan } from "./_components/loan-types";

function LoansSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div>
        <div className="h-8 w-48 animate-shimmer rounded-lg" />
        <div className="h-4 w-72 animate-shimmer rounded-lg mt-2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} loading />
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
function LoanRow({ loan, paidOff, displayCurrency, href, onPress, selected, trend }: { loan: Loan; paidOff: boolean; displayCurrency: string; href: string; onPress: (e: MouseEvent<HTMLElement>) => void; selected?: boolean; trend?: LoanTrend | null }) {
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
      href={href}
      onPress={onPress}
    />
  );
}

function LoansPageContent() {
  const router = useRouter();
  const { displayCurrency } = useDisplayCurrency();
  // Wide (split view): a row selects it into the pane (?sel=<id>). Phone: the row link goes to /loans/[id].
  const detail = useListDetail();
  const rowPress = (id: number) => (e: MouseEvent<HTMLElement>) => {
    if (detail.split) {
      e.preventDefault();
      detail.select(id);
    }
  };
  // Cache-first when the local read cache is on (Settings > Data > Offline mode); a plain fetch otherwise.
  const { data: loansData, loading, error: loadError, reload: load } = useCacheFirstJson<Loan[]>("/api/loans");
  const loans = useMemo(() => (Array.isArray(loansData) ? loansData : []), [loansData]);
  // Create and edit are full pages (iOS navigation); delete lives in the loan form (/loans/[id]/edit).

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
  const metrics: CardProps[] = [
    {
      id: "total-debt", title: "Total debt", icon: Landmark, tone: "rose", value: debtCard.value ?? totalDebt, currency: displayCurrency,
      delta: { pct: debtCard.badgePct, text: debtCard.delta ?? NO_HISTORY_CAPTION, invert: true }, note: caveat,
      spark: { data: debtCard.sparkData, color: "#f43f5e", labels: debtCard.sparkLabels }, 
    },
    {
      id: "monthly-payments", title: "Monthly payments", icon: CalendarClock, tone: "amber", value: payCard.value ?? totalMonthly, currency: displayCurrency,
      delta: { pct: payCard.badgePct, text: payCard.delta ?? NO_HISTORY_CAPTION, invert: true }, note: caveat,
      spark: { data: payCard.sparkData, color: "#f59e0b", labels: payCard.sparkLabels }, 
    },
    {
      id: "active-loans", title: "Active loans", icon: ListChecks, tone: "indigo", value: <span>{Math.round(activeCard.value ?? activeLoans.length)}</span>,
      delta: { pct: activeCard.badgePct, text: activeCard.delta ?? NO_HISTORY_CAPTION, invert: true },
      spark: { data: activeCard.sparkData, color: "#6366f1", labels: activeCard.sparkLabels }, 
    },
  ];

  if (loading) return <LoansSkeleton />;
  if (loadError) return <Notice variant="error" title="Couldn't load loans" retry={load}>{"We couldn't load your loans. Please try again."}</Notice>;

  return (
    <SectionPage
      id="loans"
      title="Loans & Debt"
      info="Track balances, amortization schedules, and payoff strategies"
      width="report"
      header={{
        filter: { href: tb.filterHref, activeCount: tb.activeCount },
        primary: { kind: "add", label: "Add Loan", href: "/loans/new", onSelect: detail.split ? detail.selectNew : undefined },
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
                <Notice
                  variant="empty"
                  icon={Landmark}
                  title="No loans tracked yet"
                  action={{ label: "Add your first loan", onClick: () => (detail.split ? detail.selectNew() : router.push("/loans/new")) }}
                >
                  Add a mortgage, car loan or other debt.
                </Notice>
              )}
          {activeList.length > 0 && (
            <Card title="Active" icon={Landmark} tone="indigo" frame="list" className="[&>*]:min-w-0">
              {activeList.map((loan) => (
                <LoanRow key={loan.id} loan={loan} paidOff={false} displayCurrency={displayCurrency} href={`/loans/${loan.id}`} onPress={rowPress(loan.id)} selected={detail.selectedId === String(loan.id)} trend={trendOf.get(loan.id)} />
              ))}
            </Card>
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
                    <LoanRow key={loan.id} loan={loan} paidOff displayCurrency={displayCurrency} href={`/loans/${loan.id}`} onPress={rowPress(loan.id)} selected={detail.selectedId === String(loan.id)} trend={trendOf.get(loan.id)} />
                  ))}
                </div>
              </AccordionItem>
            </Accordion>
          )}

            </div>
      </ListDetailLayout>

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
