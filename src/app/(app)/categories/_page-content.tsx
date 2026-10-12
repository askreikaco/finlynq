"use client";

/**
 * Categories hub — merged overview + management page (WP8).
 *
 * When FINLYNQ_CATEGORIES_MERGED is enabled:
 * - Shows tabbed interface with Overview and Management tabs
 * - Overview: category spending/income report with trends
 * - Management: add/edit/delete categories and link to rules
 *
 * When disabled (default): Shows only overview (backward compatible)
 */

import { Suspense, useState } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { Sparkline } from "@/components/sparkline";
import { formatCurrency } from "@/lib/currency";
import { CHART_COLORS } from "@/lib/chart-colors";
import { localDateISO } from "@/lib/utils/date";
import { shiftMonth } from "@/lib/reports/category-detail";
import type { CategoryOverview, OverviewCategory } from "@/lib/reports/category-overview";
import { buildGroupRows, findRow, pieSlices, subLabel, type OverviewRow } from "@/lib/categories/group-overview";
import { useAnimations } from "@/hooks/use-animations";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryManagement } from "./_components/category-management";
import { PageHeader } from "@/components/mobile";

type OverviewResponse = CategoryOverview & { type: "E" | "I"; displayCurrency: string };

/** Top-level groups shown as pie slices before the rest collapses into "Other". */
const PIE_SEGMENTS = 7;
const OTHER_KEY = "other";
const OTHER_COLOR = CHART_COLORS.categories[11];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthName(key: string, style: "long" | "short" = "long"): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  });
}

function changeLabel(change: number | null): string | null {
  if (change == null || !Number.isFinite(change)) return null;
  const pct = Math.round(change * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** Up is bad for spending, good for income. */
function toneClass(change: number | null, isIncome: boolean): string {
  return change == null ? "text-muted-foreground" : (change > 0) === isIncome ? "text-pos" : "text-destructive";
}

interface CategoriesPageProps {
  isMerged: boolean;
}

export default function CategoriesPageContent({ isMerged }: CategoriesPageProps) {
  if (!isMerged) {
    return (
      <Suspense fallback={<PageSkeleton variant="list" rows={6} />}>
        <CategoriesOverview />
      </Suspense>
    );
  }

  // Merged UI: show tabs
  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        subtitle="View spending patterns and manage your categories."
      />

      <Suspense fallback={<PageSkeleton variant="list" rows={6} />}>
        <MergedHubTabs />
      </Suspense>
    </div>
  );
}

/**
 * Hub tabs. `?tab=manage` opens the Manage tab, so the create/rename pages
 * (/categories/new, /categories/[id]/edit) can return the user to it.
 */
function MergedHubTabs() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "manage" ? "manage" : "overview";
  return (
    <Tabs defaultValue={initialTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="manage">Manage</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6 mt-6">
        <Suspense fallback={<PageSkeleton variant="list" rows={6} />}>
          <CategoriesOverview embedded />
        </Suspense>
      </TabsContent>

      <TabsContent value="manage" className="space-y-6 mt-6">
        <CategoryManagement returnTo="/categories?tab=manage" />
      </TabsContent>
    </Tabs>
  );
}

interface CategoriesOverviewProps {
  embedded?: boolean;
}

/** Usual-month text for a row; "new this period" when there is no average. */
function usualText(average: number | null, budget: number | null, cur: string): string {
  const usual = average != null ? `usually ${formatCurrency(average, cur)}` : "new this period";
  return budget != null ? `${usual} · budget ${formatCurrency(budget, cur)}` : usual;
}

interface RowBodyProps {
  label: string;
  sub: string;
  dot: string;
  amount: number;
  share: number;
  trend: number[] | null;
  change: number | null;
  cur: string;
  isIncome: boolean;
  partial: boolean;
  sparkLabels: string[];
  shortMonth: string;
  chevron?: boolean;
}

/** One row of the By category card: name, sparkline, share bar, amount and vs usual. Used for groups and categories. */
function RowBody({ label, sub, dot, amount, share, trend, change, cur, isIncome, partial, sparkLabels, shortMonth, chevron }: RowBodyProps) {
  // Nothing yet this month reads as "none", not a green "-100%".
  const none = amount === 0;
  const ch = none ? (partial ? "none yet" : "none") : changeLabel(change);
  return (
    <>
      <div className="min-w-0 flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
        <div className="min-w-0">
          <p className="font-medium truncate">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
        </div>
      </div>
      <div className="max-regular:hidden">
        {trend ? (
          <Sparkline data={trend} color={isIncome ? CHART_COLORS.positive : CHART_COLORS.negative} labels={sparkLabels} currency={cur} />
        ) : null}
      </div>
      <div className="max-regular:hidden">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, backgroundColor: dot }} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{Math.round(share * 100)}% of {shortMonth}</p>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <div className="text-right">
          <p className="font-semibold tabular-nums">{formatCurrency(amount, cur)}</p>
          {ch && (
            <p className={`text-xs font-medium tabular-nums ${none ? "text-muted-foreground" : toneClass(change, isIncome)}`}>
              {none ? ch : `${ch} vs usual`}
            </p>
          )}
        </div>
        {chevron && <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden />}
      </div>
    </>
  );
}

