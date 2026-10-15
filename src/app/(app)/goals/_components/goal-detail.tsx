"use client";

/**
 * GoalDetail: THE goal detail content (saved of target, progress bar, fields, mark complete / reactivate).
 * The /goals split view renders it in the pane (one narrow column); /goals/[id] renders it inside DetailPage (the header).
 * Editing and deleting live in the goal form (GoalFormPanel), which the pane header's Edit and /goals/[id]/edit open.
 */
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chart } from "@/components/chart";
import { Notice } from "@/components/notice";
import { formatCurrency } from "@/lib/currency";
import { goalStatus } from "@/lib/status-colour";
import { localDateISO } from "@/lib/utils/date";
import { useDisplayCurrency } from "@/components/currency-provider";
import { DetailList, usePaneTitle, type DetailItem } from "@/components/mobile";
import type { Goal } from "./goal-form";
import { useGoalsLoad } from "./use-goals-load";

export const goalTypeConfig: Record<string, { label: string }> = {
  savings: { label: "Savings" },
  debt_payoff: { label: "Debt Payoff" },
  investment: { label: "Investment" },
  emergency_fund: { label: "Emergency Fund" },
};

export function progressTextClass(progress: number): string {
  if (progress < 33) return "text-destructive";
  if (progress <= 66) return "text-warning";
  return "text-pos";
}

function progressTone(progress: number): "destructive" | "warning" | "pos" {
  return progress < 33 ? "destructive" : progress <= 66 ? "warning" : "pos";
}

/** Mark a goal complete / active again (PUT /api/goals). */
export async function toggleGoalStatus(goal: Pick<Goal, "id" | "status">): Promise<boolean> {
  const res = await fetch("/api/goals", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: goal.id, status: goal.status === "active" ? "completed" : "active" }),
  });
  return res.ok;
}

/** One goal's label/value items: every field a row leaves out (the phone sheet and the detail share them). */
export function goalDetailItems(g: Goal, displayCurrency: string): DetailItem[] {
  const currency = g.currency || displayCurrency;
  const items: DetailItem[] = [
    { label: "Type", value: goalTypeConfig[g.type]?.label ?? "Savings" },
    { label: "Target", value: formatCurrency(g.targetAmount, currency) },
    { label: "Saved", value: formatCurrency(g.currentAmount, currency) },
    { label: "Remaining", value: formatCurrency(g.remaining, currency) },
  ];
  if (g.monthlyNeeded > 0) items.push({ label: "Needed per month", value: formatCurrency(g.monthlyNeeded, currency) });
  items.push({ label: "Deadline", value: g.deadline ?? "—" });
  const accounts = (g.accounts ?? []).filter((n) => n);
  if (accounts.length > 0) items.push({ label: "Accounts", value: accounts.join(", ") });
  if (g.currency && g.currency !== displayCurrency) items.push({ label: "Currency", value: g.currency });
  return items;
}

/** `onChanged` reloads the host list after a status change. */
export function GoalDetail({ id: idProp, onChanged }: { id: string | number; onChanged?: () => void }) {
  const id = Number(idProp);
  const { displayCurrency } = useDisplayCurrency();
  const load = useGoalsLoad();
  const goal = load.record?.find((g) => g.id === id) ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  usePaneTitle(goal?.name);

  if (!goal) {
    return load.status === "loading"
      ? <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-shimmer rounded-xl" />)}</div>
      : <Notice variant="error" title="Goal not found">{"This goal doesn't exist, or it isn't one of yours."}</Notice>;
  }

  const currency = goal.currency || displayCurrency;
  const done = goalStatus(goal, localDateISO()) === "completed";

  async function toggle() {
    if (!goal) return;
    setBusy(true);
    setError("");
    try {
      if (!(await toggleGoalStatus(goal))) throw new Error("failed");
      load.retry();
      onChanged?.();
    } catch {
      setError("Couldn't update the goal. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-4" data-testid="goal-detail-root">
      <div className="flex max-w-full flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">{goalTypeConfig[goal.type]?.label ?? "Savings"}</Badge>
        {done && <Badge variant="secondary" className="text-xs">Completed</Badge>}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Saved</p>
        <p className="text-xl font-semibold tabular-nums">{formatCurrency(goal.currentAmount, currency)}</p>
        <Chart kind="progress" value={goal.progress} tone={done ? "pos" : progressTone(goal.progress)} ariaLabel={`Goal ${goal.name} saved`} />
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>of {formatCurrency(goal.targetAmount, currency)}</span>
          <span className={`font-semibold ${progressTextClass(goal.progress)}`}>{Math.max(0, goal.progress)}%</span>
        </div>
      </div>
      <DetailList items={goalDetailItems(goal, displayCurrency)} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          disabled={busy}
          aria-label={done ? `Reactivate goal ${goal.name}` : `Mark goal ${goal.name} complete`}
          onClick={toggle}
        >
          <CheckCircle2 className="mr-1 h-4 w-4" /> {done ? "Reactivate" : "Mark complete"}
        </Button>
      </div>
    </div>
  );
}
