"use client";

/**
 * Categories hub: spending / income by category with the month's budgets. Everything lives here: the topbar Add
 * button and each row's Edit open the ONE shared CategoryBudgetForm (?edit=new | ?edit=<id>). /budgets and
 * /settings/categorization redirect to /categories.
 *
 * Overview: metric cards (Total Budget / Total Spent / Remaining, spending only), the share pie and the Categories
 * list. A group header and a category are the SAME row (CategoryRow); a group shows the rollup of its children.
 */

import { Fragment, Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Cell, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { formatCurrency, getMonthLabel } from "@/lib/currency";
import { CHART_COLORS } from "@/lib/chart-colors";
import { localDateISO } from "@/lib/utils/date";
import { parseSaveError } from "@/lib/save-error";
import { shiftMonth } from "@/lib/reports/category-detail";
import type { CategoryOverview, OverviewCategory } from "@/lib/reports/category-overview";
import { buildGroupRows, findRow, pieSlices, subLabel, type OverviewRow } from "@/lib/categories/group-overview";
import { useAnimations } from "@/hooks/use-animations";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { ArrowRightLeft, ChartPie, Check, ChevronLeft, ChevronRight, Copy, FileDown, ListChecks, PiggyBank, Pencil, Plus, Receipt, Save, Tags, Wallet } from "lucide-react";
import { CategoryBudgetForm, type FormCategory } from "./_components/category-budget-form";
import { CategoryRow } from "./_components/category-row";
import {
  CustomizeCardsSheet, MetricGrid, PageHeader, PHONE_PRIMARY_CLASS, SectionCard, useCardLayout, usePageCustomize,
  type MetricItem, type OverflowAction,
} from "@/components/mobile";
import { MetricRangeSelect } from "@/components/metric-range-select";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { compareCaption, seriesWindow, type MonthPoint } from "@/lib/metrics/period";
import { NO_HISTORY_CAPTION, resolveCard } from "@/lib/metrics/delta";
import { useDisplayCurrency } from "@/components/currency-provider";
import type { PageCard } from "@/lib/card-layout";
import type { Budget } from "../budgets/_components/budget-types";
import { applyPendingBudgets, type BudgetSyncMark } from "@/lib/budgets/pending-overlay";
import { discardQueuedCreate, isLocalWriteQueueActive, queueOfflineBudgetDelete, usePendingBudgets } from "@/lib/data/local-write-queue";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";

type OverviewResponse = CategoryOverview & { type: "E" | "I"; displayCurrency: string };

/** Top-level groups shown as pie slices before the rest collapses into "Other". */
const PIE_SEGMENTS = 7;
const OTHER_KEY = "other";
const OTHER_COLOR = CHART_COLORS.categories[11];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Cards of the categories overview, default order. */
const CATEGORY_CARDS: readonly PageCard[] = [
  { id: "metrics", title: "Totals" },
  { id: "summary", title: "Share" },
  { id: "by-category", title: "Categories" },
];

/** Previous month's amount of a series whose last point is the selected month. */
function prevOf(trend: number[] | null): number | null {
  return trend && trend.length >= 2 ? trend[trend.length - 2] : null;
}

export default function CategoriesPageContent() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" rows={6} />}>
      <CategoriesOverview />
    </Suspense>
  );
}