const ROW_BASE =
  "grid grid-cols-[minmax(0,1fr)_auto] regular:grid-cols-[minmax(0,1.4fr)_7rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** A category row inside an open group. */
const ROW_CLASS = `${ROW_BASE} rounded-lg px-2 py-3`;
/** A top-level ungrouped category row, styled like a collapsed group header card. */
const CARD_ROW = `${ROW_BASE} rounded-xl border bg-card px-4 py-3`;

/** DOM id of a group's row wrapper (scroll target for pie / legend clicks). */
function groupDomId(key: string): string {
  return `cat-group-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Collapsible group header: name, category count, share of month and total on the right, vs usual under it. */
function groupHeader(row: OverviewRow, cur: string, isIncome: boolean) {
  const n = row.categories.length;
  const ch = changeLabel(row.change);
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate">{row.label}</span>
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
          {n}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono font-semibold tabular-nums">{formatCurrency(row.amount, cur)}</span>
        <span className="block text-xs font-normal text-muted-foreground tabular-nums">
          {Math.round(row.share * 100)}% of month
          {ch && <span className={`ml-1.5 font-medium ${toneClass(row.change, isIncome)}`}>{ch} vs usual</span>}
        </span>
      </span>
    </span>
  );
}

function CategoriesOverview({ embedded = false }: CategoriesOverviewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animationsEnabled = useAnimations();
  // Expanded top-level groups (several may be open). Empty = all collapsed.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const currentMonth = localDateISO().slice(0, 7);
  const monthParam = searchParams.get("month");
  const month = monthParam && MONTH_RE.test(monthParam) && monthParam <= currentMonth ? monthParam : currentMonth;
  const type: "E" | "I" = searchParams.get("type") === "I" ? "I" : "E";

  // Cache-first when the local read cache is on (Settings > Data > Offline mode); a plain fetch otherwise.
  const overview = useCacheFirstJson<{ data: OverviewResponse }>(`/api/reports/categories?month=${month}&type=${type}&months=12`);
  const data: OverviewResponse | null = overview.data?.data ?? null;
  const loading = overview.loading;
  const failed = overview.error;
  const load = overview.reload;

  function go(next: { month?: string; type?: "E" | "I" }) {
    setOpenKeys(new Set()); // a new type or month starts with every group collapsed
    const m = next.month ?? month;
    const t = next.type ?? type;
    const qs = new URLSearchParams();
    if (m !== currentMonth) qs.set("month", m);
    if (t === "I") qs.set("type", "I");
    router.replace(`/categories${qs.toString() ? `?${qs}` : ""}`, { scroll: false });
  }

  if (loading && !data) return <PageSkeleton variant="list" rows={6} />;
  if (failed || !data) {
    return <ErrorState title="Couldn't load categories" message="Please try again." onRetry={load} />;
  }

  const cur = data.displayCurrency;
  const isIncome = type === "I";
  const noun = isIncome ? "income" : "spending";
  const totalChange = data.averageTotal ? (data.total - data.averageTotal) / data.averageTotal : null;
  const sparkLabels = data.windowMonths.map((m) => monthName(m, "short"));
  const shortMonth = monthName(month, "short");

  const rows = buildGroupRows(data.categories, data.total);
  const { slices, other } = pieSlices(rows, PIE_SEGMENTS);
  const sliceIndex = new Map(slices.map((r, i) => [r.key, i]));
  const colorOf = (key: string) => {
    const i = sliceIndex.get(key);
    return i == null ? OTHER_COLOR : CHART_COLORS.categories[i % CHART_COLORS.categories.length];
  };
  const pieData = [
    ...slices.map((r) => ({ key: r.key, name: r.label, value: r.amount, color: colorOf(r.key) })),
    ...(other > 0 ? [{ key: OTHER_KEY, name: "Other", value: other, color: OTHER_COLOR }] : []),
  ];
  const pct = (amount: number) => (data.total > 0 ? Math.round((amount / data.total) * 100) : 0);
  const topRow = slices[0];

  function setOpen(key: string, open: boolean) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // Pie slice / legend item: a group expands and scrolls into view; a category opens its detail page; "Other" does nothing.
  function openPieKey(key: string) {
    if (key === OTHER_KEY) return;
    const row = findRow(rows, key);
    if (!row) return;
    if (row.kind === "category") {
      router.push(`/categories/${row.categories[0].id}`);
      return;
    }
    setOpen(key, true);
    setTimeout(() => {
      document.getElementById(groupDomId(key))?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }, 0);
  }

  const pieLabel = topRow
    ? `${isIncome ? "Income" : "Spending"} in ${monthName(month)}: ${formatCurrency(data.total, cur)}, largest ${topRow.label} ${pct(topRow.amount)}%`
    : undefined;

  const categoryRowBody = (c: OverviewCategory, group: string) => (
    <RowBody
      label={subLabel(c.name, group)}
      sub={usualText(c.average, c.budget, cur)}
      dot={colorOf(`c:${c.id}`)}
      amount={c.amount}
      share={c.share}
      trend={c.trend}
      change={c.change}
      cur={cur}
      isIncome={isIncome}
      partial={data.partial}
      sparkLabels={sparkLabels}
      shortMonth={shortMonth}
    />
  );

  const embeddedHeader = (
    <div className={embedded ? "flex flex-wrap items-center justify-end gap-2" : "flex flex-wrap items-center gap-2"}>
      <Tabs value={type} onValueChange={(v) => go({ type: v === "I" ? "I" : "E" })}>
        <TabsList>
          <TabsTrigger value="E" className="px-3">Spending</TabsTrigger>
          <TabsTrigger value="I" className="px-3">Income</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => go({ month: shiftMonth(month, -1) })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-32 text-center text-sm font-medium">{monthName(month)}</span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          disabled={month >= currentMonth}
          onClick={() => go({ month: shiftMonth(month, 1) })}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Spending by category"
          subtitle="Where your money goes, and how each category compares with a usual month."
        />
      )}
      {embeddedHeader}

      {/* Month summary + where it went */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col regular:flex-row regular:items-center gap-5">
            {slices.length > 0 && (
              <div role="img" aria-label={pieLabel} className="mx-auto shrink-0 regular:mx-0">
                <PieChart width={160} height={160}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    stroke="none"
                    isAnimationActive={animationsEnabled}
                    onClick={(_, index) => openPieKey(pieData[index]?.key ?? OTHER_KEY)}
                    style={{ cursor: "pointer" }}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isIncome ? "Income" : "Spending"} in {monthName(month)}{data.partial ? " so far" : ""}
                  </p>
                  <p className="text-3xl font-bold tabular-nums">{formatCurrency(data.total, cur)}</p>
                </div>
                {data.averageTotal != null && (
                  <p className="text-sm text-muted-foreground">
                    Usual month {formatCurrency(data.averageTotal, cur)}
                    {changeLabel(totalChange) && (
                      <span className={`ml-1.5 font-medium ${toneClass(totalChange, isIncome)}`}>{changeLabel(totalChange)}</span>
                    )}
                  </p>
                )}
              </div>
              {slices.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {pieData.map((d) => {
                    const isOther = d.key === OTHER_KEY;
                    const share = isOther ? Math.round((other / data.total) * 100) : pct(d.value);
                    return (
                      <li key={d.key}>
                        <button
                          type="button"
                          disabled={isOther}
                          onClick={() => openPieKey(d.key)}
                          className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} aria-hidden />
                          <span className="truncate">{d.name} {share}%</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No {noun} recorded in {monthName(month)} yet.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category list: top-level groups as collapsed accordions (several may be open), ungrouped categories as plain rows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By category</CardTitle>
          <CardDescription>
            Compared with each category&apos;s average over the previous complete months (up to 11) · {cur}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 regular:px-6">
          {data.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2">No categories with {noun} in the last 12 months.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row) =>
                row.kind === "group" ? (
                  <li key={row.key} id={groupDomId(row.key)}>
                    <Accordion
                      value={openKeys.has(row.key) ? row.key : null}
                      onValueChange={(v) => setOpen(row.key, v === row.key)}
                    >
                      <AccordionItem value={row.key} title={groupHeader(row, cur, isIncome)}>
                        <ul className="-mx-2 -my-2 divide-y">
                          {row.categories.map((c) => (
                            <li key={c.id}>
                              <Link href={`/categories/${c.id}`} className={ROW_CLASS}>
                                {categoryRowBody(c, row.group)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </AccordionItem>
                    </Accordion>
                  </li>
                ) : (
                  <li key={row.key}>
                    <Link href={`/categories/${row.categories[0].id}`} className={CARD_ROW}>
                      {categoryRowBody(row.categories[0], "")}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {data.partial && (
        <p className="text-xs text-muted-foreground">
          {monthName(month)} is still running, so its amounts are month-to-date. Amounts are in {cur}, converted at each transaction&apos;s historical rate.
        </p>
      )}
    </div>
  );
}
