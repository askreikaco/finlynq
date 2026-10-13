"use client";


import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { DollarSign, TrendingUp, CreditCard, Target, Settings, Plus, Upload, FileUp } from "lucide-react";
import { motion } from "framer-motion";
import { MetricCard } from "@/components/metric-card";
import { deriveSeriesChange } from "@/lib/dashboard/series-change";
import { NetWorthHeroCard } from "./_components/net-worth-hero-card";
import { HealthScoreCard } from "./_components/health-score-card";
import { KeyMetrics } from "./_components/key-metrics";
import { ActionCenter } from "./_components/action-center";
import { WeeklyRecap } from "./_components/weekly-recap";
import { OnboardingTips } from "@/components/onboarding-tips";
import { DueCard } from "@/components/subscriptions/due-card";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { ErrorState } from "@/components/error-state";
import { QuickImport } from "./_components/quick-import";
import { IncomeExpenseChart } from "./_components/income-expense-chart";
import { SpendingCategoryChart } from "./_components/spending-category-chart";
import { NetWorthHistoryChart } from "@/components/net-worth-history-chart";
import { AvailableToSpend } from "./_components/available-to-spend";
import { InsightsSection } from "./_components/insights-section";
import { LazyView } from "@/components/ui/lazy-view";
import { useDevMode } from "@/hooks/use-dev-mode";
import { useDisplayCurrency } from "@/components/currency-provider";
import { CurrencyAuditBanner } from "@/components/currency-audit-banner";
import type { DashboardData, HealthData } from "./_components/types";
import { PageHeader, CustomizeDashboardSheet, useCardLayout, usePageCustomize, metricGridClass, METRIC_GRID_CLASS } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { DASHBOARD_CARDS } from "@/lib/dashboard-layout";
import { sumAssetsLiabilities } from "@/lib/account-visibility";
import { MetricRangeSelect } from "@/components/metric-range-select";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { aggregate, compareCaption, pctChange, previousPeriod, resolvePeriod, RANGE_LABELS, type MonthPoint } from "@/lib/metrics/period";
import { formatDelta, resolveCard } from "@/lib/metrics/delta";
import { localDateISO } from "@/lib/utils/date";

