"use client";

/**
 * Category view — one category's spending (or income) over time.
 *
 * Monthly bars with the average and budget, comparisons with last month and
 * the same month last year, share of all spending, top payees and recent
 * transactions. Data: GET /api/reports/category (math in
 * lib/reports/category-detail.ts). Reached from the Reports category tables and
 * the Budgets page; the switcher in the header moves between categories.
 */

import type { MetricCardProps } from "@/components/metric-card";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { formatCurrency, formatDate } from "@/lib/currency";
import { formatCompactNumber } from "@/lib/utils/number";
import { CHART_COLORS } from "@/lib/chart-colors";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { todayISO } from "@/lib/utils/date";
import { type CategoryDetail } from "@/lib/reports/category-detail";
import { ArrowLeftRight, BarChart3, CalendarClock, Pencil, Percent, Receipt, Scale, Store, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Amount, CustomizeCardsSheet, HEADER_DESKTOP_ONLY, ListRow, PHONE_PRIMARY_CLASS, MetricGrid, PageHeader, SectionCard,
  useCardLayout, usePageCustomize,
} from "@/components/mobile";
import type { PageCard } from "@/lib/card-layout";
import { PageToolbar } from "@/components/page-toolbar";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { compareCaption, periodLabel, resolvePeriod, RANGE_LABELS } from "@/lib/metrics/period";
import { resolveCard } from "@/lib/metrics/delta";
import { cardProps } from "@/lib/metrics/series";

/** Cards of the category page, default order (Customize). The period selector and the header are not cards. */
const CATEGORY_DETAIL_CARDS: readonly PageCard[] = [
  { id: "summary", title: "Summary" },
  { id: "chart", title: "Monthly chart" },
  { id: "payees", title: "Top payees" },
  { id: "recent", title: "Recent transactions" },
];

type CategoryResponse = CategoryDetail & {
  category: { id: number; name: string | null; type: "E" | "I" | "R"; group: string };
  windowMonths: number;
  displayCurrency: string;
  payeesLocked: boolean;
};

type CategoryOption = { id: number; name: string | null; type: string };

