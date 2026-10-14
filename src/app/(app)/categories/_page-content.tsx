"use client";

/**
 * Categories hub — spending / income by category with the month's budgets (budgets are merged in here; /budgets
 * redirects to /categories).
 *
 * When FINLYNQ_CATEGORIES_MERGED is enabled the page has Overview and Manage tabs (Manage = add / edit / delete
 * categories); otherwise it shows only the overview.
 *
 * Overview: metric cards (Total Budget / Total Spent / Remaining, spending only), the share pie and the By category
 * list. A group header and a category are the SAME row (CategoryRow); a group shows the rollup of its children.
 */

import { Fragment, Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Cell, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { ArrowRightLeft, ChevronLeft, ChevronRight, Copy, FileDown, PiggyBank, Pencil, Plus, Receipt, Save, Trash2, Wallet } from "lucide-react";
import { CategoryManagement } from "./_components/category-management";
import { CategoryRow } from "./_components/category-row";
import {
  CustomizeCardsSheet, MetricGrid, OverflowMenu, PageHeader, SectionCard, useCardLayout, usePageCustomize,
  type MetricItem, type OverflowAction,
} from "@/components/mobile";
import { CARD_ROW_GRID } from "@/components/mobile/section-card";
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
      <PageHeader title="Categories" />

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

function CategoriesOverview({ embedded = false }: CategoriesOverviewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animationsEnabled = useAnimations();
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
  // Expanded top-level groups (several may be open). Empty = all collapsed.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [actionError, setActionError] = useState("");
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
  }, [overviewReload, budgetsReload]);

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
    if (!budgetsKnown) return data.categories.map((c) => (isIncome ? { ...c, budget: null } : c));
    const byCat = new Map(budgets.map((b) => [b.categoryId, b]));
    const merged = data.categories.map((c) => ({ ...c, budget: byCat.get(c.id)?.amount ?? null }));
    const seen = new Set(data.categories.map((c) => c.id));
    for (const b of budgets) {
      if (seen.has(b.categoryId)) continue;
      merged.push({
        id: b.categoryId, name: b.categoryName, group: b.categoryGroup ?? "", amount: 0, share: 0,
        average: null, change: null, budget: b.amount, trend: data.windowMonths.map(() => 0),
      });
    }
    return merged;
  }, [data, budgets, budgetsKnown, isIncome]);

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
  const addHref = `/budgets/new?${formQuery}`;
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
  const deletingBudget = budgets.find((b) => b.id === deleteId) ?? null;

  async function handleDelete() {
    if (deleteId == null) return;
    const row = budgets.find((b) => b.id === deleteId);
    setDeleting(true);
    try {
      // A budget queued on this device and not yet synced: drop the queued create, nothing goes to the server.
      if (row?.pendingSync?.kind === "create") {
        const dropped = await discardQueuedCreate(row.pendingSync.opId);
        if (!dropped) {
          setActionError("Being sent now. Try again.");
          return;
        }
        setActionError("");
        setDeleteId(null);
        return;
      }
      try {
        await fetch(`/api/budgets?id=${deleteId}`, { method: "DELETE" });
      } catch (netErr) {
        // The baseline is the server row, not the overlay (a queued edit would otherwise look like a server change).
        const serverRow = serverBudgets.find((b) => b.id === deleteId) ?? row;
        if (serverRow && isLocalWriteQueueActive() && isNetworkFailure(netErr)) {
          const queued = await queueOfflineBudgetDelete(serverRowOf(serverRow));
          if (queued) {
            setDeleteId(null);
            return;
          }
        }
        throw netErr;
      }
      setDeleteId(null);
      reloadAll();
    } finally {
      setDeleting(false);
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
    ...(budgets.length >= 2 ? [{ label: "Move money", icon: ArrowRightLeft, href: `/budgets/move-money?${formQuery}` }] : []),
  ];

  // ---- rows ---------------------------------------------------------------------------------------------------------
  const iconBtn = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  /** Set / edit / delete the budget of ONE category (not offered on a group: its budget is the rollup). */
  function budgetActions(c: OverviewCategory) {
    if (isIncome) return null;
    const b = budgets.find((x) => x.categoryId === c.id);
    const name = subLabel(c.name, c.group);
    const editHref = `/budgets/new?${formQuery}&categoryId=${c.id}`;
    return (
      <span className="flex shrink-0 items-center pr-2">
        {b ? (
          <>
            <Link href={editHref} className={iconBtn} aria-label={`Edit budget: ${name}`}><Pencil className="h-4 w-4" /></Link>
            <button type="button" className={iconBtn} aria-label={`Delete budget: ${name}`} onClick={() => setDeleteId(b.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <Link href={editHref} className={iconBtn} aria-label={`Set budget: ${name}`}><Plus className="h-4 w-4" /></Link>
        )}
      </span>
    );
  }

  /** The shared row for one OverviewRow (group = rollup of its children) or a single category. */
  const rowFor = (r: { label: string; amount: number; trend: number[] | null; share: number; budget: number | null; count?: number; badge?: ReactNode; dot: string }) => (
    <CategoryRow
      label={r.label}
      dot={r.dot}
      amount={r.amount}
      prev={prevOf(r.trend)}
      budget={r.budget}
      trend={r.trend}
      share={r.share}
      cur={cur}
      isIncome={isIncome}
      sparkLabels={sparkLabels}
      count={r.count}
      badge={r.badge}
    />
  );

  const categoryRow = (c: OverviewCategory, group: string, dot: string) =>
    rowFor({
      label: subLabel(c.name, group), amount: c.amount, trend: c.trend, share: c.share, budget: c.budget, dot,
      badge: marks.get(c.id)?.pendingSync ? <SyncBadge mark={marks.get(c.id)!.pendingSync!} /> : undefined,
    });

  const groupRow = (row: OverviewRow) =>
    rowFor({ label: row.label, amount: row.amount, trend: row.trend, share: row.share, budget: row.budget, count: row.categories.length, dot: colorOf(row.key) });

  const ROW_LINK = "block min-w-0 flex-1 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
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
      {!isIncome && (
        <div className="flex items-center gap-2">
          <Button variant="outline" aria-label="Add budget" render={<Link href={addHref} />}>
            <Plus className="mr-1 h-4 w-4" /> Budget
          </Button>
          <OverflowMenu items={overflow} />
        </div>
      )}
    </div>
  );

  // The cards, keyed by their CATEGORY_CARDS id; rendered in the user's saved order (see below).
  const cardNodes: Record<string, ReactNode> = {
    metrics: isIncome ? null : (
      <div className="space-y-3">
        <MetricRangeSelect value={selection} onChange={setSelection} />
        <MetricGrid metrics={metrics} columns={3} />
      </div>
    ),
    summary: (
      <SectionCard label={isIncome ? "Income" : "Spent"}>
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
        padded={false}
        className={`divide-y divide-border/50 px-1 [&>*]:min-w-0 ${CARD_ROW_GRID}`}
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
                    <ul className="divide-y divide-border/50">
                      {row.categories.map((c) => (
                        <li key={c.id} className="flex items-center">
                          <Link href={`/categories/${c.id}`} className={`${ROW_LINK} pl-8`}>
                            {categoryRow(c, row.group, colorOf(row.key))}
                          </Link>
                          {budgetActions(c)}
                        </li>
                      ))}
                    </ul>
                  </AccordionItem>
                </Accordion>
              </div>
            ) : (
              <div key={row.key} data-slot="category-single" className="flex items-center">
                <Link href={`/categories/${row.categories[0].id}`} className={ROW_LINK}>
                  {categoryRow(row.categories[0], "", colorOf(row.key))}
                </Link>
                {budgetActions(row.categories[0])}
              </div>
            ),
          )
        )}
      </SectionCard>
    ),
  };

  return (
    <div className="space-y-6">
      {!embedded && <PageHeader title="Categories" />}
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

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete budget"
        description={<>Delete the budget for <strong>{deletingBudget?.categoryName ?? "this category"}</strong>?</>}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
      />

      {data.partial && (
        <p className="text-xs text-muted-foreground">
          {getMonthLabel(month)} to date · {cur}
        </p>
      )}
    </div>
  );
}