// --- Quick Import Widget ---
function QuickImportWidget() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    router.push("/import");
  }

  function handleFileChange() {
    router.push("/import");
  }

  return (
    <Card
      className={`relative overflow-hidden border-dashed transition-colors cursor-pointer ${
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".csv,.ofx,.qfx" className="hidden" onChange={handleFileChange} />
      <CardContent className="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
          dragOver ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}>
          {dragOver ? <FileUp className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
        </div>
        <div>
          <p className="text-sm font-medium">{dragOver ? "Drop to import" : "Quick Import"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Drop CSV, OFX, or QFX files here</p>
        </div>
        <Link
          href="/import"
          className="text-xs text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Or browse files →
        </Link>
      </CardContent>
    </Card>
  );
}

// --- Animation variants ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

// --- Skeleton loader ---
function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-7 w-52 animate-shimmer rounded-lg" />
      <div className="h-4 w-36 animate-shimmer rounded-md" />
      <div className="grid grid-cols-1 wide:grid-cols-3 gap-4 mt-4">
        <div className="wide:col-span-2 h-44 animate-shimmer rounded-2xl" />
        <div className="h-44 animate-shimmer rounded-2xl" />
      </div>
      <div className={METRIC_GRID_CLASS}>
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 animate-shimmer rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 wide:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => <div key={i} className="h-52 animate-shimmer rounded-2xl" />)}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const devMode = useDevMode();
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
  // Cache-first when the local read cache is on (Settings > Data > Offline mode); a plain fetch otherwise.
  const encodedCurrency = encodeURIComponent(displayCurrency);
  const dashboardRes = useCacheFirstJson<DashboardData>(currencyLoading ? null : `/api/dashboard?currency=${encodedCurrency}`, { keepPrevious: true });
  // Financial-health payload feeds both the Health Score card and the KeyMetrics strip (savings rate + DTI) — fetched
  // once here and passed down so the two consumers don't each hit the (query-heavy) endpoint.
  const healthRes = useCacheFirstJson<HealthData>(currencyLoading ? null : `/api/health-score?currency=${encodedCurrency}`, { keepPrevious: true });
  const data: DashboardData | null = dashboardRes.data ?? null;
  const health: HealthData | null = healthRes.data ?? null;
  const loadError = dashboardRes.error;
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userInfo, setUserInfo] = useState<{ email: string; displayName?: string } | null>(null);
  // Same generic hook as every page; the dashboard keeps its legacy storage endpoint (format unchanged).
  const { layout, ready: layoutReady, save: saveLayout, reset: resetLayout } = useCardLayout("dashboard", DASHBOARD_CARDS, {
    endpoint: "/api/settings/dashboard-layout",
  });
  const [customizeOpen, setCustomizeOpen] = useState(false);
  usePageCustomize({ onOpen: () => setCustomizeOpen(true) });
  const [reloadKey, setReloadKey] = useState(0);
  const { selection, explicit, period: rangePeriod, setSelection } = useMetricRange();

  useEffect(() => {
    if (currencyLoading) return; // wait until provider has read settings
    // Check if onboarding is needed (managed mode only). Username-only users
    // (no email on file) also see the wizard — fall back to username for the
    // "Signed in as …" line.
    fetch("/api/auth/session")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d && d.authenticated && d.onboardingComplete === false) {
          const identity = d.email ?? d.username ?? "";
          if (identity) {
            setUserInfo({ email: identity, displayName: d.displayName ?? undefined });
            setShowOnboarding(true);
          }
        }
      })
      .catch(() => {});
  }, [displayCurrency, currencyLoading, reloadKey]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }, []);

  if (loadError && !data) return <ErrorState onRetry={() => { dashboardRes.reload(); healthRes.reload(); setReloadKey((k) => k + 1); }} />;

  if (!data || !layoutReady) return <DashboardSkeleton />;

  // --- Compute derived data ---
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Sum the API's already-converted balances in the user's display currency.
  // The API converts every account's native balance via the rate map and
  // returns convertedBalance + displayCurrency on each row.
  const balances = data.balances ?? [];
  const apiDisplayCurrency = data.displayCurrency ?? displayCurrency;
  // Invisible accounts ride along in the payload (the Accounts list needs
  // them) but never count toward the hero totals.
  const { totalAssets, netWorth: totalNetWorth } = sumAssetsLiabilities(
    balances,
    (b) => b.convertedBalance ?? b.balance,
  );

  // Income vs Expenses monthly data — totals are summed across currencies
  // server-side (raw native amounts) and converted at the dashboard level
  // through the same rate path on the next pass. For now we use the
  // unconverted figures on income/expenses since the queries don't yet
  // tag them per-currency; this is fine while users have a single dominant
  // tx currency. Phase 2 will tag rows with their account currency and
  // convert at aggregation.
  const monthMap = new Map<string, { month: string; income: number; expenses: number }>();
  (data.incomeVsExpenses ?? []).forEach((row) => {
    const entry = monthMap.get(row.month) ?? { month: row.month, income: 0, expenses: 0 };
    if (row.type === "I") entry.income = row.total;
    if (row.type === "E") entry.expenses = Math.abs(row.total);
    monthMap.set(row.month, entry);
  });
  // FINLYNQ-128 — attach the per-category tooltip breakdown (keyed by the same
  // "YYYY-MM" month) so the Income vs Expenses tooltip can show contributors.
  const ieBreakdown = data.incomeExpenseBreakdown ?? {};
  const incExpData = Array.from(monthMap.values())
    .map((m) => ({
      ...m,
      incomeBreakdown: ieBreakdown[m.month]?.income,
      expenseBreakdown: ieBreakdown[m.month]?.expenses,
    }))
    .slice(-12);
  const incExpLast6 = incExpData.slice(-6);
  // "YYYY-MM" labels parallel to the income/expense/budget sparklines — drive the
  // hover tooltip's date line (formatted via getMonthLabel inside Sparkline).
  const incExpSparkLabels = incExpLast6.map((d) => d.month);
  const incomeSparkline = incExpLast6.map((d) => d.income);
  const expenseSparkline = incExpLast6.map((d) => d.expenses);

  // Net worth over time — API returns rows already converted to display
  // currency (route.ts collapses currencies via getRateMap + convertWithRateMap
  // before returning).
  // Shared with /accounts (src/lib/dashboard/series-change.ts).
  const nwSeries = deriveSeriesChange(data.netWorthOverTime);
  // Net Worth sparkline shows the last twelve months (hero + stat tile share it).
  const nwSparkline = nwSeries.sparkData;
  const nwSparkLabels = nwSeries.sparkLabels;

  // Month-over-month change (0 when there is no history, as before)
  const momChange = nwSeries.change ?? 0;
  const momPct = nwSeries.changePct;

  // FINLYNQ-291 (C1) — the Monthly Income / Expenses / Budgets tiles summarize a
  // single reference month. The newest tracked month is usually the CURRENT
  // calendar month, which is incomplete mid-month: before payroll lands its
  // income reads $0, so the Monthly Income tile looked broken. Prefer the last
  // COMPLETE month — if the newest entry is the current calendar month and an
  // earlier month exists, step back one. A brand-new user with only the current
  // month still sees it. Income + expenses + drill-through all key off this one
  // index so the trio stays internally consistent.
  const currentMonthKey = getCurrentMonth();
  let refIdx = incExpData.length - 1;
  if (refIdx > 0 && incExpData[refIdx].month === currentMonthKey) {
    refIdx -= 1;
  }
  const refMonth = incExpData.length > 0 ? incExpData[refIdx] : null;
  const lastMonthIncome = refMonth ? refMonth.income : 0;
  const lastMonthExpenses = refMonth ? refMonth.expenses : 0;
  const availableToSpend = lastMonthIncome - lastMonthExpenses;

  // FINLYNQ-130 — drill-through: the Monthly Income / Expenses tiles show the
  // reference month above (incExpData is "YYYY-MM" sorted asc). Derive that
  // month's [startDate, endDate] so the tile links into /transactions scoped to
  // exactly the rows that produced the figure. Empty range ⇒ plain /transactions.
  const lastMonthKey = refMonth ? refMonth.month : "";
  const monthDrill = (() => {
    const m = /^(\d{4})-(\d{2})$/.exec(lastMonthKey);
    if (!m) return { startDate: "", endDate: "" };
    const year = Number(m[1]);
    const month = Number(m[2]); // 1-12
    const startDate = `${m[1]}-${m[2]}-01`;
    // Day 0 of the next month = last day of this month.
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDate = `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`;
    return { startDate, endDate };
  })();
  const budgetSparkline = incExpLast6.map((d) => d.income - d.expenses);

  // Metric cards: default = the reference month vs the month before it (unchanged); a selected range (?range=...)
  // compares that range with the immediately preceding period of the same length. Everything is derived from the same
  // monthly income / expense series, so it also works from the offline cache.
  const caption = compareCaption(selection);
  const cardPeriod = explicit ? rangePeriod : resolvePeriod({ range: "this_month" }, localDateISO(), lastMonthKey || undefined);
  const prevCardPeriod = previousPeriod(cardPeriod);
  const incomePoints: MonthPoint[] = incExpData.map((d) => ({ month: d.month, value: d.income }));
  const expensePoints: MonthPoint[] = incExpData.map((d) => ({ month: d.month, value: d.expenses }));
  const netPoints: MonthPoint[] = incExpData.map((d) => ({ month: d.month, value: d.income - d.expenses }));
  const cardBase = { period: cardPeriod, mode: "sum", isDefault: !explicit, currency: apiDisplayCurrency, caption, kind: "money" } as const;
  const incomeCard = resolveCard({ ...cardBase, points: incomePoints, pageValue: lastMonthIncome });
  const expenseCard = resolveCard({ ...cardBase, points: expensePoints, pageValue: lastMonthExpenses });
  const budgetCard = resolveCard({ ...cardBase, points: netPoints, pageValue: availableToSpend });
  const periodLabel = explicit
    ? (selection.range === "custom" ? `${selection.from} to ${selection.to}` : RANGE_LABELS[selection.range])
    : lastMonthKey ? getMonthLabel(lastMonthKey) : `${incExpData.length} months tracked`;
  const shownIncome = incomeCard.value ?? lastMonthIncome;
  const shownExpenses = expenseCard.value ?? lastMonthExpenses;

  // Savings rate by month = (income - expenses) / income; a range's rate uses the range's summed income / expenses.
  const rateOf = (months: string[]): number | null => {
    const inc = aggregate(incomePoints, months, "sum");
    const exp = aggregate(expensePoints, months, "sum");
    return inc != null && exp != null && inc > 0 ? ((inc - exp) / inc) * 100 : null;
  };
  const curRate = rateOf(cardPeriod.months);
  const prevRate = rateOf(prevCardPeriod.months);
  const rateSpark = incExpData
    .filter((d) => d.month <= cardPeriod.months[cardPeriod.months.length - 1] && d.income > 0)
    .slice(-6)
    .map((d) => ({ month: d.month, rate: Math.round(((d.income - d.expenses) / d.income) * 1000) / 10 }));
  const savingsTrend = {
    badgePct: pctChange(curRate, prevRate),
    delta: formatDelta({ cur: curRate, prev: prevRate, kind: "pp", caption }),
    ...(rateSpark.length >= 2 ? { sparkData: rateSpark.map((r) => r.rate), sparkLabels: rateSpark.map((r) => r.month) } : {}),
    ...(explicit ? { value: curRate != null ? Math.round(curRate * 10) / 10 : null } : {}),
  };

  // Dev-mode: spending by category for charts
  const spendingData = (data.spendingByCategory ?? [])
    .map((c) => ({ name: c.categoryName ?? "Uncategorized", value: Math.abs(c.total) }))
    .slice(0, 8);

  // Stat cards config
  const summaryCards = [
    {
      label: "Monthly Income",
      // Name the month the figure covers — it's the last COMPLETE month, not
      // necessarily the current one (FINLYNQ-291 C1), so the label must be explicit.
      value: shownIncome,
      // Signed difference vs the previous period (like Net Worth); the covered month moves to the note.
      sub: incomeCard.delta ?? undefined,
      note: periodLabel,
      badgePct: incomeCard.badgePct,
      icon: TrendingUp,
      tone: "bg-pos/10 text-pos",
      sparkColor: "#10b981",
      sparkData: explicit ? (incomeCard.sparkData ?? incomeSparkline) : incomeSparkline,
      sparkLabels: explicit ? (incomeCard.sparkLabels ?? incExpSparkLabels) : incExpSparkLabels,
      href: buildTxDrillUrl({ startDate: monthDrill.startDate, endDate: monthDrill.endDate }),
    },
    {
      label: "Monthly Expenses",
      value: shownExpenses,
      sub: expenseCard.delta ?? undefined,
      note: [periodLabel, shownIncome > 0 ? `${Math.round((shownExpenses / shownIncome) * 100)}% of income` : ""].filter(Boolean).join(" · "),
      badgePct: expenseCard.badgePct,
      invertTone: true,
      icon: CreditCard,
      tone: "bg-destructive/10 text-destructive",
      sparkColor: "#f43f5e",
      sparkData: explicit ? (expenseCard.sparkData ?? expenseSparkline) : expenseSparkline,
      sparkLabels: explicit ? (expenseCard.sparkLabels ?? incExpSparkLabels) : incExpSparkLabels,
      href: buildTxDrillUrl({ startDate: monthDrill.startDate, endDate: monthDrill.endDate }),
    },
    {
      label: "Budgets",
      value: budgetCard.value ?? availableToSpend,
      sub: budgetCard.delta ?? undefined,
      note: (budgetCard.value ?? availableToSpend) >= 0 ? "Available to spend" : "Over budget",
      badgePct: budgetCard.badgePct,
      icon: Target,
      tone: "bg-warning/10 text-warning",
      sparkColor: "#f59e0b",
      sparkData: budgetSparkline,
      sparkLabels: incExpSparkLabels,
      href: "/budgets",
    },
  ];

  // --- Card registry: every dashboard card keyed by its stable id (see
  // src/lib/dashboard-layout.ts). `group` cards that sit next to each other in the saved
  // order share the original responsive grid wrapper, so the default order renders the
  // exact same grids as before customisation.
  const heroNode = () => (
    <motion.div key="net-worth" variants={itemVariants}>
      <NetWorthHeroCard
        href="/accounts"
        onMouseMove={handleMouseMove}
        value={totalNetWorth}
        currency={apiDisplayCurrency}
        change={momChange}
        changePct={momPct}
        changeCaption="vs last month"
        sparkData={nwSparkline}
        sparkLabels={nwSparkLabels}
      />
    </motion.div>
  );

  type CardDef = {
    /** Adjacent cards with the same group share this wrapper's grid classes. */
    group?: { key: string; className: string };
    render: (ctx: { grouped: boolean }) => React.ReactNode;
  };
  // Metric tiles (health score, the three monthly summary tiles, savings rate + DTI): the shared metric grid
  // (2 mobile, 3 tablet, 4 desktop). Adjacent in the saved order = one grid; its columns follow the visible tile count.
  const TILES_GRID = { key: "tiles", className: METRIC_GRID_CLASS };
  const TILE_COUNT: Record<string, number> = { "health-score": 1, "summary-stats": 3, "key-metrics": 2 };
  const ROW3_GRID = { key: "row3", className: "grid grid-cols-1 wide:grid-cols-3 gap-5" };
  const CHARTS_GRID = { key: "charts", className: "grid grid-cols-1 wide:grid-cols-2 gap-5" };
  const SPEND_GRID = { key: "spend", className: "grid grid-cols-1 wide:grid-cols-3 gap-5" };

  const CARDS: Record<string, CardDef> = {
    "onboarding-tips": {
      // Onboarding tips for first-time users
      render: () => (
        <motion.div key="onboarding-tips" variants={itemVariants}>
          <OnboardingTips page="dashboard" />
        </motion.div>
      ),
    },
    // Subscriptions with an occurrence due: Post now / Skip. Renders nothing (no DOM, no gap) when none is due.
    "due-subscriptions": {
      render: () => <DueCard key="due-subscriptions" returnTo="/dashboard" />,
    },
    "net-worth": { render: () => heroNode() },
    "health-score": { group: TILES_GRID, render: () => <HealthScoreCard key="health-score" health={health} /> },
    "summary-stats": {
      group: TILES_GRID,
      render: () => (
        <Fragment key="summary-stats">
          {summaryCards.map((card) => (
            <MetricCard key={card.label} {...card} currency={apiDisplayCurrency} />
          ))}
        </Fragment>
      ),
    },
    // Key ratios: Savings Rate + DTI (FINLYNQ-291) from the same /api/health-score payload.
    "key-metrics": {
      group: TILES_GRID,
      render: () => <KeyMetrics key="key-metrics" health={health} tiles savingsTrend={savingsTrend} />,
    },
    // Accurate merged series: cash live from transactions + investments from stored
    // snapshots; latest point matches the hero. plan/net-worth-over-time.md Part A.
    "net-worth-history": {
      render: () => (
        <LazyView key="net-worth-history" minHeight={340}>
          <motion.div variants={itemVariants}>
            <NetWorthHistoryChart />
          </motion.div>
        </LazyView>
      ),
    },
    "action-center": {
      group: ROW3_GRID,
      render: () => (
        <LazyView key="action-center" minHeight={180}>
          <ActionCenter />
        </LazyView>
      ),
    },
    "weekly-recap": {
      group: ROW3_GRID,
      render: () => (
        <LazyView key="weekly-recap" minHeight={220}>
          <WeeklyRecap />
        </LazyView>
      ),
    },
    "quick-import": {
      group: ROW3_GRID,
      render: () => (
        <LazyView key="quick-import" minHeight={180}>
          <QuickImport />
        </LazyView>
      ),
    },
    "income-expense-chart": {
      group: CHARTS_GRID,
      render: () => (
        <LazyView key="income-expense-chart" minHeight={300}>
          <IncomeExpenseChart data={incExpData} currency={apiDisplayCurrency} />
        </LazyView>
      ),
    },
    "spending-category-chart": {
      group: CHARTS_GRID,
      render: () => (
        <LazyView key="spending-category-chart" minHeight={260}>
          <SpendingCategoryChart data={spendingData} currency={apiDisplayCurrency} />
        </LazyView>
      ),
    },
    "available-to-spend": {
      group: SPEND_GRID,
      render: () => (
        <LazyView key="available-to-spend" minHeight={200}>
          <AvailableToSpend
            income={lastMonthIncome}
            expenses={lastMonthExpenses}
            currency={apiDisplayCurrency}
            monthLabel={lastMonthKey ? getMonthLabel(lastMonthKey) : undefined}
          />
        </LazyView>
      ),
    },
    insights: {
      render: () => (
        <LazyView key="insights" minHeight={200}>
          <InsightsSection currency={apiDisplayCurrency} />
        </LazyView>
      ),
    },
  };

  // Saved order, minus hidden cards, minus dev-only cards when dev mode is off. Every card renders inline.
  const devOnly = new Set(DASHBOARD_CARDS.filter((c) => c.devOnly).map((c) => c.id));
  const visibleIds = layout.order.filter((id) => CARDS[id] && !layout.hidden.includes(id) && (devMode || !devOnly.has(id)));
  const availableIds = DASHBOARD_CARDS.filter((c) => devMode || !c.devOnly).map((c) => c.id);

  // Adjacent cards that share a group (in saved order) share one responsive grid wrapper.
  type Run = { group?: CardDef["group"]; ids: string[] };
  const runs: Run[] = [];
  for (const id of visibleIds) {
    const g = CARDS[id].group;
    const last = runs[runs.length - 1];
    if (g && last?.group?.key === g.key) last.ids.push(id);
    else runs.push({ group: g, ids: [id] });
  }
  const rows = runs.map((run) => {
    if (!run.group) return CARDS[run.ids[0]].render({ grouped: false });
    const className =
      run.group.key === TILES_GRID.key
        ? metricGridClass(run.ids.reduce((n, id) => n + (TILE_COUNT[id] ?? 0), 0), "gap-3 regular:gap-4")
        : run.group.className;
    return (
      <div key={run.ids.join("+")} className={className}>
        {run.ids.map((id) => CARDS[id].render({ grouped: run.ids.length > 1 }))}
      </div>
    );
  });

  return (
    <>
      {showOnboarding && userInfo && (
        <OnboardingWizard
          userEmail={userInfo.email}
          displayName={userInfo.displayName}
          onComplete={() => setShowOnboarding(false)}
        />
      )}
    <motion.div
      className="space-y-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ============================================
          HEADER — Greeting + More, Customize (shared header), Add
          ============================================ */}
      <motion.div variants={itemVariants} className="contents">
        <PageHeader
          className="flex flex-wrap items-center justify-between gap-3"
          title="Dashboard"
          subtitle={`${greeting}. Here's your financial overview`}
          overflow={[{ label: "General settings", icon: Settings, href: "/settings/general" }]}
          actions={
            <Button
              render={<Link href="/transactions/new" />}
              aria-label="Add transaction"
              title="Add transaction"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add
            </Button>
          }
        />
      </motion.div>

      {/* One period control for every metric card on the page (?range=&from=&to=; default = month vs last month) */}
      <motion.div variants={itemVariants}>
        <MetricRangeSelect value={selection} onChange={setSelection} />
      </motion.div>

      {/* Currency audit banner — shown only when there are unresolved cross-currency rows */}
      <motion.div variants={itemVariants}>
        <CurrencyAuditBanner />
      </motion.div>

      {/* Cards, in the user's saved order (default = the original dashboard order). */}
      {rows}
    </motion.div>

      <CustomizeDashboardSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        layout={layout}
        availableIds={availableIds}
        onSave={saveLayout}
        onReset={resetLayout}
      />
    </>
  );
}
