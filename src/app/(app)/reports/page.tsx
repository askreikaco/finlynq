"use client";


import { Fragment, useState, useMemo, useCallback, type ReactNode } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useDevMode } from "@/hooks/use-dev-mode";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/currency";
import { formatCompactNumber } from "@/lib/utils/number";
import { exportCsv } from "@/lib/csv-export";
import { CHART_COLORS } from "@/lib/chart-colors";
import { todayISO } from "@/lib/utils/date";
import { PageToolbar } from "@/components/page-toolbar";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { REPORT_FILTER_KEYS } from "@/lib/toolbar/list-configs";
import { MetricCard } from "@/components/metric-card";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { compareCaption, monthsBetween, seriesWindow, shiftMonth, resolvePeriod } from "@/lib/metrics/period";
import { cardProps, makeCardResolver, monthEndBalances, resolveRatioCard, sumByMonth } from "@/lib/metrics/series";
import { parseAccountIdsParam, serializeAccountIds } from "@/lib/reports/account-filter";
import { PageSkeleton } from "@/components/page-skeleton";
import { ErrorState } from "@/components/error-state";
import { SankeyChart } from "@/components/sankey-chart";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, BarChart3, Coins, DollarSign, Download, FileText, GitCompareArrows, Layers, PiggyBank, Scale, Tags, TrendingDown, TrendingUp, Wallet, Workflow } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CustomizeCardsSheet, MetricGrid, MetricItemCard, useCardLayout, usePageCustomize, type MetricItem } from "@/components/mobile";
import { SectionPage } from "@/components/templates/section-page";
import {
  GroupedStatementRows,
  FlatStatementRows,
  BalanceStatementRows,
  UnrealizedStatementRows,
  YoYStatementRows,
} from "./_components/statement-rows";
import type { PageCard } from "@/lib/card-layout";
import { IncomeExpenseTrendCard } from "@/components/reports/income-expense-trend-card";

// ── Types ──

type Period = "daily" | "weekly" | "monthly" | "quarterly";
type GroupByOption = "category" | "group";

type TimeseriesPoint = {
  period: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
};

type BreakdownItem = {
  name: string;
  group: string;
  // FINLYNQ-130 — present only in category-mode (groupBy="category"); null in
  // group-mode where one label aggregates several categories. Drives the
  // drill-through link into /transactions.
  categoryId?: number | null;
  total: number;
  count: number;
  periods: Record<string, number>;
};

type TrendsData = {
  period: Period;
  groupBy: GroupByOption;
  startDate: string;
  endDate: string;
  timeseries: TimeseriesPoint[];
  income: BreakdownItem[];
  expenses: BreakdownItem[];
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
};

