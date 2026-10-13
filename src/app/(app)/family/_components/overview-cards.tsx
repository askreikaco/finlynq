"use client";

/**
 * Dashboard / reports / portfolio cards as rendered on the Family overview. Cards sit in SectionCard,
 * income and expenses in MetricGrid, and the rest reuse the source page's own component (NetWorthHeroCard,
 * KeyMetrics, NetWorthAreaChart, IncomeExpenseTrendCard, PerformanceBadges/PerformanceLineChart), fed from
 * the allow-listed overview DTO, so the figures and the look match those pages.
 */
import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { ResponsiveContainer } from "recharts";
import { formatCurrency, formatDate } from "@/lib/currency";
import { prepareTimeSeries } from "@/lib/chart-series";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { MetricGrid, SectionCard, metricGridClass } from "@/components/mobile";
import { NetWorthHeroCard } from "@/app/(app)/dashboard/_components/net-worth-hero-card";
import { KeyMetrics, type SavingsTrend } from "@/app/(app)/dashboard/_components/key-metrics";
import { NetWorthAreaChart } from "@/components/net-worth-history-chart";
import { IncomeExpenseTrendCard } from "@/components/reports/income-expense-trend-card";
import { PerformanceBadges, PerformanceLineChart } from "@/components/portfolio/PerformanceChart";
import type { OverviewResponse, PerformanceDto } from "./types";
import { seriesChange, type Point } from "./household";
import { resolvePeriod, type Period as MetricPeriod } from "@/lib/metrics/period";
import { resolveCard } from "@/lib/metrics/delta";
import { cardProps, monthEndBalances, resolveRatioCard, sumByMonth } from "@/lib/metrics/series";
import { localDateISO } from "@/lib/utils/date";
import { fill } from "./section-labels";

export type Period = OverviewResponse["period"];

/** Caption of a flow figure for the selected range. */
export const RANGE_CAPTION: Record<Period, string> = {
  month: FAMILY_STRINGS.overview_period_month,
  year: FAMILY_STRINGS.overview_period_year,
  all: FAMILY_STRINGS.overview_period_all,
  "6m": FAMILY_STRINGS.overview_period_6m,
  "1y": FAMILY_STRINGS.overview_period_1y,
};

type Flow = { income: number; expenses: number };
export interface FlowSeries {
  from: string | null;
  monthly: Array<{ month: string } & Flow>;
  daily: Array<{ date: string } & Flow>;
}

/** "This month" charts per day, every other range per month (the reports daily/monthly views). */
function flowPoints(series: FlowSeries, period: Period): { daily: boolean; points: Array<{ key: string } & Flow> } {
  if (period === "month") return { daily: true, points: series.daily.map((d) => ({ key: d.date, income: d.income, expenses: d.expenses })) };
  return { daily: false, points: series.monthly.map((m) => ({ key: m.month, income: m.income, expenses: m.expenses })) };
}