function monthLabel(key: string, style: "short" | "long" = "short"): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: style === "short" ? "short" : "long",
    year: style === "short" ? "2-digit" : "numeric",
    timeZone: "UTC",
  });
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(n * 100 < 10 ? 1 : 0)}%`;
}

/** "+12% vs average" style comparison; null when there's no baseline. */
function changeVs(value: number, base: number | null): { text: string; up: boolean } | null {
  if (base == null || base === 0) return null;
  const change = (value - base) / Math.abs(base);
  return { text: `${change >= 0 ? "+" : ""}${Math.round(change * 100)}%`, up: change >= 0 };
}

export default function CategoryPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" rows={4} />}>
      <CategoryPageContent />
    </Suspense>
  );
}

function CategoryPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const categoryId = Number(params.id);

  // The toolbar range (?range=&from=&to=&month=) drives the data: the report query is keyed on the selected period.
  const metricRange = useMetricRange();
  const sel = metricRange.selection;
  const { start: periodFrom, end: periodTo } = metricRange.period;
  // Cache-first: a revisit paints the last cards / chart at once and revalidates in the background.
  const catRes = useCacheFirstJson<{ data?: CategoryResponse }>(`/api/reports/category?categoryId=${categoryId}&from=${periodFrom}&to=${periodTo}`);
  const data: CategoryResponse | null = catRes.data?.data ?? null;
  const loading = catRes.loading;
  const error: "not_found" | "failed" | null = catRes.error
    ? (catRes.errorStatus === 404 || catRes.errorStatus === 400 ? "not_found" : "failed")
    : null;
  const load = catRes.reload;
  const categoriesRes = useCacheFirstJson<CategoryOption[]>("/api/categories");
  const categories = useMemo<CategoryOption[]>(() => (Array.isArray(categoriesRes.data) ? categoriesRes.data : []), [categoriesRes.data]);
  const sortCategory = useDropdownOrder("category");
  const cardLayout = useCardLayout("category-detail", CATEGORY_DETAIL_CARDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  usePageCustomize(data && !error ? { onOpen: () => setCustomizeOpen(true) } : null);



  const switcherItems = useMemo(
    () =>
      sortCategory(
        categories
          .filter((c) => c.type === "E" || c.type === "I")
          .map((c): ComboboxItemShape => ({ value: String(c.id), label: c.name ?? `Category #${c.id}` })),
        (c) => Number(c.value),
        (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
      ),
    [categories, sortCategory],
  );

  if (loading && !data) return <PageSkeleton variant="list" rows={4} />;
  if (error === "not_found") {
    return <ErrorState title="Category not found" message="This category doesn't exist or isn't yours." />;
  }
  if (error || !data) {
    return <ErrorState title="Couldn't load this category" message="Please try again." onRetry={load} />;
  }

  const { category, stats, displayCurrency: cur } = data;
  const isIncome = category.type === "I";
  const typeLabel = isIncome ? "Income" : category.type === "R" ? "Transfer" : "Expense";
  const noun = isIncome ? "income" : "spending";
  const barColor = isIncome ? CHART_COLORS.positive : CHART_COLORS.negative;
  const today = todayISO();
  const windowStart = periodFrom;
  const windowEnd = periodTo < today ? periodTo : today;
  const currentMonth = data.months[data.months.length - 1];
  const chartData = data.months.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const lastVsAvg = changeVs(stats.lastMonth, stats.averageMonthly);
  const hasData = stats.transactionCount > 0;

  const categoriesBackHref = `/categories${category.type === "I" ? "?type=I" : ""}`;

  // Cards 1-2 follow the shared metric range (default: this month so far vs last month, last month vs the month
  // before); they come from the same monthly amounts as the chart. Average / same month last year / share have no
  // comparable previous value in this window, so they show the figure only.
  const caption = compareCaption(metricRange.selection);
  const points = data.months.map((m) => ({ month: m.month, value: m.amount }));
  const countPts = data.months.map((m) => ({ month: m.month, value: m.count }));
  const thisCard = resolveCard({
    points, period: metricRange.period, mode: "sum", isDefault: !metricRange.explicit && !sel.month, pageValue: stats.thisMonth, kind: "money", currency: cur, caption,
  });
  // The month before the period's last month (today's last month for the default view).
  const lastMonthPeriod = resolvePeriod({ range: "last_month" }, today, currentMonth?.month);
  const lastCard = resolveCard({
    points, period: lastMonthPeriod, mode: "sum", isDefault: true, pageValue: stats.lastMonth, kind: "money", currency: cur, caption: "vs the month before",
  });
  // The selected period in words, used wherever the old "last N months" copy was.
  const periodName = sel.range === "custom"
    ? `${sel.from} to ${sel.to}`
    : sel.month || sel.range === "this_quarter" || sel.range === "this_year" || sel.range === "this_month"
      ? periodLabel(sel, today)
      : RANGE_LABELS[sel.range];
  const rangeTitle = metricRange.explicit || sel.month
    ? (sel.range === "custom" ? periodName : sel.month ? periodName : RANGE_LABELS[sel.range])
    : "This month so far";
  const countCard = resolveCard({ points: countPts, period: metricRange.period, mode: "sum", isDefault: false, kind: "count", caption });
  const summaryMetrics: MetricCardProps[] = [
    { icon: Wallet,
      label: rangeTitle,
      value: metricRange.explicit || sel.month ? (thisCard.value ?? 0) : stats.thisMonth,
      currency: cur,
      ...cardProps(thisCard, !isIncome),
      note: currentMonth?.budget != null && !metricRange.explicit && !sel.month
        ? `of ${formatCurrency(currentMonth.budget, cur)} budget`
        : `${countCard.value ?? currentMonth?.count ?? 0} transaction${(countCard.value ?? currentMonth?.count) === 1 ? "" : "s"}`,
    },
    { icon: Wallet,
      label: `Last month (${monthLabel(data.months[data.months.length - 2]?.month ?? "", "short")})`,
      value: stats.lastMonth,
      currency: cur,
      ...cardProps(lastCard, !isIncome),
      note: lastVsAvg ? `${lastVsAvg.text} vs average` : undefined,
    },
    { icon: Scale,
      label: "Monthly average",
      value: stats.averageMonthly != null ? stats.averageMonthly : "—",
      currency: stats.averageMonthly != null ? cur : undefined,
      sub: stats.medianMonthly != null ? `median ${formatCurrency(stats.medianMonthly, cur)}` : "needs a full month",
    },
    { icon: CalendarClock,
      label: `${monthLabel(currentMonth?.month ?? "", "long").split(" ")[0]} last year`,
      value: stats.sameMonthLastYear,
      currency: cur,
      sub: "same month, a year ago",
    },
    { icon: Percent, label: `Share of ${noun}`, value: pct(stats.shareOfType), sub: `of all ${noun}, ${periodName}` },
  ];

  const nodes: Record<string, ReactNode> = {
    summary: (
      <div className="space-y-3">
        <PageToolbar refresh range={{ selection: metricRange.selection, onChange: metricRange.setSelection }} />
        <MetricGrid metrics={summaryMetrics} />
      </div>
    ),
    chart: hasData ? (
      <SectionCard label={`Monthly ${noun}`} icon={BarChart3} tone="indigo">
        <p className="mb-3 text-xs text-muted-foreground">
          Monthly in {cur}, {data.months.length} month{data.months.length === 1 ? "" : "s"} to {monthLabel(currentMonth?.month ?? "", "short")}
          {stats.averageMonthly != null && ` · average ${formatCurrency(stats.averageMonthly, cur)}`}
          {data.hasBudget && " · budget in amber"}
          {currentMonth?.partial && " · the last month is still running"}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)" }} interval="preserveStartEnd" />
            <YAxis fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => formatCompactNumber(Number(v))} />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const m = payload[0].payload as (typeof chartData)[number];
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-semibold">{monthLabel(m.month, "long")}{m.partial ? " (so far)" : ""}</p>
                    <p className="tabular-nums">{formatCurrency(m.amount, cur)} · {m.count} transaction{m.count === 1 ? "" : "s"}</p>
                    {m.budget != null && <p className="text-muted-foreground tabular-nums">Budget {formatCurrency(m.budget, cur)}</p>}
                  </div>
                );
              }}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
              {chartData.map((m) => (
                <Cell key={m.month} fill={barColor} fillOpacity={m.partial ? 0.45 : 0.85} />
              ))}
            </Bar>
            {data.hasBudget && (
              <Line
                type="stepAfter"
                dataKey="budget"
                stroke={CHART_COLORS.categories[1]}
                strokeWidth={2}
                strokeDasharray="5 4"
                // Dots too: a budget set for a single month is one point, which a line alone never draws.
                dot={{ r: 3, fill: CHART_COLORS.categories[1], strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {stats.averageMonthly != null && (
              <ReferenceLine y={stats.averageMonthly} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </SectionCard>
    ) : null,
    payees: hasData ? (
      <SectionCard label="Top payees" icon={Users} tone="violet" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] px-3">
        <p className="px-1 py-3 text-xs text-muted-foreground"><Store className="mr-1 inline h-3.5 w-3.5" />Where this {noun} went, {periodName}</p>
        {data.payeesLocked ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">Unlock your data to see payees.</p>
        ) : data.topPayees.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">No payees recorded.</p>
        ) : (
          data.topPayees.map((p) => (
            <ListRow
              key={p.payee}
              href={buildTxDrillUrl({ categoryId: String(categoryId), search: p.payee === "(no payee)" ? "" : p.payee, startDate: windowStart, endDate: windowEnd })}
              title={p.payee}
              subtitle={`${p.count}× · ${pct(p.share)} of ${noun}`}
              value={<Amount value={p.amount} currency={cur} size="md" tone="none" />}
            />
          ))
        )}
      </SectionCard>
    ) : null,
    recent: hasData ? (
      <SectionCard label="Recent transactions" icon={ArrowLeftRight} tone="cyan" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] px-3">
        <p className="px-1 py-3 text-xs text-muted-foreground"><Receipt className="mr-1 inline h-3.5 w-3.5" />{stats.transactionCount} in {periodName}{stats.averageTransaction != null && ` · average ${formatCurrency(stats.averageTransaction, cur)}`}</p>
        {data.recent.map((t) => (
          <ListRow
            key={t.id}
            href={buildTxDrillUrl({ id: String(t.id) })}
            title={t.payee || "(no payee)"}
            subtitle={`${formatDate(t.date)}${t.accountName ? ` · ${t.accountName}` : ""}`}
            value={<Amount value={t.amount} currency={t.currency} size="md" tone="auto" />}
          />
        ))}
        <div className="px-1 py-3">
          <Link
            href={buildTxDrillUrl({ categoryId: String(categoryId), startDate: windowStart, endDate: windowEnd })}
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            View all {stats.transactionCount} transactions
          </Link>
        </div>
      </SectionCard>
    ) : null,
  };

  const shown = cardLayout.layout.order.filter((id) => !cardLayout.layout.hidden.includes(id));

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <PageHeader
        className="flex flex-wrap items-start justify-between gap-3"
        title={category.name ?? "Category"}
        backHref={categoriesBackHref}
        backLabel="Back to Categories"
        belowTitle={
          <div className="mt-0.5 flex max-w-full flex-wrap justify-center gap-2 regular:justify-start" data-testid="category-type-chip">
            <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
            {category.group && category.group.toLowerCase() !== typeLabel.toLowerCase() && <Badge variant="secondary" className="text-xs">{category.group}</Badge>}
          </div>
        }
        actions={
          <>
          {switcherItems.length > 0 ? (
            <span className={HEADER_DESKTOP_ONLY}>
              <Combobox
                value={String(categoryId)}
                onValueChange={(v) => {
                  if (v && v !== String(categoryId)) router.push(`/categories/${v}${typeof window !== "undefined" ? window.location.search : ""}`);
                }}
                items={switcherItems}
                placeholder="Switch category"
                searchPlaceholder="Search categories…"
                emptyMessage="No matches"
                className="w-56 max-regular:w-40"
              />
            </span>
          ) : null}
          {/* Edit: the one shared category + budget form on /categories (slot for the toolbar's Filter button stays in the capsule) */}
          <Button className={PHONE_PRIMARY_CLASS} aria-label="Edit" render={<Link href={`/categories?edit=${categoryId}`} />}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          </>
        }
        overflow={[
          { label: "All categories", href: "/categories" },
        ]}
      />

      {/* Cards: summary and recent span the row, the chart takes 2 of 3 columns at wide, payees 1. */}
      <div data-slot="category-detail-cards" className={TW.grid3}>
        {shown.map((id) =>
          nodes[id] ? (
            <div
              key={id}
              className={cn(
                "min-w-0",
                (id === "summary" || id === "recent") && "col-span-full",
                id === "chart" && "regular:col-span-2",
              )}
            >
              {nodes[id]}
            </div>
          ) : null,
        )}
      </div>

      {!hasData && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-semibold">No transactions in this category in {periodName}</p>
            <p className="text-sm text-muted-foreground mt-1">Try another period, or pick another category above.</p>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <p className="text-xs text-muted-foreground">
          {periodName}: {formatCurrency(stats.total, cur)} in total
          {stats.highestMonth && ` · highest month ${monthLabel(stats.highestMonth.month, "long")} (${formatCurrency(stats.highestMonth.amount, cur)})`}
          . Amounts are in {cur}, converted at each transaction&apos;s historical rate.
        </p>
      )}

      <CustomizeCardsSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        title="Customize category"
        description="Show, hide and reorder the cards on this category."
        cards={CATEGORY_DETAIL_CARDS}
        layout={cardLayout.layout}
        onSave={cardLayout.save}
        onReset={cardLayout.reset}
      />
    </div>
  );
}