type BalanceSheet = {
  date: string;
  assets: { accountGroup: string; accountName: string; currency: string; balance: number }[];
  liabilities: { accountGroup: string; accountName: string; currency: string; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
};

type YoYData = {
  year1: number;
  year2: number;
  categories: { name: string; year1Amount: number; year2Amount: number; change: number }[];
  monthly: { month: string; year1Income: number; year1Expenses: number; year2Income: number; year2Expenses: number }[];
};

type UnrealizedAccountRow = {
  accountId: number;
  accountName: string;
  accountCurrency: string;
  costBasis: number;
  marketValue: number;
  valuationGL: number;
  fxGL: number;
  totalGL: number;
  hasHoldings: boolean;
  costBasisMissing: boolean;
};

type UnrealizedData = {
  totals: {
    costBasis: number;
    marketValue: number;
    valuationGL: number;
    fxGL: number;
    totalGL: number;
  };
  accounts: UnrealizedAccountRow[];
};

// ── Helpers ──

/** Build a `YYYY-MM-DD` string from LOCAL date components (avoids UTC timezone drift). */
function localDateStr(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}



// ── Component ──

/** Customizable cards of the reports page (between the filters and the detail tabs), default order. */
const REPORT_CARDS: readonly PageCard[] = [
  { id: "summary", title: "Totals" },
  { id: "trend", title: "Trend" },
];

export default function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();

  // Shared filters. The date range is the toolbar's (default: this month; the end is capped at today); granularity,
  // group-by, business-only and account scoping live in the URL and are set on the filter page.
  // Reports default to this year (year to date) unless ?range= says otherwise.
  const metricRange = useMetricRange(undefined, "this_year");
  const tb = useListToolbar({ filterPath: "/filter/reports", filterKeys: REPORT_FILTER_KEYS });
  const startDate = metricRange.period.start;
  const endDate = metricRange.period.end > todayISO() ? todayISO() : metricRange.period.end;
  const isBusiness = tb.filters.business === "1";
  const period: Period = (["daily", "weekly", "monthly", "quarterly"] as const).find((p) => p === tb.filters.period) ?? "monthly";
  const groupBy: GroupByOption = tb.filters.groupBy === "group" ? "group" : "category";
  // Account scoping — empty = every account (see lib/reports/account-filter.ts).
  const accountIds = useMemo(() => parseAccountIdsParam(tb.filters.accountIds) ?? [], [tb.filters.accountIds]);

  // Data states
  const [yoyYear1, setYoyYear1] = useState(currentYear - 1);
  const [yoyYear2, setYoyYear2] = useState(currentYear);

  // Expand/collapse groups
  const [expandedIncomeGroups, setExpandedIncomeGroups] = useState<Set<string>>(new Set());
  const [expandedExpenseGroups, setExpandedExpenseGroups] = useState<Set<string>>(new Set());

  // One serialization for all four endpoints. Omitted entirely when empty,
  // so an unfiltered report sends no param at all rather than `accountIds=`.
  const acctParam = useMemo(() => {
    const v = serializeAccountIds(accountIds);
    return v ? `&accountIds=${encodeURIComponent(v)}` : "";
  }, [accountIds]);

  const devMode = useDevMode();

  // Active tab
  const [activeTab, setActiveTab] = useState("income");

  // Reads are cache-first when the local read cache is on (Settings > Data > Offline mode); plain fetches otherwise.
  const curr = encodeURIComponent(displayCurrency);
  const biz = isBusiness ? "&business=true" : "";

  // Trends data (the primary fetch). First-paint gate: the page is full of charts that render blank axes against
  // null data, so show a skeleton until this resolves once; a later filter change keeps the previous data on screen.
  const trendsRes = useCacheFirstJson<TrendsData>(
    currencyLoading ? null : `/api/reports/trends?startDate=${startDate}&endDate=${endDate}&period=${period}&groupBy=${groupBy}${biz}${acctParam}&currency=${curr}`,
    { keepPrevious: true },
  );
  const trendsData: TrendsData | null = trendsRes.data && typeof trendsRes.data === "object" ? trendsRes.data : null;
  const loading = trendsRes.loading;
  const loadError = trendsRes.error;

  // Balance sheet
  const balanceRes = useCacheFirstJson<BalanceSheet>(
    currencyLoading ? null : `/api/reports?type=balance-sheet&endDate=${endDate}${acctParam}&currency=${curr}`,
  );
  const balanceSheet: BalanceSheet | null = balanceRes.data && typeof balanceRes.data === "object" ? balanceRes.data : null;

  // Unrealized P&L (computed inside the income-statement endpoint). Same period as the rest of the income tab.
  const incomeStatementRes = useCacheFirstJson<{ unrealized?: UnrealizedData | null }>(
    currencyLoading ? null : `/api/reports?type=income-statement&startDate=${startDate}&endDate=${endDate}${biz}${acctParam}&currency=${curr}`,
  );
  const unrealizedData: UnrealizedData | null = incomeStatementRes.data?.unrealized ?? null;

  // YoY (dev mode only)
  const yoyRes = useCacheFirstJson<YoYData>(
    devMode && !currencyLoading ? `/api/reports/yoy?year1=${yoyYear1}&year2=${yoyYear2}${acctParam}&currency=${curr}` : null,
  );
  const yoyData: YoYData | null = yoyRes.data && typeof yoyRes.data === "object" ? yoyRes.data : null;

  // Metric cards: the ONE MetricCard design. A monthly income / expense history (a second read of the trends endpoint,
  // same filters) feeds them: the selected metric range (default this month) against the period before it.
  const metricWin = useMemo(() => seriesWindow(metricRange.period), [metricRange.period]);
  const lastDayOf = (m: string) => `${m}-${String(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;
  const monthlyRes = useCacheFirstJson<TrendsData>(
    currencyLoading ? null : `/api/reports/trends?startDate=${metricWin.from}-01&endDate=${lastDayOf(metricWin.to)}&period=monthly&groupBy=category&metrics=1${biz}${acctParam}&currency=${curr}`,
    { keepPrevious: true },
  );
  const monthly = monthlyRes.data && typeof monthlyRes.data === "object" && Array.isArray(monthlyRes.data.timeseries) ? monthlyRes.data.timeseries : null;
  // The report range itself (Net Savings block): compared with the preceding period of the same number of months when it starts on a 1st.
  const reportMonths = useMemo(() => monthsBetween(startDate, endDate), [startDate, endDate]);
  const reportAligned = startDate.endsWith("-01") && reportMonths.length > 0;
  // Balance-sheet net worth: month-end history of the account balances (not available per account selection).
  const nwHistoryRes = useCacheFirstJson<{ series?: Array<{ date: string; value: number }> }>(
    currencyLoading || accountIds.length > 0 ? null : "/api/net-worth-history?period=all",
    { keepPrevious: true },
  );

  // Sankey data
  const sankeyIncome = useMemo(() => {
    if (!trendsData) return [];
    return trendsData.income
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .map((r) => ({ name: r.name, value: r.total }));
  }, [trendsData]);

  const sankeyExpenses = useMemo(() => {
    if (!trendsData) return [];
    return trendsData.expenses
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((r) => ({ name: r.name, value: r.total }));
  }, [trendsData]);

  // Group items by category group for collapsible view
  const groupItems = useCallback((items: BreakdownItem[]) => {
    const groups = new Map<string, { items: BreakdownItem[]; total: number }>();
    for (const item of items) {
      const g = item.group || "Other";
      if (!groups.has(g)) groups.set(g, { items: [], total: 0 });
      const entry = groups.get(g)!;
      entry.items.push(item);
      entry.total += item.total;
    }
    return Array.from(groups.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, []);

  const toggleGroup = useCallback((type: "income" | "expense", group: string) => {
    const setter = type === "income" ? setExpandedIncomeGroups : setExpandedExpenseGroups;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Balance Sheet export (retains simple key-value shape, no period columns)
  function exportCSV(data: Record<string, unknown>[], filename: string) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    exportCsv(data, headers.map((h) => ({ header: h, accessor: (row: Record<string, unknown>) => row[h] })), filename);
  }

  // Income/Expenses breakdown export — full period set (uncapped, CSV has no width limit)
  function exportBreakdownCSV(items: BreakdownItem[], filename: string) {
    if (!items.length || !trendsData) return;
    const ts = trendsData.timeseries;
    exportCsv(
      items,
      [
        { header: "Group", accessor: (i) => i.group },
        { header: "Name", accessor: (i) => i.name },
        ...ts.map((pt) => ({
          header: pt.label,
          accessor: (i: BreakdownItem) => {
            const v = i.periods[pt.period];
            return v != null && v !== 0 ? v : "";
          },
        })),
        { header: "Total", accessor: (i) => i.total },
        { header: "Transactions", accessor: (i) => i.count },
      ],
      filename,
    );
  }

  const periodLabels: Record<Period, string> = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
  };

  // Hold the first paint until trends resolves so the charts never flash blank
  // axes against null data.
  const cardLayout = useCardLayout("reports", REPORT_CARDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  usePageCustomize(trendsData ? { onOpen: () => setCustomizeOpen(true) } : null);

  if (loading && !trendsData) {
    return <PageSkeleton variant="cards" rows={6} />;
  }

  if (loadError && !trendsData) {
    return (
      <ErrorState
        title="Couldn't load reports"
        message="We couldn't load your reports. Please try again."
        onRetry={trendsRes.reload}
      />
    );
  }

  // Summary cards. Value = the metric period's figure (this month by default) with badge / delta / sparkline of the same
  // basis; the report range's own total stays in the note.
  const caption = compareCaption(metricRange.selection);
  const resolveFlow = makeCardResolver(metricRange, displayCurrency);
  const incomePts = monthly ? sumByMonth(monthly, (p) => p.period, (p) => p.income, metricWin.to, metricWin.from) : [];
  const expensePts = monthly ? sumByMonth(monthly, (p) => p.period, (p) => p.expenses, metricWin.to, metricWin.from) : [];
  const netPts = incomePts.map((p, i) => ({ month: p.month, value: p.value - (expensePts[i]?.value ?? 0) }));
  const incomeCard = resolveFlow(incomePts, "sum");
  const expenseCard = resolveFlow(expensePts, "sum");
  const netCard = resolveFlow(netPts, "sum");
  const rateCard = resolveRatioCard({ num: netPts, den: incomePts, period: metricRange.period, caption });
  const reportNote = (v: string) => `${startDate} to ${endDate}: ${v}`;
  const summaryMetrics: MetricItem[] = trendsData
    ? [
        {
          id: "report-income", label: "Total Income", icon: TrendingUp, iconTone: "emerald", tone: "pos", sparkColor: "#10b981",
          value: incomeCard.value ?? trendsData.totalIncome, currency: displayCurrency, ...cardProps(incomeCard),
          ...(incomeCard.value != null ? { note: reportNote(formatCurrency(trendsData.totalIncome, displayCurrency)) } : {}),
        },
        {
          id: "report-expenses", label: "Total Expenses", icon: TrendingDown, iconTone: "rose", tone: "none", valueClassName: "text-destructive", sparkColor: "#f43f5e", invertTone: true,
          value: expenseCard.value ?? trendsData.totalExpenses, currency: displayCurrency, ...cardProps(expenseCard),
          ...(expenseCard.value != null ? { note: reportNote(formatCurrency(trendsData.totalExpenses, displayCurrency)) } : {}),
        },
        {
          id: "report-net-savings", label: "Net Savings", icon: DollarSign, iconTone: "indigo", tone: "auto", sparkColor: "#6366f1",
          value: netCard.value ?? trendsData.netSavings, currency: displayCurrency, ...cardProps(netCard),
          ...(netCard.value != null ? { note: reportNote(formatCurrency(trendsData.netSavings, displayCurrency)) } : {}),
        },
        {
          id: "report-savings-rate", label: "Savings Rate", icon: PiggyBank, iconTone: "violet", sparkColor: "#8b5cf6",
          value: <span>{rateCard.value ?? trendsData.savingsRate}%</span>,
          valueClassName: (rateCard.value ?? trendsData.savingsRate) >= 0 ? "text-pos" : "text-destructive",
          ...cardProps(rateCard),
          // No delta available -> still show the basis so the tile has a caption line like its siblings.
          ...(rateCard.delta ? {} : { sub: "Income minus expenses / income" }),
          ...(rateCard.value != null ? { note: reportNote(`${trendsData.savingsRate}%`) } : {}),
        },
      ]
    : [];

  // Balance-sheet net worth: month-end balance of the as-of month vs the month before.
  const balanceNet = (() => {
    if (!balanceSheet) return null;
    const asOf = resolvePeriod({ range: "this_month" }, balanceSheet.date || endDate);
    const pts = monthEndBalances(nwHistoryRes.data?.series ?? null, asOf.months[0]);
    return makeCardResolver({ selection: { range: "this_month" }, explicit: false, period: asOf }, displayCurrency)(pts, "last", balanceSheet.netWorth);
  })();

  // Summary metrics and trend chart, keyed by REPORT_CARDS ids; rendered in the user's saved order.
  const cardNodes: Record<string, ReactNode> = {
    summary: (
      <>
      {trendsData && (
        <>
          <div className="grid grid-cols-2 gap-4 regular:grid-cols-4">
            {summaryMetrics.map((m) => <MetricItemCard key={m.id ?? m.label} m={m} />)}
          </div>
        </>
      )}
      </>
    ),
    trend: (
      <>
      {trendsData && trendsData.timeseries.length > 0 && (
        <IncomeExpenseTrendCard
          timeseries={trendsData.timeseries}
          currency={displayCurrency}
          description={`${periodLabels[period]} trend · ${startDate} to ${endDate}`}
          daily={period === "daily"}
        />
      )}
      </>
    ),
  };

  return (
    <SectionPage
      id="reports"
      title="Reports"
      info="Analyze income, expenses, cash flow, and trends across any time period"
      width="report"
      header={{ filter: { href: tb.filterHref, activeCount: tb.activeCount } }}
    >

      <PageToolbar refresh
        range={{ selection: metricRange.selection, onChange: metricRange.setSelection }}
      />

      {cardLayout.layout.order
        .filter((id) => !cardLayout.layout.hidden.includes(id))
        .map((id) => (
          <Fragment key={id}>{cardNodes[id]}</Fragment>
        ))}

      <CustomizeCardsSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        title="Customize reports"
        description="Show, hide and reorder the summary and trend cards."
        cards={REPORT_CARDS}
        layout={cardLayout.layout}
        onSave={cardLayout.save}
        onReset={cardLayout.reset}
      />

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="income">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Income Statement
          </TabsTrigger>
          <TabsTrigger value="balance">
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Balance Sheet
          </TabsTrigger>
          {devMode && (
            <TabsTrigger value="cashflow">
              <Workflow className="h-3.5 w-3.5 mr-1.5" /> Cash Flow
            </TabsTrigger>
          )}
          {devMode && (
            <TabsTrigger value="yoy">
              <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" /> Year over Year
            </TabsTrigger>
          )}
        </TabsList>

        {/* ============ Income Statement ============ */}
        <TabsContent value="income">
          {!trendsData && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-muted/60 mb-4">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No transaction data yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Import your bank statements to see income vs. expenses, spending breakdowns, and trends.
              </p>
              <a
                href="/import"
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary"
              >
                Import transactions
              </a>
            </div>
          )}
          {trendsData && (
            <div className="space-y-6">
              {/* Expense breakdown bar chart */}
              {trendsData.timeseries.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle icon={BarChart3} tone="indigo">{periodLabels[period]} Breakdown</CardTitle>
                        <CardDescription>Stacked income and expenses per {period === "daily" ? "day" : period === "weekly" ? "week" : period === "monthly" ? "month" : "quarter"}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trendsData.timeseries} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="label"
                            className="text-xs fill-muted-foreground"
                            tick={{ fontSize: 11 }}
                            interval={period === "daily" ? Math.max(0, Math.floor(trendsData.timeseries.length / 12)) : 0}
                            angle={period === "daily" ? -45 : 0}
                            textAnchor={period === "daily" ? "end" : "middle"}
                            height={period === "daily" ? 60 : 30}
                          />
                          <YAxis
                            className="text-xs fill-muted-foreground"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => formatCompactNumber(Number(v))}
                            width={90}
                          />
                          <Tooltip
                            formatter={(v) => formatCurrency(Number(v), displayCurrency)}
                            contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                          />
                          <Legend wrapperStyle={{ fontSize: "12px" }} />
                          <Bar dataKey="income" name="Income" fill={CHART_COLORS.positive} radius={[3, 3, 0, 0]} />
                          <Bar dataKey="expenses" name="Expenses" fill={CHART_COLORS.negative} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Income table with grouping */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pos/10 text-pos">
                        <ArrowUpRight className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle icon={TrendingUp} tone="emerald">Income</CardTitle>
                        <CardDescription>
                          {trendsData.income.length} {groupBy === "group" ? "groups" : "categories"} &middot; {formatCurrency(trendsData.totalIncome, displayCurrency)}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportBreakdownCSV(trendsData.income, "income-breakdown.csv")}
                    >
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {groupBy === "category" ? (
                    <GroupedStatementRows
                      groups={groupItems(trendsData.income)}
                      expanded={expandedIncomeGroups}
                      onToggle={(g) => toggleGroup("income", g)}
                      tone="pos"
                      total={trendsData.totalIncome}
                      currency={displayCurrency}
                      startDate={startDate}
                      endDate={endDate}
                      timeseries={trendsData.timeseries}
                      totalLabel="Total"
                    />
                  ) : (
                    <FlatStatementRows
                      items={trendsData.income}
                      tone="pos"
                      currency={displayCurrency}
                      startDate={startDate}
                      endDate={endDate}
                      timeseries={trendsData.timeseries}
                      totalLabel="Total"
                    />
                  )}
                  <div className="flex justify-between items-center p-3 mt-3 rounded-xl bg-muted/50">
                    <span className="font-semibold text-sm">Total Income</span>
                    <span className="font-bold font-mono text-pos">
                      {formatCurrency(trendsData.totalIncome, displayCurrency)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Expenses table with grouping */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                        <ArrowDownRight className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle icon={TrendingDown} tone="rose">Expenses</CardTitle>
                        <CardDescription>
                          {trendsData.expenses.length} {groupBy === "group" ? "groups" : "categories"} &middot; {formatCurrency(trendsData.totalExpenses, displayCurrency)}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportBreakdownCSV(trendsData.expenses, "expense-breakdown.csv")}
                    >
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {groupBy === "category" ? (
                    <GroupedStatementRows
                      groups={groupItems(trendsData.expenses)}
                      expanded={expandedExpenseGroups}
                      onToggle={(g) => toggleGroup("expense", g)}
                      tone="neg"
                      total={trendsData.totalExpenses}
                      currency={displayCurrency}
                      startDate={startDate}
                      endDate={endDate}
                      timeseries={trendsData.timeseries}
                      totalLabel="Total"
                    />
                  ) : (
                    <FlatStatementRows
                      items={trendsData.expenses}
                      tone="neg"
                      currency={displayCurrency}
                      startDate={startDate}
                      endDate={endDate}
                      timeseries={trendsData.timeseries}
                      totalLabel="Total"
                    />
                  )}
                  <div className="flex justify-between items-center p-3 mt-3 rounded-xl bg-muted/50">
                    <span className="font-semibold text-sm">Total Expenses</span>
                    <span className="font-bold font-mono text-destructive">
                      {formatCurrency(trendsData.totalExpenses, displayCurrency)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* ── Unrealized gains / losses ── */}
              {unrealizedData && (unrealizedData.accounts.length > 0 || Math.abs(unrealizedData.totals.totalGL) > 0.005) && (
                <>
                  {/* Totals: standard MetricCards in the standard grid */}
                  <MetricGrid
                    columns={3}
                    metrics={[
                      { icon: TrendingUp, label: "Valuation G/L", value: unrealizedData.totals.valuationGL, currency: displayCurrency, tone: "auto", sub: "Asset price moves, period change" },
                      { icon: TrendingUp, label: "FX G/L", value: unrealizedData.totals.fxGL, currency: displayCurrency, tone: "auto", sub: "Currency translation, period change" },
                      { icon: Layers, label: "Total unrealized", value: unrealizedData.totals.totalGL, currency: displayCurrency, tone: "auto", sub: "Valuation + FX" },
                    ]}
                  />
                  <Card>
                    <CardHeader>
                      <CardTitle icon={TrendingUp} tone="amber">Unrealized gains / losses (period change)</CardTitle>
                      <CardDescription>
                        How asset valuations and FX translation moved during the
                        selected period. Computed as snapshot at period end −
                        snapshot at period start, so the totals match what you&apos;d
                        get reporting monthly, quarterly, or annually.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {/* Per-account drilldown */}
                      {unrealizedData.accounts.length > 0 && (
                        <UnrealizedStatementRows rows={unrealizedData.accounts} displayCurrency={displayCurrency} />
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* ============ Balance Sheet ============ */}
        <TabsContent value="balance">
          {balanceSheet && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/10 text-chart-5">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle icon={Scale} tone="indigo">Balance Sheet</CardTitle>
                      <p className="text-xs text-muted-foreground">As of {balanceSheet.date}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      exportCSV(
                        [
                          ...balanceSheet.assets.map((a) => ({ ...a, type: "Asset" })),
                          ...balanceSheet.liabilities.map((l) => ({ ...l, type: "Liability" })),
                        ],
                        "balance-sheet.csv"
                      )
                    }
                  >
                    <Download className="h-4 w-4 mr-1" /> Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUpRight className="h-4 w-4 text-pos" />
                  <h3 className="font-semibold text-pos">Assets</h3>
                </div>
                <BalanceStatementRows rows={balanceSheet.assets} totalLabel="Total Assets" total={balanceSheet.totalAssets} displayCurrency={displayCurrency} tone="pos" />
                <Separator className="my-5" />
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDownRight className="h-4 w-4 text-destructive" />
                  <h3 className="font-semibold text-destructive">Liabilities</h3>
                </div>
                <BalanceStatementRows rows={balanceSheet.liabilities} totalLabel="Total Liabilities" total={balanceSheet.totalLiabilities} displayCurrency={displayCurrency} tone="neg" />
                <Separator className="my-5" />
                <MetricCard
                  label="Net Worth"
                  icon={Wallet}
                  tone="indigo"
                  value={balanceSheet.netWorth}
                  currency={displayCurrency}
                  valueClassName={balanceSheet.netWorth >= 0 ? "text-pos" : "text-destructive"}
                  sparkColor="#6366f1"
                  {...(balanceNet ? cardProps(balanceNet) : {})}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ============ Cash Flow (Sankey) — dev only ============ */}
        {devMode && (
          <TabsContent value="cashflow">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
                    <Workflow className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle icon={ArrowLeftRight} tone="cyan">Cash Flow Diagram</CardTitle>
                    <CardDescription>
                      How income flows into expense categories ({startDate} to {endDate})
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SankeyChart incomeData={sankeyIncome} expenseData={sankeyExpenses} currency={displayCurrency} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ============ Year over Year — dev only ============ */}
        {devMode && <TabsContent value="yoy">
          <div className="space-y-6">
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="pt-4">
                <div className="flex items-end gap-4 flex-wrap">
                  <div>
                    <Label className="text-xs text-muted-foreground">Year 1</Label>
                    <Input
                      type="number"
                      value={yoyYear1}
                      onChange={(e) => setYoyYear1(parseInt(e.target.value, 10))}
                      className="mt-1 w-28"
                      min={2000}
                      max={currentYear}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Year 2</Label>
                    <Input
                      type="number"
                      value={yoyYear2}
                      onChange={(e) => setYoyYear2(parseInt(e.target.value, 10))}
                      className="mt-1 w-28"
                      min={2000}
                      max={currentYear}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {yoyData && (
              <>
                {/* Two charts side by side at wide, stacked below. */}
                <div className="grid grid-cols-1 gap-6 wide:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                        <GitCompareArrows className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle icon={BarChart3} tone="rose">Monthly Spending Comparison</CardTitle>
                        <CardDescription>
                          {yoyData.year1} vs {yoyData.year2} expenses by month
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={yoyData.monthly} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="month" className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                          <YAxis
                            className="text-xs fill-muted-foreground"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) => formatCurrency(Number(v), displayCurrency)}
                          />
                          <Tooltip
                            formatter={(v) => formatCurrency(Number(v), displayCurrency)}
                            contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                          />
                          <Legend wrapperStyle={{ fontSize: "12px" }} />
                          <Bar
                            dataKey="year1Expenses"
                            name={`${yoyData.year1} Expenses`}
                            fill={CHART_COLORS.categories[0]}
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            dataKey="year2Expenses"
                            name={`${yoyData.year2} Expenses`}
                            fill={CHART_COLORS.categories[1]}
                            radius={[3, 3, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle icon={BarChart3} tone="emerald">Monthly Income Comparison</CardTitle>
                    <CardDescription>
                      {yoyData.year1} vs {yoyData.year2} income by month
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={yoyData.monthly} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="month" className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                          <YAxis
                            className="text-xs fill-muted-foreground"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) => formatCurrency(Number(v), displayCurrency)}
                          />
                          <Tooltip
                            formatter={(v) => formatCurrency(Number(v), displayCurrency)}
                            contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                          />
                          <Legend wrapperStyle={{ fontSize: "12px" }} />
                          <Bar
                            dataKey="year1Income"
                            name={`${yoyData.year1} Income`}
                            fill={CHART_COLORS.positive}
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            dataKey="year2Income"
                            name={`${yoyData.year2} Income`}
                            fill={CHART_COLORS.categories[3]}
                            radius={[3, 3, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle icon={Tags} tone="violet">Category Comparison</CardTitle>
                    <CardDescription>Expense categories year-over-year change</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <YoYStatementRows rows={yoyData.categories} year1={yoyData.year1} year2={yoyData.year2} currency={displayCurrency} />
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>}
      </Tabs>
    </SectionPage>
  );
}