/** Same label formats as /api/reports/trends (daily: "Oct 1"; monthly: "Oct 2026"). */
function flowLabel(key: string, daily: boolean): string {
  if (daily) return new Date(`${key}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  const [y, m] = key.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-CA", { year: "numeric", month: "short" });
}

/** A card slot whose data is not available (section not shared / failed): never a 0. */
export function UnavailableCard({ title, text }: { title: string; text: string }) {
  return (
    <SectionCard label={title} data-testid="card-unavailable">
      <p className="text-3xl font-bold leading-none text-muted-foreground" aria-hidden="true">
        {FAMILY_STRINGS.overview_none}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{text}</p>
    </SectionCard>
  );
}

export interface HeadlineData {
  currency: string;
  period: Period;
  netWorth: { net: number; assets: number; liabilities: number; history: Point[] } | { unavailable: string };
  flows: (Flow & FlowSeries) | { unavailable: string };
  savingsRatePct: number | null;
  savingsUnavailable?: string;
  dti: { pct: number | null; reliable: boolean } | null;
  dtiUnavailable?: string;
  /**
   * The scope's full history (the lifetime fetch the charts below use): net-worth points and monthly income / expenses.
   * It gives the previous period of the selected range, the badge, the signed difference and the monthly sparklines;
   * without it the cards show their figures only.
   */
  lifetime?: { history: Point[] | null; monthly: Array<{ month: string; income: number; expenses: number }> | null };
}

/** The metric period of the overview range: this month, or year to date. All time (and the legacy windows) have no previous period. */
function metricPeriodOf(period: Period): MetricPeriod | null {
  const today = localDateISO();
  if (period === "month") return resolvePeriod({ range: "this_month" }, today);
  if (period === "year") return resolvePeriod({ range: "ytd" }, today);
  return null;
}

/** Total Net Worth + Income + Expenses (dashboard row 1-2) and Savings Rate + Debt-to-Income (row 2.25). */
export function HeadlineCards(d: HeadlineData) {
  const { currency, period } = d;
  const caption = RANGE_CAPTION[d.period];
  const metricPeriod = metricPeriodOf(period);
  const compareCap = period === "month" ? "vs last month" : "vs previous period";
  const thisMonth = localDateISO().slice(0, 7);
  const nwSpark = useMemo(() => {
    if ("unavailable" in d.netWorth) return { data: [] as number[] };
    const pts = d.netWorth.history;
    const step = Math.max(1, Math.ceil(pts.length / 30));
    const sampled = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    return { data: sampled.map((p) => p.value) };
  }, [d.netWorth]);

  let hero: React.ReactNode;
  if ("unavailable" in d.netWorth) {
    hero = <UnavailableCard title={FAMILY_STRINGS.overview_card_total_net_worth} text={d.netWorth.unavailable} />;
  } else {
    const { change, pct } = seriesChange(d.netWorth.history);
    const nwCard = metricPeriod && d.lifetime?.history
      ? resolveCard({
          points: monthEndBalances(d.lifetime.history, thisMonth), period: metricPeriod, mode: "last", isDefault: true,
          pageValue: d.netWorth.net, kind: "money", currency, caption: compareCap,
        })
      : null;
    hero = (
      <NetWorthHeroCard
        value={d.netWorth.net}
        currency={currency}
        change={change}
        changePct={pct}
        changeCaption={caption.toLowerCase()}
        comparison={nwCard ? { delta: nwCard.delta, pct: nwCard.badgePct } : undefined}
        sparkData={nwCard?.sparkData ?? nwSpark.data}
        sparkLabels={nwCard?.sparkLabels}
        footnote={fill(FAMILY_STRINGS.overview_card_assets_liabilities, {
          assets: formatCurrency(d.netWorth.assets, currency),
          liabilities: formatCurrency(d.netWorth.liabilities, currency),
        })}
      />
    );
  }

  const incomeLabel = period === "month" ? FAMILY_STRINGS.overview_card_monthly_income : FAMILY_STRINGS.overview_card_income;
  const expensesLabel = period === "month" ? FAMILY_STRINGS.overview_card_monthly_expenses : FAMILY_STRINGS.overview_card_expenses;
  let figures: React.ReactNode;
  if ("unavailable" in d.flows) {
    figures = (
      <div className={metricGridClass(2)}>
        <UnavailableCard title={incomeLabel} text={d.flows.unavailable} />
        <UnavailableCard title={expensesLabel} text={d.flows.unavailable} />
      </div>
    );
  } else {
    const share = d.flows.income > 0 ? Math.round((d.flows.expenses / d.flows.income) * 100) : null;
    const monthly = d.lifetime?.monthly ?? null;
    const flowCard = (pick: "income" | "expenses", pageValue: number) =>
      metricPeriod && monthly && monthly.length > 0
        ? resolveCard({
            points: sumByMonth(monthly, (m) => m.month, (m) => m[pick], thisMonth), period: metricPeriod, mode: "sum", isDefault: true,
            pageValue, kind: "money", currency, caption: compareCap,
          })
        : null;
    const incomeCard = flowCard("income", d.flows.income);
    const expensesCard = flowCard("expenses", d.flows.expenses);
    figures = (
      <MetricGrid
        columns={2}
        metrics={[
          {
            icon: TrendingUp, label: incomeLabel, value: d.flows.income, currency,
            ...(incomeCard ? cardProps(incomeCard) : {}),
            ...(incomeCard?.delta ? { note: caption } : { sub: caption }),
          },
          {
            icon: TrendingDown,
            label: expensesLabel,
            value: d.flows.expenses,
            currency,
            invertTone: true,
            ...(expensesCard ? cardProps(expensesCard) : {}),
            ...(expensesCard?.delta
              ? { note: share == null ? caption : `${caption} · ${fill(FAMILY_STRINGS.overview_card_pct_of_income, { pct: share })}` }
              : { sub: share == null ? caption : `${caption} · ${fill(FAMILY_STRINGS.overview_card_pct_of_income, { pct: share })}` }),
          },
        ]}
      />
    );
  }

  // Savings rate of the selected range (value, badge, delta and sparkline on the same basis) against the previous one.
  const lifetimeMonthly = d.lifetime?.monthly ?? null;
  let savingsTrend: SavingsTrend | undefined;
  if (metricPeriod && lifetimeMonthly && lifetimeMonthly.length > 0) {
    const inc = sumByMonth(lifetimeMonthly, (m) => m.month, (m) => m.income, thisMonth);
    const exp = sumByMonth(lifetimeMonthly, (m) => m.month, (m) => m.expenses, thisMonth);
    const net = inc.map((p, i) => ({ month: p.month, value: p.value - (exp[i]?.value ?? 0) }));
    const rate = resolveRatioCard({ num: net, den: inc, period: metricPeriod, caption: compareCap });
    savingsTrend = {
      badgePct: rate.badgePct, delta: rate.delta, sparkData: rate.sparkData, sparkLabels: rate.sparkLabels,
      ...(rate.value != null ? { value: rate.value } : {}),
    };
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {hero}
        {figures}
      </div>
      <KeyMetrics
        health={{ savingsRatePct: d.savingsRatePct, dti: d.dti ?? { pct: null, reliable: true } }}
        savingsTrend={savingsTrend}
        savingsWindow={savingsTrend ? caption.toLowerCase() : "last 12 months"}
        unavailable={{ savings: d.savingsUnavailable, dti: d.dtiUnavailable }}
      />
    </div>
  );
}

/** The dashboard's "Net Worth Over Time" card for an already-loaded history (no fetch, no stacking). */
export function NetWorthOverTimeCard({
  history,
  currency,
  period,
  name,
  gradientId,
  note,
}: {
  history: Point[];
  currency: string;
  period: Period;
  name: string;
  gradientId: string;
  note?: string;
}) {
  const prepared = useMemo(
    () => prepareTimeSeries(history, { dateKey: "date", valueKeys: ["value"], maxPoints: 200 }),
    [history],
  );
  const title = FAMILY_STRINGS.overview_card_net_worth_over_time;
  const first = history[0];
  const last = history[history.length - 1];
  return (
    <SectionCard label={title}>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {currency}{period === "all" ? " · All time" : ""}
        </p>
        {history.length < 2 ? (
          <p className="text-sm text-muted-foreground py-16 text-center">{FAMILY_STRINGS.overview_card_no_history}</p>
        ) : (
          <div
            role="img"
            aria-label={fill(FAMILY_STRINGS.overview_chart_summary, {
              title,
              name,
              from: "from",
              start: `${formatDate(first.date)} ${formatCurrency(first.value, currency)}`,
              to: "to",
              end: `${formatDate(last.date)} ${formatCurrency(last.value, currency)}`,
            })}
          >
            <NetWorthAreaChart
              series={prepared.data}
              domain={prepared.domain}
              spansZero={prepared.spansZero}
              currency={currency}
              period={period === "all" ? "all" : "1y"}
              gradientId={gradientId}
            />
          </div>
        )}
        {note && <p className="text-xs text-muted-foreground mt-2">{note}</p>}
      </div>
    </SectionCard>
  );
}

/** The reports "Income vs Expenses" card over the selected range. */
export function IncomeVsExpensesCard({
  series,
  period,
  currency,
  asOf,
  idPrefix,
}: {
  series: FlowSeries;
  period: Period;
  currency: string;
  asOf: string;
  idPrefix: string;
}) {
  const { points, daily } = flowPoints(series, period);
  if (points.length === 0) {
    return (
      <SectionCard label={FAMILY_STRINGS.overview_card_income_vs_expenses}>
        <p className="text-sm text-muted-foreground py-12 text-center">{FAMILY_STRINGS.overview_card_no_cashflow}</p>
      </SectionCard>
    );
  }
  const from = series.from ?? (daily ? points[0].key : `${points[0].key}-01`);
  const timeCaption = period === "all" ? " · All time" : "";
  return (
    <IncomeExpenseTrendCard
      timeseries={points.map((p) => ({ label: flowLabel(p.key, daily), income: p.income, expenses: p.expenses }))}
      currency={currency}
      daily={daily}
      idPrefix={idPrefix}
      description={
        fill(FAMILY_STRINGS.overview_card_ie_description, {
          granularity: daily ? "Daily" : "Monthly",
          from: formatDate(from),
          to: formatDate(asOf),
        }) + timeCaption
      }
    />
  );
}

/** The /portfolio "Performance" card (value + cost basis lines, TWRR / MWRR badges) for the range. */
export function PerformanceCard({ performance, currency }: { performance: PerformanceDto; currency: string }) {
  const prepared = useMemo(
    () =>
      prepareTimeSeries(performance.series, {
        dateKey: "date",
        valueKeys: ["marketValue", "costBasis"],
        maxPoints: 200,
      }),
    [performance.series],
  );
  return (
    <SectionCard label={FAMILY_STRINGS.overview_card_performance}>
      <div className="space-y-2">
        {prepared.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{FAMILY_STRINGS.overview_card_no_snapshots}</p>
        ) : (
          <>
            <PerformanceBadges twrr={performance.twrr} mwrr={performance.mwrr} gapsFilledDays={performance.gapsFilledDays} />
            <p className="text-xs text-muted-foreground mb-1">{`Market value (${currency})`}</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PerformanceLineChart
                  chartData={prepared.data}
                  domain={prepared.domain}
                  spansZero={prepared.spansZero}
                  currency={currency}
                />
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}
