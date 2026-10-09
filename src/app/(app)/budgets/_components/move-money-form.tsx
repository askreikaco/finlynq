"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { AmountInput } from "@/components/amount-input";
import { formatCurrency } from "@/lib/currency";
import { parseSaveError } from "@/lib/save-error";
import type { Budget, SpendingRow } from "./budget-types";

/** Envelope mode: move funds from one category's budget to another. Rendered by /budgets/move-money. */
export function MoveMoneyForm({
  month,
  displayCurrency,
  onMoved,
}: {
  month: string;
  displayCurrency: string;
  onMoved: () => void;
}) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spending, setSpending] = useState<SpendingRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveError, setMoveError] = useState("");
  const sortCategory = useDropdownOrder("category");

  // Same month data the budgets list loads (budgets + dashboard spending).
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const budgetsReq = fetch(`/api/budgets?month=${month}&rollover=1&currency=${encodeURIComponent(displayCurrency)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setBudgets(Array.isArray(data) ? data : []); })
      .catch(() => {});
    const startDate = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const endDate = `${month}-${new Date(y, m, 0).getDate()}`;
    const dashReq = fetch(`/api/dashboard?startDate=${startDate}&endDate=${endDate}&currency=${encodeURIComponent(displayCurrency)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && Array.isArray(d.spendingByCategory)) setSpending(d.spendingByCategory); })
      .catch(() => {});
    Promise.all([budgetsReq, dashReq]).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [month, displayCurrency]);

  const spendingMap = new Map(spending.map((s) => [s.categoryId, Math.abs(s.total)]));

  async function handleMoveMoney() {
    if (!moveFrom || !moveTo || !moveAmount || moveFrom === moveTo) return;
    const amt = parseFloat(moveAmount);
    if (amt <= 0) return;

    const fromBudget = budgets.find((b) => b.categoryId === Number(moveFrom));
    const toBudget = budgets.find((b) => b.categoryId === Number(moveTo));

    setMoveError("");
    try {
      if (fromBudget) {
        const fromRes = await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: fromBudget.categoryId,
            month,
            amount: Math.max(0, fromBudget.amount - amt),
            currency: fromBudget.currency ?? displayCurrency,
          }),
        });
        if (!fromRes.ok) {
          setMoveError(await parseSaveError(fromRes, "Failed to move funds"));
          return;
        }
      }

      const toRes = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(moveTo),
          month,
          amount: (toBudget?.amount ?? 0) + amt,
          currency: toBudget?.currency ?? displayCurrency,
        }),
      });
      if (!toRes.ok) {
        setMoveError(await parseSaveError(toRes, "Failed to move funds"));
        return;
      }

      setMoveError("");
      onMoved();
    } catch {
      setMoveError("Network error. Please try again.");
    }
  }

  if (loaded && budgets.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Move Money needs at least two budgeted categories for this month. Add a budget first.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void handleMoveMoney();
      }}
    >
      <div>
        <Label>From</Label>
        <Combobox
          value={moveFrom}
          onValueChange={(v) => setMoveFrom(v)}
          items={sortCategory(
            budgets.map((b): ComboboxItemShape => ({
              value: String(b.categoryId),
              label: `${b.categoryName} (${formatCurrency(b.amount - (spendingMap.get(b.categoryId) ?? 0), displayCurrency)} available)`,
            })),
            (b) => Number(b.value),
            (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
          )}
          placeholder="Select category"
          searchPlaceholder="Search categories…"
          emptyMessage="No matches"
          className="w-full"
        />
      </div>
      <div>
        <Label>To</Label>
        <Combobox
          value={moveTo}
          onValueChange={(v) => setMoveTo(v)}
          items={sortCategory(
            budgets
              .filter((b) => String(b.categoryId) !== moveFrom)
              .map((b): ComboboxItemShape => ({ value: String(b.categoryId), label: b.categoryName })),
            (b) => Number(b.value),
            (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
          )}
          placeholder="Select category"
          searchPlaceholder="Search categories…"
          emptyMessage="No matches"
          className="w-full"
        />
      </div>
      <div>
        <Label>Amount</Label>
        <AmountInput
          step="0.01"
          value={moveAmount}
          onValueChange={(nv) => setMoveAmount(nv)}
          placeholder="50.00"
        />
      </div>
      {moveError && <p className="text-sm text-destructive">{moveError}</p>}
      <Button
        type="submit"
        className="w-full"
        disabled={!moveFrom || !moveTo || !moveAmount || moveFrom === moveTo || parseFloat(moveAmount) <= 0}
      >
        Move Funds
      </Button>
    </form>
  );
}
