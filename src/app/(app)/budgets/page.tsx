"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { OnboardingTips } from "@/components/onboarding-tips";
import { formatCurrency, getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { parseSaveError } from "@/lib/save-error";
import { useDisplayCurrency } from "@/components/currency-provider";
import {
  Plus, ChevronLeft, ChevronRight, Trash2, PiggyBank, TrendingDown,
  Wallet, LayoutGrid, Save, FileDown, ArrowRightLeft, Clock,
  AlertTriangle, ArrowDownRight, Copy,
} from "lucide-react";
import { PageHeader, HEADER_DESKTOP_ONLY, PHONE_PRIMARY_CLASS, type OverflowAction } from "@/components/mobile";
import { DataView, ViewModeToggle } from "@/components/adaptive";
import { cn } from "@/lib/utils";
import { type Budget, type SpendingRow, type BudgetTemplate, type AgeOfMoney, type BudgetMode, parseMonthParam } from "./_components/budget-types";

function BudgetsPageContent() {
  const { displayCurrency } = useDisplayCurrency();
  const searchParams = useSearchParams();
  // Month and mode come from the URL so returning from a form page lands on the same view.
  const [month, setMonth] = useState(() => parseMonthParam(searchParams.get("month"), getCurrentMonth()));
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spending, setSpending] = useState<SpendingRow[]>([]);
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [ageOfMoney, setAgeOfMoney] = useState<AgeOfMoney | null>(null);
  const [mode, setMode] = useState<BudgetMode>(() => (searchParams.get("mode") === "envelope" ? "envelope" : "traditional"));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState("");

  // Envelope mode: track per-category available amounts (income allocated)
  const [envelopeIncome, setEnvelopeIncome] = useState(0);

  const loadData = useCallback(() => {
    setLoadError(false);
    fetch(`/api/budgets?month=${month}&rollover=1&currency=${encodeURIComponent(displayCurrency)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load budgets"))))
      .then((data) => setBudgets(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));

    const startDate = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const endDate = `${month}-${new Date(y, m, 0).getDate()}`;
    fetch(`/api/dashboard?startDate=${startDate}&endDate=${endDate}&currency=${encodeURIComponent(displayCurrency)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSpending(Array.isArray(d.spendingByCategory) ? d.spendingByCategory : []);
        // Calculate total income for the month for envelope mode
        const income = (d.incomeVsExpenses ?? [])
          .filter((row: { type: string; total: number }) => row.type === "I")
          .reduce((s: number, row: { total: number }) => s + row.total, 0);
        setEnvelopeIncome(income);
      })
      .catch(() => {});
  }, [month, displayCurrency]);

  const loadTemplates = useCallback(() => {
    fetch("/api/budget-templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadAgeOfMoney = useCallback(() => {
    fetch("/api/age-of-money")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setAgeOfMoney(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadTemplates();
    loadAgeOfMoney();
  }, [loadTemplates, loadAgeOfMoney]);

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
    setDeleting(true);
    try {
      await fetch(`/api/budgets?id=${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      loadData();
    } finally {
      setDeleting(false);
    }
  }

  // Copy the previous month's budget rows into the currently-selected month.
  // Reuses the upserting POST /api/budgets (no API change) — posts each prior
  // row's native amount + currency so values clone exactly.
  function prevMonthOf(m: string): string {
    const [y, mm] = m.split("-").map(Number);
    const d = new Date(y, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

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

  // One budget row's numbers. Shared by the Cards and List views so both show the same figures.
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

  if (loading) return <PageSkeleton variant="list" rows={5} />;
  if (loadError) return <ErrorState title="Couldn't load budgets" message="We couldn't load your budgets. Please try again." onRetry={() => { setLoading(true); loadData(); }} />;

  const overflow: OverflowAction[] = [
    mode === "traditional"
      ? { label: "Switch to Envelope mode", icon: Wallet, onSelect: () => changeMode("envelope") }
      : { label: "Switch to Traditional mode", icon: LayoutGrid, onSelect: () => changeMode("traditional") },
    ...(budgets.length > 0 ? [{ label: "Save Template", icon: Save, href: `/budgets/templates/new?${formQuery}` }] : []),
    ...(templateNames.length > 0 ? [{ label: "Apply Template", icon: FileDown, href: `/budgets/templates/apply?${formQuery}` }] : []),
    ...(mode === "envelope" && budgets.length >= 2 ? [{ label: "Move Money", icon: ArrowRightLeft, href: `/budgets/move-money?${formQuery}` }] : []),
  ];

  const emptyBudgets = (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-14 text-center">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <LayoutGrid className="h-7 w-7 text-primary" />
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

  // Cards view: one card per category group, one row per budget (the phone layout).
  const budgetCards = (
    <div className="space-y-6">
      {Array.from(groupMap.entries()).map(([group, items]) => (
        <Card key={group} className="gap-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {items.map((b) => {
              const { spent, rollover, effectiveBudget, rawPct, pct, over, envelopeAvailable } = budgetRowValues(b);

              return (
                <div
                  key={b.id}
                  className="rounded-lg px-3 py-3 -mx-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-y-1 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        href={`/categories/${b.categoryId}`}
                        className="text-sm font-medium truncate hover:underline"
                        title={b.categoryName ? `${b.categoryName}: trends, average, top payees` : "Category view"}
                      >
                        {b.categoryName}
                      </Link>
                      <span className={`shrink-0 text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full ${
                        over
                          ? "bg-destructive/10 text-destructive"
                          : rawPct >= 75
                            ? "bg-warning/10 text-warning"
                            : "bg-primary/10 text-primary"
                      }`}>
                        {Math.round(rawPct)}%
                      </span>
                      {rollover > 0 && (
                        <span
                          className="text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full bg-warning/10 text-warning flex items-center gap-0.5"
                          title={`${formatCurrency(rollover, displayCurrency)} rolled over from last month`}
                        >
                          <Clock className="h-3 w-3" />
                          {formatCurrency(rollover, displayCurrency)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {mode === "envelope" ? (
                        <Link
                          href={buildTxDrillUrl({ categoryId: String(b.categoryId), startDate: budgetMonthStart, endDate: budgetMonthEnd })}
                          className={`text-sm font-mono tabular-nums hover:underline ${envelopeAvailable < 0 ? "text-destructive" : ""}`}
                          title={b.categoryName ? `View ${b.categoryName} transactions for ${getMonthLabel(month)}` : `View transactions for ${getMonthLabel(month)}`}
                        >
                          {formatCurrency(envelopeAvailable, displayCurrency)} left
                        </Link>
                      ) : (
                        <Link
                          href={buildTxDrillUrl({ categoryId: String(b.categoryId), startDate: budgetMonthStart, endDate: budgetMonthEnd })}
                          className={`text-sm font-mono tabular-nums hover:underline ${over ? "text-destructive" : ""}`}
                          title={b.categoryName ? `View ${b.categoryName} transactions for ${getMonthLabel(month)}` : `View transactions for ${getMonthLabel(month)}`}
                        >
                          {formatCurrency(spent, displayCurrency)} / {formatCurrency(effectiveBudget, displayCurrency)}
                        </Link>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" aria-label={`Delete budget for ${b.categoryName}`} onClick={() => setDeleteId(b.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Progress
                    value={pct}
                    className={`[&_[data-slot=progress-track]]:h-2.5 ${progressColorClass(spent, effectiveBudget)}`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // List view: one table, a group header row per category group, one row per budget.
  // The row opens the set-budget form for this month. The form does not preselect a category yet.
  const budgetList = (
    <Table containerClassName="rounded-xl border bg-card">
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Budgeted</TableHead>
          <TableHead className="text-right">Spent</TableHead>
          <TableHead className="text-right">Remaining</TableHead>
          <TableHead className="w-44">Progress</TableHead>
          <TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from(groupMap.entries()).flatMap(([group, items]) => [
          <TableRow key={`group-${group}`} className="hover:bg-transparent">
            <TableCell colSpan={6} className="pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </TableCell>
          </TableRow>,
          ...items.map((b) => {
            const { spent, effectiveBudget, remaining, rawPct, pct, over } = budgetRowValues(b);
            return (
              <TableRow key={b.id} className="relative">
                <TableCell className="font-medium">
                  <Link href={`/budgets/new?${formQuery}`} className="after:absolute after:inset-0 hover:underline">
                    {b.categoryName}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatCurrency(effectiveBudget, displayCurrency)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${over ? "text-destructive" : ""}`}>{formatCurrency(spent, displayCurrency)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${remaining < 0 ? "text-destructive" : "text-pos"}`}>{formatCurrency(remaining, displayCurrency)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className={`h-2 w-24 ${progressColorClass(spent, effectiveBudget)}`} />
                    <span className="text-xs font-medium tabular-nums">{Math.round(rawPct)}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative z-10 h-7 w-7 text-muted-foreground"
                    aria-label={`Delete budget for ${b.categoryName}`}
                    onClick={() => setDeleteId(b.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          }),
        ])}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        className="flex flex-col gap-3 regular:flex-row regular:items-start regular:justify-between"
        title="Budgets"
        subtitle="Set spending limits and track how you're doing each month."
        actionsClassName="flex flex-wrap items-center gap-2"
        overflow={overflow}
        actions={
        <>
          {/* Mode toggle */}
          <div className={cn(HEADER_DESKTOP_ONLY, "inline-flex items-center rounded-lg border bg-background p-0.5 shadow-sm")}>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 flex items-center gap-1.5 ${
                mode === "traditional"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => changeMode("traditional")}
              title="Monthly budget limits per category"
            >
              <LayoutGrid className="h-3 w-3" />
              <span className="hidden regular:inline">Traditional</span>
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 flex items-center gap-1.5 ${
                mode === "envelope"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => changeMode("envelope")}
              title="Zero-based envelope budgeting"
            >
              <Wallet className="h-3 w-3" />
              <span className="hidden regular:inline">Envelope</span>
            </button>
          </div>

          {/* Template and move-money pages (desktop buttons; phones use the overflow menu) */}
          {budgets.length > 0 && (
            <Link
              href={`/budgets/templates/new?${formQuery}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), HEADER_DESKTOP_ONLY)}
            >
              <Save className="h-4 w-4 mr-1" /> Save Template
            </Link>
          )}

          {templateNames.length > 0 && (
            <Link
              href={`/budgets/templates/apply?${formQuery}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), HEADER_DESKTOP_ONLY)}
            >
              <FileDown className="h-4 w-4 mr-1" /> Apply Template
            </Link>
          )}

          {mode === "envelope" && budgets.length >= 2 && (
            <Link
              href={`/budgets/move-money?${formQuery}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), HEADER_DESKTOP_ONLY)}
            >
              <ArrowRightLeft className="h-4 w-4 mr-1" /> Move Money
            </Link>
          )}

          <Button className={PHONE_PRIMARY_CLASS} aria-label="Add Budget" render={<Link href={`/budgets/new?${formQuery}`} />}>
            <Plus className="h-4 w-4 mr-1" /> Add Budget
          </Button>
        </>
        }
      />

      <OnboardingTips page="budgets" />

      {/* Toolbar: month nav and the Cards / List view switch */}
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
        <ViewModeToggle viewKey="budgets" />
      </div>

      {/* Summary Cards */}
      <div className={`grid grid-cols-2 gap-3 ${mode === "envelope" ? "regular:grid-cols-4" : ageOfMoney ? "regular:grid-cols-4" : "regular:grid-cols-3"}`}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">Total Budget</CardTitle>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <PiggyBank className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="min-w-0 break-words text-xl font-bold tabular-nums regular:text-2xl">{formatCurrency(totalBudget, displayCurrency)}</p>
            {totalRollover > 0 && (
              <p className="text-xs text-warning mt-1 flex items-center gap-1">
                <ArrowDownRight className="h-3 w-3" />
                {formatCurrency(totalRollover, displayCurrency)} rolled over
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">Total Spent</CardTitle>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${totalSpent > totalBudget ? "bg-destructive/10" : "bg-pos/10"}`}>
                <TrendingDown className={`h-5 w-5 ${totalSpent > totalBudget ? "text-destructive" : "text-pos"}`} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className={`min-w-0 break-words text-xl font-bold tabular-nums regular:text-2xl ${totalSpent > totalBudget ? "text-destructive" : "text-pos"}`}>
              {formatCurrency(totalSpent, displayCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">Remaining</CardTitle>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${totalRemaining >= 0 ? "bg-pos/10" : "bg-destructive/10"}`}>
                <Wallet className={`h-5 w-5 ${totalRemaining >= 0 ? "text-pos" : "text-destructive"}`} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className={`min-w-0 break-words text-xl font-bold tabular-nums regular:text-2xl ${totalRemaining >= 0 ? "text-pos" : "text-destructive"}`}>
              {formatCurrency(totalRemaining, displayCurrency)}
            </p>
          </CardContent>
        </Card>

        {/* Age of Money / Available to Budget card */}
        {mode === "envelope" ? (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">Available to Budget</CardTitle>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${availableToBudget >= 0 ? "bg-pos/10" : "bg-destructive/10"}`}>
                  <Wallet className={`h-5 w-5 ${availableToBudget >= 0 ? "text-pos" : "text-destructive"}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className={`min-w-0 break-words text-xl font-bold tabular-nums regular:text-2xl ${availableToBudget >= 0 ? "text-pos" : "text-destructive"}`}>
                {formatCurrency(availableToBudget, displayCurrency)}
              </p>
              {availableToBudget < 0 && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Over-budgeted! Reduce or move funds.
                </p>
              )}
            </CardContent>
          </Card>
        ) : ageOfMoney ? (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">Age of Money</CardTitle>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/10">
                  <Clock className="h-5 w-5 text-chart-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="min-w-0 break-words text-xl font-bold tabular-nums regular:text-2xl">{ageOfMoney.ageInDays} days</p>
              {ageOfMoney.trend !== 0 && (
                <p className={`text-xs mt-1 ${ageOfMoney.trend > 0 ? "text-pos" : "text-destructive"}`}>
                  {ageOfMoney.trend > 0 ? "+" : ""}{ageOfMoney.trend}d vs previous period
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

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

      {/* Budget items: Cards (default on phones) or List (table rows). Only the selected view is mounted. */}
      <DataView
        viewKey="budgets"
        cards={() => (budgets.length === 0 ? emptyBudgets : budgetCards)}
        list={() => (budgets.length === 0 ? emptyBudgets : budgetList)}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete budget"
        description={<>Are you sure you want to delete the budget for <strong>{deletingBudget?.categoryName ?? "this category"}</strong>? This cannot be undone.</>}
        confirmLabel="Delete budget"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
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
