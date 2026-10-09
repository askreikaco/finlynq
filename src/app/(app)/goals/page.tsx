"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Plus, Trash2, Target, CheckCircle2, TrendingUp, Calendar, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeader, PHONE_PRIMARY_CLASS } from "@/components/mobile";
import { DataView, ViewModeToggle } from "@/components/adaptive";
import type { Goal } from "./_components/goal-form";

const goalTypeConfig: Record<string, { label: string; badgeClass: string; borderClass: string }> = {
  savings: { label: "Savings", badgeClass: "bg-pos/10 text-pos border-pos/30", borderClass: "border-l-pos" },
  debt_payoff: { label: "Debt Payoff", badgeClass: "bg-destructive/10 text-destructive border-destructive/30", borderClass: "border-l-destructive" },
  investment: { label: "Investment", badgeClass: "bg-primary/10 text-primary border-primary/30", borderClass: "border-l-primary" },
  emergency_fund: { label: "Emergency Fund", badgeClass: "bg-warning/10 text-warning border-warning/30", borderClass: "border-l-warning" },
};

function progressColorClass(progress: number): string {
  if (progress < 33) return "[&_[data-slot=progress-indicator]]:bg-destructive";
  if (progress <= 66) return "[&_[data-slot=progress-indicator]]:bg-warning";
  return "[&_[data-slot=progress-indicator]]:bg-pos";
}

function progressTextClass(progress: number): string {
  if (progress < 33) return "text-destructive";
  if (progress <= 66) return "text-warning";
  return "text-pos";
}

/** Prefilled create links for the empty-state chips (name + type go in the query, read by /goals/new). */
const EMPTY_STATE_CHIPS = [
  { label: "Emergency Fund", type: "emergency_fund" },
  { label: "Pay off debt", type: "debt_payoff" },
  { label: "Save for vacation", type: "savings" },
  { label: "Build investments", type: "investment" },
];

