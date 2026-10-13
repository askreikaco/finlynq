"use client";

import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { OnboardingTips } from "@/components/onboarding-tips";
import { formatCurrency, getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { parseSaveError } from "@/lib/save-error";
import { useDisplayCurrency } from "@/components/currency-provider";
import {
  Plus, ChevronLeft, ChevronRight, Trash2, AlertTriangle, Copy,
  Save, FileDown, ArrowRightLeft, Pencil, Receipt, Wallet, LayoutGrid, PiggyBank, Hourglass, Scale,
} from "lucide-react";
import {
  Amount, ChartMetricGrid, CustomizeCardsSheet, DetailSheet, ListRow, PHONE_PRIMARY_CLASS, SectionCard,
  useCardLayout, usePageCustomize, type ChartMetric, type DetailItem, type OverflowAction,
} from "@/components/mobile";
import { MetricRangeSelect } from "@/components/metric-range-select";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { compareCaption, seriesWindow, type MonthPoint } from "@/lib/metrics/period";
import { resolveCard } from "@/lib/metrics/delta";
import { SectionPage } from "@/components/templates/section-page";
import { cn } from "@/lib/utils";
import type { PageCard } from "@/lib/card-layout";
import { type Budget, type SpendingRow, type BudgetTemplate, type AgeOfMoney, type BudgetMode, parseMonthParam } from "./_components/budget-types";
import { applyPendingBudgets, type BudgetSyncMark } from "@/lib/budgets/pending-overlay";
import { discardQueuedCreate, isLocalWriteQueueActive, queueOfflineBudgetDelete, usePendingBudgets } from "@/lib/data/local-write-queue";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";

/** Cards of the budgets page, default order (Customize). */
const BUDGET_CARDS: readonly PageCard[] = [
  { id: "summary", title: "Summary" },
  { id: "budgets", title: "Budgets by category" },
];

/** "Waiting to sync" / "Sync failed" badge on a budget row queued on this device. */
function SyncBadge({ mark }: { mark: BudgetSyncMark }) {
  if (mark.status === "failed") {
    return (
      <Link
        href="/settings/data"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive hover:underline"
        title={mark.failReason ?? "Sync failed"}
      >
        Sync failed
      </Link>
    );
  }
  return (
    <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title="Saved on this device; it syncs when you are online">
      Waiting to sync
    </span>
  );
}

function BudgetsPageContent() {
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
  const searchParams = useSearchParams();
  // Month and mode come from the URL so returning from a form page lands on the same view.
  const [month, setMonth] = useState(() => parseMonthParam(searchParams.get("month"), getCurrentMonth()));
  const [mode, setMode] = useState<BudgetMode>(() => (searchParams.get("mode") === "envelope" ? "envelope" : "traditional"));
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [actionError, setActionError] = useState("");
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Reads are cache-first when the local read cache is on (Settings > Data > Offline mode); plain fetches otherwise.
  const budgetsRes = useCacheFirstJson<Budget[]>(
    currencyLoading ? null : `/api/budgets?month=${month}&rollover=1&currency=${encodeURIComponent(displayCurrency)}`,
    { keepPrevious: true },
  );
  const serverBudgets = useMemo(() => (Array.isArray(budgetsRes.data) ? budgetsRes.data : []), [budgetsRes.data]);
  const loading = budgetsRes.loading;
  const loadError = budgetsRes.error;
  // Offline queue (local-first L3, flag off = no change): queued budget changes over the server rows. A queued change
  // leaving the outbox (synced) reloads the list.
  const pendingBudgets = usePendingBudgets(() => budgetsRes.reload());
  const budgets = useMemo(() => applyPendingBudgets(serverBudgets, pendingBudgets, month), [serverBudgets, pendingBudgets, month]);

  const startDate = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const endDate = `${month}-${new Date(y, m, 0).getDate()}`;
  const monthRes = useCacheFirstJson<{
    spendingByCategory?: SpendingRow[];
    incomeVsExpenses?: { type: string; total: number }[];
  }>(currencyLoading ? null : `/api/dashboard?startDate=${startDate}&endDate=${endDate}&currency=${encodeURIComponent(displayCurrency)}`, {
    keepPrevious: true,
  });
  const spending = useMemo(
    () => (Array.isArray(monthRes.data?.spendingByCategory) ? (monthRes.data!.spendingByCategory as SpendingRow[]) : []),
    [monthRes.data],
  );
  // Envelope mode: total income for the month
  const envelopeIncome = useMemo(
    () => (monthRes.data?.incomeVsExpenses ?? []).filter((row) => row.type === "I").reduce((sum, row) => sum + row.total, 0),
    [monthRes.data],
  );

  const templatesRes = useCacheFirstJson<BudgetTemplate[]>("/api/budget-templates");
  const templates = useMemo(() => (Array.isArray(templatesRes.data) ? templatesRes.data : []), [templatesRes.data]);

  const ageRes = useCacheFirstJson<AgeOfMoney & { error?: unknown }>("/api/age-of-money");
  const ageOfMoney: AgeOfMoney | null = ageRes.data && !ageRes.data.error ? ageRes.data : null;

  // Metric cards: the period defaults to the selected month vs the previous month (?range=&from=&to= overrides);
  // totals per month come from /api/budgets/series (budgets + the same transactions the page spends from).
  const { selection, explicit, period, setSelection } = useMetricRange(month);
  const win = seriesWindow(period);
  const seriesRes = useCacheFirstJson<{ series: Array<{ month: string; budget: number; spent: number }> }>(
    currencyLoading ? null : `/api/budgets/series?from=${win.from}&to=${win.to}&currency=${encodeURIComponent(displayCurrency)}`,
    { keepPrevious: true },
  );
  const seriesRows = useMemo(
    () => (seriesRes.data && !Array.isArray(seriesRes.data) && Array.isArray(seriesRes.data.series) ? seriesRes.data.series : []),
    [seriesRes.data],
  );

  const budgetsReload = budgetsRes.reload;
  const monthReload = monthRes.reload;
  const loadData = useCallback(() => {
    budgetsReload();
    monthReload();
  }, [budgetsReload, monthReload]);

  // Customize: the summary tiles and the category list are the page's cards (hidden cards are not rendered).
  const cardLayout = useCardLayout("budgets", BUDGET_CARDS);
  usePageCustomize(!loading && !loadError ? { onOpen: () => setCustomizeOpen(true) } : null);

  // Keep the address bar in step with month/mode so a reload or browser back returns to this view.
  function syncUrl(nextMonth: string, nextMode: BudgetMode) {
    try {
      window.history.replaceState(null, "", listUrlFor(nextMonth, nextMode));
    } catch {
      /* URL sync is a convenience; the page works without it. */
    }
  }

  async function handleDelete() {
    if (deleteId == null) return;
    const row = budgets.find((b) => b.id === deleteId);
    setDeleting(true);
    try {
      // A budget queued on this device and not yet synced: drop the queued create, nothing goes to the server.
      if (row?.pendingSync?.kind === "create") {
        const dropped = await discardQueuedCreate(row.pendingSync.opId);
        if (!dropped) {
          setActionError("This budget is being sent right now. Try again in a moment.");
          return;
        }
        setActionError("");
        setDeleteId(null);
        return;
      }
      try {
        await fetch(`/api/budgets?id=${deleteId}`, { method: "DELETE" });
      } catch (netErr) {
        // Flag off / not eligible / online: nothing is queued and the error path is unchanged.
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
      loadData();
    } finally {
      setDeleting(false);
    }
  }

  // Copy the previous month's budget rows into the currently-selected month.
  // Reuses the upserting POST /api/budgets (no API change) — posts each prior
  // row's native amount + currency so values clone exactly.
  async function handleCopyFromPrevMonth() {
    setCopyError("");
    setCopying(true);
    try {
      const prev = prevMonthOf(month);
      const res = await fetch(`/api/budgets?month=${prev}`);
      if (!res.ok) {
        setCopyError(await parseSaveError(res, "Couldn't load last month's budgets"));
        return;
      }
      const prevRows = await res.json();
      if (!Array.isArray(prevRows) || prevRows.length === 0) {
        setCopyError("No budgets in the previous month to copy.");
        return;
      }
      for (const b of prevRows as Array<{ categoryId: number; amount: number; currency?: string }>) {
        const post = await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: b.categoryId,
            month,
            amount: b.amount,
            ...(b.currency ? { currency: b.currency } : {}),
          }),
        });
        if (!post.ok) {
          setCopyError(await parseSaveError(post, "Failed to copy budgets"));
          return;
        }
      }
      loadData();
    } catch {
      setCopyError("Network error. Please try again.");
    } finally {
      setCopying(false);
    }
  }

  const deletingBudget = budgets.find((b) => b.id === deleteId) ?? null;
  const detailBudget = budgets.find((b) => b.id === detailId) ?? null;
  /** Server row of a budget (no overlay fields) as the queue's baseline. */
  function serverRowOf(b: Budget) {
    return { id: b.id, categoryId: b.categoryId, month: b.month, amount: b.amount, currency: b.currency ?? null, updatedAt: b.updatedAt ?? null, categoryName: b.categoryName, categoryGroup: b.categoryGroup };
  }

  function changeMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(next);
    syncUrl(next, mode);
  }

  function changeMode(next: BudgetMode) {
    setMode(next);
    syncUrl(month, next);
  }

  const spendingMap = new Map(spending.map((s) => [s.categoryId, Math.abs(s.total)]));

  // FINLYNQ-130 — drill-through: the budget [startDate, endDate] for the
  // currently-selected month (mirrors the /api/dashboard fetch range above).
  // Each category "spent" amount links into /transactions scoped to that
  // category + month.
  const budgetMonthStart = `${month}-01`;
  const [budgetMonthY, budgetMonthM] = month.split("-").map(Number);
  const budgetMonthEnd = `${month}-${String(new Date(budgetMonthY, budgetMonthM, 0).getDate()).padStart(2, "0")}`;

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + (spendingMap.get(b.categoryId) ?? 0), 0);
  const totalRemaining = totalBudget - totalSpent;
  const totalRollover = budgets.reduce((s, b) => s + (b.rolloverAmount ?? 0), 0);

  // Envelope mode: available to budget = income - total budgeted
  const availableToBudget = envelopeIncome - totalBudget;

  // Group budgets by category group
  const groupMap = new Map<string, Budget[]>();
  budgets.forEach((b) => {
    const group = b.categoryGroup || "Other";
    groupMap.set(group, [...(groupMap.get(group) ?? []), b]);
  });

  // Unique template names
  const templateNames = [...new Set(templates.map((t) => t.name))];

  // Form pages return here: the list URL (month + mode) is passed as returnTo.
  const listUrl = listUrlFor(month, mode);
  const formQuery = `month=${month}&returnTo=${encodeURIComponent(listUrl)}`;

  function progressColorClass(spent: number, budgetAmt: number) {
    if (budgetAmt <= 0) return "";
    const ratio = spent / budgetAmt;
    if (ratio > 1) return "[&_[data-slot=progress-indicator]]:bg-destructive";
    if (ratio >= 0.75) return "[&_[data-slot=progress-indicator]]:bg-warning";
    return "[&_[data-slot=progress-indicator]]:bg-primary";
  }

  // One budget row's numbers, shared by the row and its detail sheet.
  function budgetRowValues(b: Budget) {
    const spent = spendingMap.get(b.categoryId) ?? 0;
    const rollover = b.rolloverAmount ?? 0;
    const effectiveBudget = mode === "traditional" && rollover > 0
      ? b.amount - rollover
      : b.amount;
    const rawPct = effectiveBudget > 0 ? (spent / effectiveBudget) * 100 : 0;
    return {
      spent,
      rollover,
      effectiveBudget,
      rawPct,
      pct: Math.min(rawPct, 100),
      over: spent > effectiveBudget,
      // Envelope mode: available = budget - spent. Same as effectiveBudget - spent in envelope mode.
      envelopeAvailable: b.amount - spent,
      remaining: effectiveBudget - spent,
    };
  }

  const formHref = `/budgets/new?${formQuery}`;
  const drillHref = (b: Budget) => buildTxDrillUrl({ categoryId: String(b.categoryId), startDate: budgetMonthStart, endDate: budgetMonthEnd });

  // Row detail: every number the row leaves out, plus the actions (edit, drill-through, delete).
  function detailItems(b: Budget): DetailItem[] {
    const v = budgetRowValues(b);
    const items: DetailItem[] = [
      { label: "Group", value: b.categoryGroup || "Other" },
      { label: mode === "envelope" ? "Envelope" : "Budgeted", value: formatCurrency(v.effectiveBudget, displayCurrency) },
      { label: "Spent", value: formatCurrency(v.spent, displayCurrency) },
      { label: mode === "envelope" ? "Left" : "Remaining", value: formatCurrency(mode === "envelope" ? v.envelopeAvailable : v.remaining, displayCurrency) },
      { label: "Used", value: `${Math.round(v.rawPct)}%` },
    ];
    if (v.rollover > 0) items.push({ label: "Rolled over", value: formatCurrency(v.rollover, displayCurrency) });
    return items;
  }

  const emptyBudgets = (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-14 text-center">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <Wallet className="h-7 w-7 text-primary" />
        </div>
        <p className="text-base font-semibold mb-1">No budgets for {getMonthLabel(month)}</p>
        <p className="text-sm text-muted-foreground max-w-xs mb-5">
          Set spending limits for your categories and track how you&apos;re doing throughout the month.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button render={<Link href={`/budgets/new?${formQuery}`} />}>
            <Plus className="h-4 w-4 mr-1" />
            Add your first budget
          </Button>
          <Button variant="outline" disabled={copying} onClick={handleCopyFromPrevMonth}>
            <Copy className="h-4 w-4 mr-1" />
            {copying ? "Copying…" : `Copy from ${getMonthLabel(prevMonthOf(month))}`}
          </Button>
        </div>
        {copyError && <p className="text-sm text-destructive mt-3">{copyError}</p>}
      </CardContent>
    </Card>
  );

  // Category list: one inset SectionCard per category group, one ListRow per budget (every width).
  const budgetGroups = (
    <div className="space-y-6">
      {Array.from(groupMap.entries()).map(([group, items]) => (
        <SectionCard key={group} label={group} padded={false} className="divide-y divide-border/50 px-3">
          {items.map((b) => {
            const { spent, rollover, effectiveBudget, rawPct, over, envelopeAvailable, remaining } = budgetRowValues(b);
            const left = mode === "envelope" ? envelopeAvailable : remaining;
            return (
              <ListRow
                key={b.id}
                title={
                  <span className="inline-flex max-w-full items-center gap-2 align-middle">
                    <span className="truncate">{b.categoryName}</span>
                    {b.pendingSync && <SyncBadge mark={b.pendingSync} />}
                  </span>
                }
                subtitle={`${formatCurrency(spent, displayCurrency)} of ${formatCurrency(effectiveBudget, displayCurrency)}${rollover > 0 ? ` · ${formatCurrency(rollover, displayCurrency)} rolled over` : ""}`}
                value={<Amount value={left} currency={displayCurrency} size="md" tone="auto" />}
                secondary={`${mode === "envelope" ? "left · " : ""}${Math.round(rawPct)}%`}
                secondaryTone={over ? "neg" : "muted"}
                onPress={() => setDetailId(b.id)}
                aria-label={`${b.categoryName}: ${Math.round(rawPct)}% used`}
              />
            );
          })}
        </SectionCard>
      ))}
    </div>
  );

  // Summary cards: the shared MetricCard in the shared metric grid (2 / 3 / 4 columns by width).
  const caption = compareCaption(selection);
  const pointsOf = (pick: (r: { budget: number; spent: number }) => number): MonthPoint[] =>
    seriesRows.map((r) => ({ month: r.month, value: pick(r) }));
  const common = { period, isDefault: !explicit, currency: displayCurrency, caption, kind: "money" } as const;
  const budgetCard = resolveCard({ ...common, points: pointsOf((r) => r.budget), mode: "sum", pageValue: totalBudget });
  const spentCard = resolveCard({ ...common, points: pointsOf((r) => r.spent), mode: "sum", pageValue: totalSpent });
  const leftCard = resolveCard({ ...common, points: pointsOf((r) => r.budget - r.spent), mode: "sum", pageValue: totalRemaining });
  const summaryMetrics: ChartMetric[] = [
    {
      id: "total-budget", label: "Total Budget", icon: Wallet, tone: "indigo", value: budgetCard.value ?? totalBudget, currency: displayCurrency,
      sub: budgetCard.delta ?? undefined, note: totalRollover > 0 ? `${formatCurrency(totalRollover, displayCurrency)} rolled over` : undefined,
      badgePct: budgetCard.badgePct, sparkData: budgetCard.sparkData, sparkLabels: budgetCard.sparkLabels, sparkColor: "#6366f1",
    },
    {
      id: "total-spent", label: "Total Spent", icon: Receipt, tone: "rose", value: spentCard.value ?? totalSpent, currency: displayCurrency,
      valueClassName: totalSpent > totalBudget ? "text-destructive" : "text-pos",
      sub: spentCard.delta ?? undefined, badgePct: spentCard.badgePct, invertTone: true,
      sparkData: spentCard.sparkData, sparkLabels: spentCard.sparkLabels, sparkColor: "#f43f5e",
    },
    {
      id: "remaining", label: "Remaining", icon: PiggyBank, tone: "emerald", value: leftCard.value ?? totalRemaining, currency: displayCurrency,
      valueClassName: totalRemaining >= 0 ? "text-pos" : "text-destructive",
      sub: leftCard.delta ?? undefined, badgePct: leftCard.badgePct,
      sparkData: leftCard.sparkData, sparkLabels: leftCard.sparkLabels, sparkColor: "#10b981",
    },
  ];
  // Available to Budget and Age of Money have no monthly series (the income-minus-budget figure and the age are
  // current-state numbers): value only, no fake delta or chart.
  if (mode === "envelope") {
    summaryMetrics.push({
      id: "available-to-budget", label: "Available to Budget", icon: Scale, tone: "cyan", value: availableToBudget, currency: displayCurrency,
      valueClassName: availableToBudget >= 0 ? "text-pos" : "text-destructive",
      sub: availableToBudget < 0 ? "Over-budgeted! Reduce or move funds." : undefined,
    });
  } else if (ageOfMoney) {
    summaryMetrics.push({
      id: "age-of-money", label: "Age of Money", icon: Hourglass, tone: "violet", value: <span>{`${ageOfMoney.ageInDays} days`}</span>,
      sub: ageOfMoney.trend !== 0 ? `${ageOfMoney.trend > 0 ? "+" : ""}${ageOfMoney.trend}d vs previous period` : undefined,
    });
  }

  const summaryNode = (
    <div className="space-y-3">
      <ChartMetricGrid metrics={summaryMetrics} />
      {/* Envelope mode: zero-sum warning */}
      {mode === "envelope" && availableToBudget < 0 && budgets.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            You&apos;ve budgeted <strong>{formatCurrency(Math.abs(availableToBudget), displayCurrency)}</strong> more than your income.
            Move money between envelopes or reduce budget amounts to reach zero.
          </span>
        </div>
      )}
    </div>
  );

  const overflow: OverflowAction[] = [
    mode === "traditional"
      ? { label: "Switch to Envelope mode", icon: Wallet, onSelect: () => changeMode("envelope") }
      : { label: "Switch to Traditional mode", icon: LayoutGrid, onSelect: () => changeMode("traditional") },
    ...(budgets.length > 0 ? [{ label: "Save Template", icon: Save, href: `/budgets/templates/new?${formQuery}` }] : []),
    ...(templateNames.length > 0 ? [{ label: "Apply Template", icon: FileDown, href: `/budgets/templates/apply?${formQuery}` }] : []),
    ...(mode === "envelope" && budgets.length >= 2 ? [{ label: "Move Money", icon: ArrowRightLeft, href: `/budgets/move-money?${formQuery}` }] : []),
  ];

  const shell = (body: ReactNode) => (
    <SectionPage
      id="budgets"
      title="Budgets"
      subtitle="Set spending limits and track how you're doing each month."
      width="report"
      center
      header={{
        overflow,
        actions: (
          <Button className={PHONE_PRIMARY_CLASS} aria-label="Add Budget" render={<Link href={formHref} />}>
            <Plus className="h-4 w-4 mr-1" /> Add Budget
          </Button>
        ),
      }}
    >
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      <OnboardingTips page="budgets" />
      {body}
      <CustomizeCardsSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        title="Customize budgets"
        description="Show, hide and reorder the cards on your budgets page."
        cards={BUDGET_CARDS}
        layout={cardLayout.layout}
        onSave={cardLayout.save}
        onReset={cardLayout.reset}
      />
    </SectionPage>
  );

  if (loading) return shell(<PageSkeleton variant="list" rows={5} />);
  if (loadError) return shell(<ErrorState title="Couldn't load budgets" message="We couldn't load your budgets. Please try again." onRetry={loadData} />);

  const shown = cardLayout.layout.order.filter((id) => !cardLayout.layout.hidden.includes(id));
  const nodes: Record<string, ReactNode> = { summary: summaryNode, budgets: budgetGroups };

  return shell(
    <>
      <MetricRangeSelect value={selection} onChange={setSelection} />
      {/* Toolbar: month nav and the Traditional / Envelope mode, at every width */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-2 py-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => changeMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold min-w-28 text-center">{getMonthLabel(month)}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => changeMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div role="group" aria-label="Budget mode" className="inline-flex items-center rounded-lg border bg-background p-0.5">
          <button
            type="button"
            aria-pressed={mode === "traditional"}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 flex items-center gap-1.5",
              mode === "traditional" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => changeMode("traditional")}
            title="Monthly budget limits per category"
          >
            <LayoutGrid className="h-3 w-3" />
            Traditional
          </button>
          <button
            type="button"
            aria-pressed={mode === "envelope"}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 flex items-center gap-1.5",
              mode === "envelope" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => changeMode("envelope")}
            title="Zero-based envelope budgeting"
          >
            <Wallet className="h-3 w-3" />
            Envelope
          </button>
        </div>
      </div>

      {budgets.length === 0 ? (
        <>
          {summaryNode}
          {emptyBudgets}
        </>
      ) : (
        shown.map((id) => <div key={id}>{nodes[id]}</div>)
      )}

      <DetailSheet
        open={detailBudget !== null}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        title={detailBudget?.categoryName ?? "Budget"}
        description={detailBudget ? `${getMonthLabel(month)} · ${detailBudget.categoryGroup || "Other"}` : undefined}
        items={detailBudget ? detailItems(detailBudget) : []}
      >
        {detailBudget && (() => {
          const v = budgetRowValues(detailBudget);
          return (
            <>
              <Progress value={v.pct} className={`h-2.5 ${progressColorClass(v.spent, v.effectiveBudget)}`} />
              <Button variant="outline" render={<Link href={drillHref(detailBudget)} />}>
                <Receipt className="h-4 w-4 mr-1" /> View transactions
              </Button>
              <Button variant="outline" render={<Link href={formHref} />}>
                <Pencil className="h-4 w-4 mr-1" /> Edit budget
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                aria-label={`Delete budget for ${detailBudget.categoryName}`}
                onClick={() => { setDetailId(null); setDeleteId(detailBudget.id); }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </>
          );
        })()}
      </DetailSheet>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete budget"
        description={<>Are you sure you want to delete the budget for <strong>{deletingBudget?.categoryName ?? "this category"}</strong>? This cannot be undone.</>}
        confirmLabel="Delete budget"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>,
  );
}

/** The budgets list URL for a month + mode (traditional is the default, so it is omitted). */
function listUrlFor(month: string, mode: BudgetMode): string {
  return `/budgets?month=${month}${mode === "envelope" ? "&mode=envelope" : ""}`;
}

/** Previous calendar month as YYYY-MM. */
function prevMonthOf(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(y, mm - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" rows={5} />}>
      <BudgetsPageContent />
    </Suspense>
  );
}