/** DOM id of a group's row wrapper (scroll target for pie / legend clicks). */
function groupDomId(key: string): string {
  return `cat-group-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Previous calendar month as YYYY-MM. */
function prevMonthOf(m: string): string {
  return shiftMonth(m, -1);
}

/** "Waiting" / "Failed" badge on a budget queued on this device. */
function SyncBadge({ mark }: { mark: BudgetSyncMark }) {
  if (mark.status === "failed") {
    return (
      <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive" title={mark.failReason ?? "Sync failed"}>
        Sync failed
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground" title="Saved on this device; syncs when online">
      Waiting to sync
    </span>
  );
}

function CategoriesOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animationsEnabled = useAnimations();
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
  // Expanded top-level groups (several may be open). Empty = all collapsed.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [copying, setCopying] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const currentMonth = localDateISO().slice(0, 7);
  const monthParam = searchParams.get("month");
  const month = monthParam && MONTH_RE.test(monthParam) && monthParam <= currentMonth ? monthParam : currentMonth;
  const type: "E" | "I" = searchParams.get("type") === "I" ? "I" : "E";
  const isIncome = type === "I";

  // Cache-first when the local read cache is on (Settings > Data > Offline mode); a plain fetch otherwise.
  const overview = useCacheFirstJson<{ data: OverviewResponse }>(`/api/reports/categories?month=${month}&type=${type}&months=12`);
  const data: OverviewResponse | null = overview.data?.data ?? null;
  const loading = overview.loading;
  const failed = overview.error;
  const overviewReload = overview.reload;

  // The month's budgets (spending only), with the offline queue overlaid.
  const budgetsRes = useCacheFirstJson<Budget[]>(
    currencyLoading || isIncome ? null : `/api/budgets?month=${month}&currency=${encodeURIComponent(displayCurrency)}`,
    { keepPrevious: true },
  );
  // Every category (also those with no activity in the window), for the list's completeness and the form.
  const catsRes = useCacheFirstJson<FormCategory[]>("/api/categories");
  const catsReload = catsRes.reload;
  const allCategories = useMemo(() => (Array.isArray(catsRes.data) ? catsRes.data : []), [catsRes.data]);
  const budgetsReload = budgetsRes.reload;
  const serverBudgets = useMemo(() => (Array.isArray(budgetsRes.data) ? budgetsRes.data : []), [budgetsRes.data]);
  const budgetsKnown = !isIncome && Array.isArray(budgetsRes.data);
  const pendingBudgets = usePendingBudgets(() => budgetsReload());
  const budgets = useMemo(() => applyPendingBudgets(serverBudgets, pendingBudgets, month), [serverBudgets, pendingBudgets, month]);

  // Metric cards: month vs previous month by default (?range=&from=&to= overrides).
  const { selection, explicit, period, setSelection } = useMetricRange(month);
  const win = seriesWindow(period);
  const seriesRes = useCacheFirstJson<{ series: Array<{ month: string; budget: number; spent: number }> }>(
    currencyLoading || isIncome ? null : `/api/budgets/series?from=${win.from}&to=${win.to}&currency=${encodeURIComponent(displayCurrency)}`,
    { keepPrevious: true },
  );
  const seriesRows = useMemo(
    () => (seriesRes.data && !Array.isArray(seriesRes.data) && Array.isArray(seriesRes.data.series) ? seriesRes.data.series : []),
    [seriesRes.data],
  );

  const reloadAll = useCallback(() => {
    overviewReload();
    budgetsReload();
    catsReload();
  }, [overviewReload, budgetsReload, catsReload]);

  // ?edit=new | ?edit=<id> opens the shared category + budget form.
  const editParam = searchParams.get("edit");
  const editId = editParam && /^\d+$/.test(editParam) ? Number(editParam) : null;
  const formOpen = editParam === "new" || editId != null;
  function setEdit(next: "new" | number | null) {
    const qs = new URLSearchParams(searchParams.toString());
    if (next == null) qs.delete("edit");
    else qs.set("edit", String(next));
    router.replace(`/categories${qs.toString() ? `?${qs}` : ""}`, { scroll: false });
  }

  function go(next: { month?: string; type?: "E" | "I" }) {
    setOpenKeys(new Set()); // a new type or month starts with every group collapsed
    const m = next.month ?? month;
    const t = next.type ?? type;
    const qs = new URLSearchParams(searchParams.toString());
    if (m !== currentMonth) qs.set("month", m);
    else qs.delete("month");
    if (t === "I") qs.set("type", "I");
    else qs.delete("type");
    router.replace(`/categories${qs.toString() ? `?${qs}` : ""}`, { scroll: false });
  }

  const cardLayout = useCardLayout("categories", CATEGORY_CARDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  usePageCustomize(data && !failed ? { onOpen: () => setCustomizeOpen(true) } : null);

  // Overview categories with the live budgets merged in (and queued-create budgets of categories not in the report).
  const cats: OverviewCategory[] = useMemo(() => {
    if (!data) return [];
    const byCat = new Map(budgets.map((b) => [b.categoryId, b]));
    const merged: OverviewCategory[] = data.categories.map((c) =>
      isIncome ? { ...c, budget: null } : budgetsKnown ? { ...c, budget: byCat.get(c.id)?.amount ?? null } : c,
    );
    const seen = new Set(data.categories.map((c) => c.id));
    // Categories with no activity in the window still belong in the list (so they can be edited / deleted).
    for (const c of allCategories) {
      if (seen.has(c.id) || c.type !== type) continue;
      seen.add(c.id);
      merged.push({
        id: c.id, name: c.name, group: c.group ?? "", amount: 0, share: 0, average: null, change: null,
        budget: !isIncome && budgetsKnown ? (byCat.get(c.id)?.amount ?? null) : null, trend: data.windowMonths.map(() => 0),
      });
    }
    if (isIncome || !budgetsKnown) return merged;
    for (const b of budgets) {
      if (seen.has(b.categoryId)) continue;
      seen.add(b.categoryId);
      merged.push({
        id: b.categoryId, name: b.categoryName, group: b.categoryGroup ?? "", amount: 0, share: 0,
        average: null, change: null, budget: b.amount, trend: data.windowMonths.map(() => 0),
      });
    }
    return merged;
  }, [data, budgets, budgetsKnown, isIncome, allCategories, type]);

  const marks = useMemo(() => new Map(budgets.filter((b) => b.pendingSync).map((b) => [b.categoryId, b])), [budgets]);

  if (loading && !data) return <PageSkeleton variant="list" rows={6} />;
  if (failed || !data) {
    return <ErrorState title="Couldn't load" message="Try again." onRetry={overviewReload} />;
  }

  const cur = data.displayCurrency;
  const noun = isIncome ? "income" : "spending";
  const sparkLabels = data.windowMonths;

  const rows = buildGroupRows(cats, data.total);
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
    ? `${isIncome ? "Income" : "Spent"} ${getMonthLabel(month)}: ${formatCurrency(data.total, cur)}, top ${topRow.label} ${pct(topRow.amount)}%`
    : undefined;

  // ---- budgets: totals, form links, delete, copy ------------------------------------------------------------------
  const listUrl = `/categories${month !== currentMonth ? `?month=${month}` : ""}`;
  const formQuery = `month=${month}&returnTo=${encodeURIComponent(listUrl)}`;
  const budgeted = cats.filter((c) => c.budget != null);
  const totalBudget = budgeted.reduce((s, c) => s + (c.budget ?? 0), 0);
  const totalSpent = budgeted.reduce((s, c) => s + c.amount, 0);
  const totalLeft = totalBudget - totalSpent;

  const caption = compareCaption(selection);
  const pointsOf = (pick: (r: { budget: number; spent: number }) => number): MonthPoint[] =>
    seriesRows.map((r) => ({ month: r.month, value: pick(r) }));
  const common = { period, isDefault: !explicit, currency: cur, caption, kind: "money" } as const;
  const budgetCard = resolveCard({ ...common, points: pointsOf((r) => r.budget), mode: "sum", pageValue: totalBudget });
  const spentCard = resolveCard({ ...common, points: pointsOf((r) => r.spent), mode: "sum", pageValue: totalSpent });
  const leftCard = resolveCard({ ...common, points: pointsOf((r) => r.budget - r.spent), mode: "sum", pageValue: totalLeft });
  // Exactly these three cards.
  const metrics: MetricItem[] = [
    {
      id: "total-budget", label: "Total Budget", icon: Wallet, iconTone: "indigo", value: budgetCard.value ?? totalBudget, currency: cur,
      sub: budgetCard.delta ?? NO_HISTORY_CAPTION, badgePct: budgetCard.badgePct,
      sparkData: budgetCard.sparkData, sparkLabels: budgetCard.sparkLabels, sparkColor: "#6366f1",
    },
    {
      id: "total-spent", label: "Total Spent", icon: Receipt, iconTone: "rose", value: spentCard.value ?? totalSpent, currency: cur,
      valueClassName: totalSpent > totalBudget ? "text-destructive" : "text-pos",
      sub: spentCard.delta ?? NO_HISTORY_CAPTION, badgePct: spentCard.badgePct, invertTone: true,
      sparkData: spentCard.sparkData, sparkLabels: spentCard.sparkLabels, sparkColor: "#f43f5e",
    },
    {
      id: "remaining", label: "Remaining", icon: PiggyBank, iconTone: "emerald", value: leftCard.value ?? totalLeft, currency: cur,
      valueClassName: totalLeft >= 0 ? "text-pos" : "text-destructive",
      sub: leftCard.delta ?? NO_HISTORY_CAPTION, badgePct: leftCard.badgePct,
      sparkData: leftCard.sparkData, sparkLabels: leftCard.sparkLabels, sparkColor: "#10b981",
    },
  ];

  /** Server row of a budget (no overlay fields) as the offline queue's baseline. */
  function serverRowOf(b: Budget) {
    return { id: b.id, categoryId: b.categoryId, month: b.month, amount: b.amount, currency: b.currency ?? null, updatedAt: b.updatedAt ?? null, categoryName: b.categoryName, categoryGroup: b.categoryGroup };
  }

  /** Remove a budget (server or queued on this device). False = failed (the reason is in actionError). */
  async function clearBudget(b: Budget): Promise<boolean> {
    // A budget queued on this device and not yet synced: drop the queued create, nothing goes to the server.
    if (b.pendingSync?.kind === "create") {
      const dropped = await discardQueuedCreate(b.pendingSync.opId);
      if (!dropped) setActionError("Being sent now. Try again.");
      return dropped;
    }
    try {
      const res = await fetch(`/api/budgets?id=${b.id}`, { method: "DELETE" });
      return res.ok;
    } catch (netErr) {
      // The baseline is the server row, not the overlay (a queued edit would otherwise look like a server change).
      const serverRow = serverBudgets.find((x) => x.id === b.id) ?? b;
      return isLocalWriteQueueActive() && isNetworkFailure(netErr) ? await queueOfflineBudgetDelete(serverRowOf(serverRow)) : false;
    }
  }

  // Copy last month's budgets into the selected month (the upserting POST /api/budgets, native amount + currency).
  async function handleCopyFromPrevMonth() {
    setActionError("");
    setCopying(true);
    try {
      const res = await fetch(`/api/budgets?month=${prevMonthOf(month)}`);
      if (!res.ok) {
        setActionError(await parseSaveError(res, "Couldn't load last month"));
        return;
      }
      const prevRows = await res.json();
      if (!Array.isArray(prevRows) || prevRows.length === 0) {
        setActionError("No budgets last month.");
        return;
      }
      for (const b of prevRows as Array<{ categoryId: number; amount: number; currency?: string }>) {
        const post = await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: b.categoryId, month, amount: b.amount, ...(b.currency ? { currency: b.currency } : {}) }),
        });
        if (!post.ok) {
          setActionError(await parseSaveError(post, "Couldn't copy"));
          return;
        }
      }
      reloadAll();
    } catch {
      setActionError("Network error.");
    } finally {
      setCopying(false);
    }
  }

  const overflow: OverflowAction[] = [
    { label: copying ? "Copying…" : "Copy last month", icon: Copy, disabled: copying, onSelect: handleCopyFromPrevMonth },
    ...(budgets.length > 0 ? [{ label: "Save template", icon: Save, href: `/budgets/templates/new?${formQuery}` }] : []),
    { label: "Apply template", icon: FileDown, href: `/budgets/templates/apply?${formQuery}` },
    { label: "Rules", icon: ListChecks, href: "/settings/rules" },
    ...(budgets.length >= 2 ? [{ label: "Move money", icon: ArrowRightLeft, href: `/budgets/move-money?${formQuery}` }] : []),
  ];

  // ---- rows ---------------------------------------------------------------------------------------------------------

  /** A category row: a link to its detail page, or (Edit mode) a button that opens the shared form prefilled. */
  function categoryLink(c: OverviewCategory, group: string, dot: string, className: string, indent = false) {
    const body = categoryRow(c, group, dot, indent);
    return editMode ? (
      <button type="button" data-edit-row="" aria-label={`Edit: ${subLabel(c.name, group)}`} onClick={() => setEdit(c.id)} className={`${className} bg-primary/5 text-left`}>
        {body}
      </button>
    ) : (
      <Link href={`/categories/${c.id}`} className={className}>{body}</Link>
    );
  }

  /** The shared row for one OverviewRow (group = rollup of its children) or a single category. */
  const rowFor = (r: { label: string; amount: number; trend: number[] | null; budget: number | null; count?: number; badge?: ReactNode; dot: string; indent?: boolean }) => (
    <CategoryRow
      label={r.label}
      dot={r.dot}
      amount={r.amount}
      prev={prevOf(r.trend)}
      budget={r.budget}
      trend={r.trend}
      cur={cur}
      isIncome={isIncome}
      sparkLabels={sparkLabels}
      count={r.count}
      badge={r.badge}
      indent={r.indent}
    />
  );

  const categoryRow = (c: OverviewCategory, group: string, dot: string, indent = false) =>
    rowFor({
      indent,
      label: subLabel(c.name, group), amount: c.amount, trend: c.trend, budget: c.budget, dot,
      badge: marks.get(c.id)?.pendingSync ? <SyncBadge mark={marks.get(c.id)!.pendingSync!} /> : undefined,
    });

  const groupRow = (row: OverviewRow) =>
    rowFor({ label: row.label, amount: row.amount, trend: row.trend, budget: row.budget, count: row.categories.length, dot: colorOf(row.key) });

  const ROW_LINK = "block min-w-0 w-full py-3 pl-4 pr-11 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const toolbar = (
    <div data-slot="categories-toolbar" className="space-y-3">
      <Tabs value={type} onValueChange={(v) => go({ type: v === "I" ? "I" : "E" })}>
        <TabsList>
          <TabsTrigger value="E" className="px-3">Spending</TabsTrigger>
          <TabsTrigger value="I" className="px-3">Income</TabsTrigger>
        </TabsList>
      </Tabs>
      {/* ONE row: range dropdown, then the month switcher */}
      <div data-slot="categories-filters" className="flex flex-wrap items-center gap-3">
        {!isIncome && <MetricRangeSelect value={selection} onChange={setSelection} />}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => go({ month: shiftMonth(month, -1) })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium">{getMonthLabel(month)}</span>
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
    </div>
  );

  /** Budget tools (formerly the 3-dot menu): visible, small buttons under the metric cards. */
  const budgetTools = (
    <div data-slot="budget-tools" className="flex flex-wrap items-center gap-2">
      {overflow.map((it) => {
        const Icon = it.icon;
        const inner = (<>{Icon ? <Icon className="mr-1 h-3.5 w-3.5" aria-hidden /> : null}{it.label}</>);
        return it.href ? (
          <Button key={it.label} variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" render={<Link href={it.href} />}>{inner}</Button>
        ) : (
          <Button key={it.label} variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" disabled={it.disabled} onClick={it.onSelect}>{inner}</Button>
        );
      })}
    </div>
  );

  // The cards, keyed by their CATEGORY_CARDS id; rendered in the user's saved order (see below).
  const cardNodes: Record<string, ReactNode> = {
    metrics: isIncome ? null : (
      <div className="space-y-3">
        <MetricGrid metrics={metrics} columns={3} />
        {budgetTools}
      </div>
    ),
    summary: (
      <SectionCard label={isIncome ? "Income" : "Spent"} icon={ChartPie} tone="amber">
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
            <div>
              <p className="text-sm text-muted-foreground">
                {getMonthLabel(month)}{data.partial ? " · so far" : ""}
              </p>
              <p className="text-3xl font-bold tabular-nums">{formatCurrency(data.total, cur)}</p>
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
              <p className="text-sm text-muted-foreground">No {noun}.</p>
            )}
          </div>
        </div>
      </SectionCard>
    ),
    "by-category": (
      <SectionCard
        label="Categories"
        icon={Tags}
        tone="indigo"
        padded={false}
        className="[&>*]:min-w-0 [&>*:not(:last-child)]:shadow-[var(--list-divider)]"
      >
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground regular:col-span-full">No {noun}.</p>
        ) : (
          rows.map((row) =>
            row.kind === "group" ? (
              <div key={row.key} id={groupDomId(row.key)} data-slot="category-group">
                <Accordion
                  value={openKeys.has(row.key) ? row.key : null}
                  onValueChange={(v) => setOpen(row.key, v === row.key)}
                  className="gap-0"
                >
                  <AccordionItem
                    value={row.key}
                    title={groupRow(row)}
                    className="rounded-none border-0 bg-transparent"
                    triggerClassName="rounded-none px-4 py-3"
                    panelClassName="border-t border-border/50 p-0"
                  >
                    <ul className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                      {row.categories.map((c) => (
                        <li key={c.id}>{categoryLink(c, row.group, colorOf(row.key), ROW_LINK, true)}</li>
                      ))}
                    </ul>
                  </AccordionItem>
                </Accordion>
              </div>
            ) : (
              <div key={row.key} data-slot="category-single">{categoryLink(row.categories[0], "", colorOf(row.key), ROW_LINK)}</div>
            ),
          )
        )}
      </SectionCard>
    ),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        actions={
          <Button className={PHONE_PRIMARY_CLASS} aria-label="Add" render={<Link href="/categories?edit=new" />}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        }
        trailingCells={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            aria-label="Edit"
            aria-pressed={editMode}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? <Check className="size-4" /> : <Pencil className="size-4" />}
          </Button>
        }
      />
      {toolbar}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {cardLayout.layout.order
        .filter((id) => !cardLayout.layout.hidden.includes(id))
        .map((id) => (
          <Fragment key={id}>{cardNodes[id]}</Fragment>
        ))}

      <CustomizeCardsSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        title="Customize"
        description="Show, hide, reorder cards."
        cards={CATEGORY_CARDS}
        layout={cardLayout.layout}
        onSave={cardLayout.save}
        onReset={cardLayout.reset}
      />

      <Sheet open={formOpen} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto regular:max-w-md">
          <SheetHeader>
            <SheetTitle>{editId != null ? "Edit" : "Add"}</SheetTitle>
          </SheetHeader>
          {formOpen && (editParam === "new" || allCategories.some((c) => c.id === editId)) && (
            <CategoryBudgetForm
              key={`${editParam}-${budgetsKnown}-${allCategories.length}`}
              category={editId != null ? (allCategories.find((c) => c.id === editId) ?? null) : null}
              categories={allCategories}
              budgets={budgets}
              month={month}
              currency={displayCurrency}
              defaultType={type}
              onSaved={(warning) => { setActionError(warning ? `Budget: ${warning}` : ""); reloadAll(); setEdit(null); }}
              onCancel={() => setEdit(null)}
              onDeleted={() => { reloadAll(); setEdit(null); }}
              onClearBudget={async (b) => { const ok = await clearBudget(b); if (!ok) setActionError("Couldn't remove budget"); return ok; }}
            />
          )}
        </SheetContent>
      </Sheet>

      {data.partial && (
        <p className="text-xs text-muted-foreground">
          {getMonthLabel(month)} to date · {cur}
        </p>
      )}
    </div>
  );
}