export default function GoalsPage() {
  const { displayCurrency } = useDisplayCurrency();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    fetch("/api/goals")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load goals"))))
      .then((data) => setGoals(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(goal: Goal) {
    await fetch("/api/goals", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: goal.id, status: goal.status === "active" ? "completed" : "active" }) });
    load();
  }

  async function handleDelete() {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await fetch(`/api/goals?id=${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  const deletingGoal = goals.find((g) => g.id === deleteId) ?? null;

  const active = goals.filter((g) => g.status === "active");
  const completed = goals.filter((g) => g.status === "completed");
  const totalTarget = active.reduce((s, g) => s + (g.targetAmountDisplay ?? g.targetAmount), 0);
  const totalCurrent = active.reduce((s, g) => s + (g.currentAmountDisplay ?? g.currentAmount), 0);
  const hasForeignGoal = active.some((g) => g.currency && g.currency !== displayCurrency);

  if (loading) return <PageSkeleton variant="cards" rows={3} />;
  if (loadError) return <ErrorState title="Couldn't load goals" message="We couldn't load your goals. Please try again." onRetry={() => { setLoading(true); load(); }} />;

  const emptyGoals = (
    <Card className="border-dashed">
      <CardContent className="py-16 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <Target className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Set your first financial goal</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          Goals help you stay focused and measure real progress. Start with an emergency fund, debt payoff target, or a savings milestone.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {EMPTY_STATE_CHIPS.map(({ label, type }) => (
            <Link
              key={label}
              href={`/goals/new?name=${encodeURIComponent(label)}&type=${type}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/60 bg-muted/40 hover:bg-muted transition-colors"
            >
              <Plus className="h-3 w-3" />{label}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  // Cards view: the goal cards (the phone layout).
  const goalCards = (
    <div className="space-y-6">
      {/* Empty state — no goals at all */}
      {goals.length === 0 && emptyGoals}

      {/* Empty state — has completed goals but no active */}
      {goals.length > 0 && active.length === 0 && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-pos mb-3" />
            <h3 className="text-base font-semibold mb-1">All goals completed!</h3>
            <p className="text-sm text-muted-foreground">Add a new goal to keep building momentum.</p>
          </CardContent>
        </Card>
      )}

      {/* Active goals */}
      {active.map((g) => {
        const config = goalTypeConfig[g.type] ?? goalTypeConfig.savings;
        return (
          <Card key={g.id} className={`border-l-4 ${config.borderClass}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold">{g.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge className={config.badgeClass}>{config.label}</Badge>
                      {g.currency && g.currency !== displayCurrency && (
                        <Badge variant="outline">{g.currency}</Badge>
                      )}
                      {/* Issue #130 — render every linked account as its own chip. */}
                      {(g.accounts ?? []).filter((n) => n).map((name, i) => (
                        <Badge key={`${g.accountIds[i] ?? i}`} variant="secondary">{name}</Badge>
                      ))}
                      {g.deadline && (
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="h-3 w-3" />
                          {g.deadline}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" render={<Link href={`/goals/${g.id}/edit`} />} title="Edit" aria-label={`Edit goal ${g.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(g)} title="Mark complete" aria-label={`Mark goal ${g.name} complete`}>
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(g.id)} title="Delete" aria-label={`Delete goal ${g.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{formatCurrency(g.currentAmount, g.currency || displayCurrency)} of {formatCurrency(g.targetAmount, g.currency || displayCurrency)}</span>
                  <span className={`font-bold ${progressTextClass(g.progress)}`}>{g.progress}%</span>
                </div>
                <Progress value={g.progress} className={`h-3 ${progressColorClass(g.progress)}`} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Remaining: <span className="font-medium text-foreground">{formatCurrency(g.remaining, g.currency || displayCurrency)}</span></span>
                  {g.monthlyNeeded > 0 && (
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/30">
                      {formatCurrency(g.monthlyNeeded, g.currency || displayCurrency)}/mo needed
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Completed goals */}
      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-pos" />
            Completed Goals
          </h2>
          {completed.map((g) => (
            <Card key={g.id} className="border-l-4 border-l-pos/30 bg-pos/10">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-pos shrink-0" />
                  <div>
                    <span className="line-through text-muted-foreground">{g.name}</span>
                    <Badge className="ml-2 bg-pos/10 text-pos border-pos/30">{formatCurrency(g.targetAmount, g.currency || displayCurrency)}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" render={<Link href={`/goals/${g.id}/edit`} />} title="Edit" aria-label={`Edit goal ${g.name}`}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleStatus(g)} title="Reactivate" aria-label={`Reactivate goal ${g.name}`}>
                    <Target className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(g.id)} title="Delete" aria-label={`Delete goal ${g.name}`}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // List view: one table of every goal (active first, then completed). Row opens the edit page.
  const goalList = goals.length === 0 ? emptyGoals : (
    <Table containerClassName="rounded-xl border bg-card">
      <TableHeader>
        <TableRow>
          <TableHead>Goal</TableHead>
          <TableHead className="text-right">Target</TableHead>
          <TableHead className="text-right">Saved</TableHead>
          <TableHead className="w-44">Progress</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...active, ...completed].map((g) => {
          const currency = g.currency || displayCurrency;
          const done = g.status === "completed";
          return (
            <TableRow key={g.id} className="relative">
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Link href={`/goals/${g.id}/edit`} className="after:absolute after:inset-0 hover:underline">
                    {g.name}
                  </Link>
                  {done && <Badge className="bg-pos/10 text-pos border-pos/30">Completed</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatCurrency(g.targetAmount, currency)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatCurrency(g.currentAmount, currency)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={g.progress} className={`h-2 w-24 ${progressColorClass(g.progress)}`} />
                  <span className={`text-xs font-bold tabular-nums ${progressTextClass(g.progress)}`}>{g.progress}%</span>
                </div>
              </TableCell>
              <TableCell className="tabular-nums">{g.deadline ?? "—"}</TableCell>
              <TableCell className="text-right">
                <div className="relative z-10 flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => toggleStatus(g)}
                    title={done ? "Reactivate" : "Mark complete"}
                    aria-label={done ? `Reactivate goal ${g.name}` : `Mark goal ${g.name} complete`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeleteId(g.id)}
                    title="Delete"
                    aria-label={`Delete goal ${g.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        className="flex flex-wrap items-center justify-between gap-3"
        title="Goals"
        subtitle="Track your savings targets and measure progress over time"
        actionsClassName="contents"
        actions={
        <Button className={PHONE_PRIMARY_CLASS} aria-label="Add Goal" render={<Link href="/goals/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Add Goal
        </Button>
        }
      />

      {/* Summary cards — only show when there are goals */}
      {goals.length > 0 && (
        <div className="grid grid-cols-1 regular:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Target</p>
                <p className="text-2xl font-bold">{formatCurrency(totalTarget, displayCurrency)}</p>
                {hasForeignGoal && <p className="text-xs text-muted-foreground mt-1">converted at today&apos;s rates</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pos/10">
                <TrendingUp className="h-5 w-5 text-pos" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Progress</p>
                <p className="text-2xl font-bold text-pos">{formatCurrency(totalCurrent, displayCurrency)}</p>
                {hasForeignGoal && <p className="text-xs text-muted-foreground mt-1">converted at today&apos;s rates</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/10">
                <CheckCircle2 className="h-5 w-5 text-chart-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{completed.length} <span className="text-base font-normal text-muted-foreground">/ {goals.length}</span></p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toolbar: Cards / List view switch */}
      <div className="flex justify-end">
        <ViewModeToggle viewKey="goals" />
      </div>

      {/* Goals: Cards (default on phones) or List (table rows). Only the selected view is mounted. */}
      <DataView viewKey="goals" cards={() => goalCards} list={() => goalList} />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete goal"
        description={<>Are you sure you want to delete <strong>{deletingGoal?.name ?? "this goal"}</strong>? This cannot be undone.</>}
        confirmLabel="Delete goal"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
