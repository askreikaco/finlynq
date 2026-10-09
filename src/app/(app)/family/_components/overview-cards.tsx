"use client";

/**
 * Dashboard / reports / portfolio cards as rendered on the Family overview. Each card reuses the
 * source page's own component (StatCard, NetWorthHeroCard, KeyMetrics, NetWorthAreaChart,
 * IncomeExpenseTrendCard, PerformanceBadges/PerformanceLineChart, TopMoversCard) and is fed from
 * the allow-listed overview DTO, so the figures and the look match those pages.
 */
import { useMemo } from "react";
import { ResponsiveContainer } from "recharts";
import { CreditCard, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/currency";
import { prepareTimeSeries } from "@/lib/chart-series";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { StatCard } from "@/app/(app)/dashboard/_components/stat-card";
import { NetWorthHeroCard } from "@/app/(app)/dashboard/_components/net-worth-hero-card";
import { KeyMetrics } from "@/app/(app)/dashboard/_components/key-metrics";
import { NetWorthAreaChart } from "@/components/net-worth-history-chart";
import { IncomeExpenseTrendCard } from "@/components/reports/income-expense-trend-card";
import { PerformanceBadges, PerformanceLineChart } from "@/components/portfolio/PerformanceChart";
import type { OverviewResponse, PerformanceDto } from "./types";
import { seriesChange, type Point } from "./household";
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
    <Card className="h-full" data-testid="card-unavailable">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold leading-none text-muted-foreground" aria-hidden="true">
          {FAMILY_STRINGS.overview_none}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{text}</p>
      </CardContent>
    </Card>
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
}

/** Total Net Worth + Income + Expenses (dashboard row 1-2) and Savings Rate + Debt-to-Income (row 2.25). */
export function HeadlineCards(d: HeadlineData) {
  const { currency, period } = d;
  const caption = RANGE_CAPTION[d.period];
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
    hero = (
      <NetWorthHeroCard
        value={d.netWorth.net}
        currency={currency}
        change={change}
        changePct={pct}
        changeCaption={caption.toLowerCase()}
        sparkData={nwSpark.data}
        footnote={fill(FAMILY_STRINGS.overview_card_assets_liabilities, {
          assets: formatCurrency(d.netWorth.assets, currency),
          liabilities: formatCurrency(d.netWorth.liabilities, currency),
        })}
      />
    );
  }

  const incomeLabel = period === "month" ? FAMILY_STRINGS.overview_card_monthly_income : FAMILY_STRINGS.overview_card_income;
  const expensesLabel = period === "month" ? FAMILY_STRINGS.overview_card_monthly_expenses : FAMILY_STRINGS.overview_card_expenses;
  let income: React.ReactNode;
  let expenses: React.ReactNode;
  if ("unavailable" in d.flows) {
    income = <UnavailableCard title={incomeLabel} text={d.flows.unavailable} />;
    expenses = <UnavailableCard title={expensesLabel} text={d.flows.unavailable} />;
  } else {
    const { points, daily } = flowPoints(d.flows, period);
    const last = points.slice(-12);
    const labels = daily ? undefined : last.map((p) => p.key);
    const share = d.flows.income > 0 ? Math.round((d.flows.expenses / d.flows.income) * 100) : null;
    income = (
      <StatCard
        label={incomeLabel}
        value={d.flows.income}
        sub={caption}
        icon={TrendingUp}
        iconBg="bg-pos/10 text-pos"
        sparkColor="#10b981"
        sparkData={last.map((p) => p.income)}
        sparkLabels={labels}
        currency={currency}
      />
    );
    expenses = (
      <StatCard
        label={expensesLabel}
        value={d.flows.expenses}
        sub={share == null ? caption : `${caption} · ${fill(FAMILY_STRINGS.overview_card_pct_of_income, { pct: share })}`}
        icon={CreditCard}
        iconBg="bg-destructive/10 text-destructive"
        sparkColor="#f43f5e"
        sparkData={last.map((p) => p.expenses)}
        sparkLabels={labels}
        currency={currency}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="md:col-span-2">{hero}</div>
        {income}
        {expenses}
      </div>
      <KeyMetrics
        health={{ savingsRatePct: d.savingsRatePct, dti: d.dti ?? { pct: null, reliable: true } }}
        savingsWindow="last 12 months"
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
    <Card className="card-hover">
      <CardHeader className="pb-1 px-5 pt-5">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {currency}{period === "all" ? " · All time" : ""}
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
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
      </CardContent>
    </Card>
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{FAMILY_STRINGS.overview_card_income_vs_expenses}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-12 text-center">{FAMILY_STRINGS.overview_card_no_cashflow}</p>
        </CardContent>
      </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>{FAMILY_STRINGS.overview_card_performance}</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
