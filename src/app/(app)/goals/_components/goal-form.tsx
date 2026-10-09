"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { X } from "lucide-react";
import { parseSaveError } from "@/lib/save-error";
import { AmountInput } from "@/components/amount-input";

export type Goal = {
  id: number; name: string; type: string; targetAmount: number; currentAmount: number;
  currency: string;
  deadline: string | null;
  // Issue #130 — multi-account linking. `accountIds` is the canonical list;
  // `accounts` carries decrypted display names; `accountName` is the legacy
  // first-only string preserved for any consumer that hasn't migrated yet.
  accountIds: number[]; accounts: string[]; accountName: string | null;
  priority: number; status: string;
  progress: number; remaining: number; monthlyNeeded: number; note: string;
  // FINLYNQ-123: current-rate conversions into the display currency. The ONLY
  // figures the summary tiles may sum — per-goal amounts stay in `currency`.
  targetAmountDisplay?: number; currentAmountDisplay?: number;
};
export type Account = { id: number; name: string };

export type GoalFormState = {
  name: string;
  type: string;
  targetAmount: string;
  currency: string;
  deadline: string;
  accountIds: number[]; // issue #130 — multi-account
  priority: string;
  note: string;
};

export const GOAL_TYPES = ["savings", "debt_payoff", "investment", "emergency_fund"] as const;

// value→label maps for base-ui Select triggers (FINLYNQ-197).
const GOAL_TYPE_LABELS: Record<string, string> = {
  savings: "Savings",
  debt_payoff: "Debt Payoff",
  investment: "Investment",
  emergency_fund: "Emergency Fund",
};
const GOAL_PRIORITY_LABELS: Record<string, string> = {
  "1": "High",
  "2": "Medium",
  "3": "Low",
};

export function emptyGoalForm(displayCurrency: string): GoalFormState {
  return {
    name: "",
    type: "savings",
    targetAmount: "",
    currency: displayCurrency,
    deadline: "",
    accountIds: [],
    priority: "1",
    note: "",
  };
}

export function goalToForm(g: Goal, displayCurrency: string): GoalFormState {
  return {
    name: g.name ?? "",
    type: g.type,
    targetAmount: String(g.targetAmount),
    currency: g.currency || displayCurrency,
    deadline: g.deadline ?? "",
    accountIds: g.accountIds ?? [],
    priority: String(g.priority ?? 1),
    note: g.note ?? "",
  };
}

/**
 * <GoalForm> — shared Add/Edit goal form (issue #130), rendered by the
 * /goals/new and /goals/[id]/edit pages. Mode "add" routes to POST /api/goals;
 * "edit" carries the goal id and routes to PUT /api/goals. The form owns its
 * state; the page navigates in `onSaved()` once persistence completes.
 */
export function GoalForm({
  mode,
  goalId,
  initial,
  accounts,
  onSaved,
  onCancel,
  displayCurrency,
}: {
  mode: "add" | "edit";
  goalId?: number;
  initial: GoalFormState;
  accounts: Account[];
  onSaved: () => void;
  onCancel: () => void;
  displayCurrency: string;
}) {
  const [form, setForm] = useState<GoalFormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const sortAccount = useDropdownOrder("account");
  // Built-in fiat UNION the user's active currencies (#291).
  const currencyOptions = useActiveCurrencies(form.currency);

  function validateForm() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.targetAmount || parseFloat(form.targetAmount) <= 0) e.targetAmount = "Target amount must be greater than 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const isFormValid = form.name.trim() !== "" && form.targetAmount !== "" && parseFloat(form.targetAmount) > 0;

  // Account chip selector — pick from the unselected pool, remove via the X
  // on each chip. Single-select Combobox is reused as the picker; the
  // selected ids drive the chip row.
  const selectedSet = new Set(form.accountIds);
  const availableAccounts = accounts.filter((a) => !selectedSet.has(a.id));

  function addAccount(idStr: string) {
    if (!idStr) return;
    const id = parseInt(idStr);
    if (Number.isNaN(id)) return;
    if (selectedSet.has(id)) return;
    setForm({ ...form, accountIds: [...form.accountIds, id] });
  }

  function removeAccount(id: number) {
    setForm({ ...form, accountIds: form.accountIds.filter((x) => x !== id) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        type: form.type,
        targetAmount: parseFloat(form.targetAmount),
        currency: form.currency || displayCurrency,
        deadline: form.deadline || null,
        accountIds: form.accountIds,
        priority: parseInt(form.priority),
        note: form.note,
      };
      let res: Response;
      if (mode === "edit" && goalId != null) {
        payload.id = goalId;
        res = await fetch("/api/goals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        // Keep the page open with input intact; surface the reason.
        setErrors({ ...errors, form: await parseSaveError(res, "Failed to save goal") });
        return;
      }
      setErrors({ ...errors, form: "" });
      onSaved();
    } catch {
      setErrors({ ...errors, form: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label>Goal Name</Label>
        <Input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: "" }); }} placeholder="e.g. Emergency Fund" />
        {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <Select items={GOAL_TYPE_LABELS} value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? "savings" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="savings">Savings</SelectItem>
              <SelectItem value="debt_payoff">Debt Payoff</SelectItem>
              <SelectItem value="investment">Investment</SelectItem>
              <SelectItem value="emergency_fund">Emergency Fund</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v ?? displayCurrency })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {currencyOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Target Amount</Label>
        <AmountInput  step="0.01" value={form.targetAmount} onValueChange={(nv) => { setForm({ ...form, targetAmount: nv }); setErrors({ ...errors, targetAmount: "" }); }} />
        {errors.targetAmount && <p className="text-xs text-destructive mt-1">{errors.targetAmount}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Deadline</Label>
          <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </div>
        <div>
          <Label>Priority</Label>
          <Select items={GOAL_PRIORITY_LABELS} value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v ?? "1" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">High</SelectItem>
              <SelectItem value="2">Medium</SelectItem>
              <SelectItem value="3">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Linked Accounts</Label>
        {form.accountIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.accountIds.map((id) => {
              const a = accounts.find((x) => x.id === id);
              return (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-medium border border-border/60">
                  {a?.name ?? `#${id}`}
                  <button
                    type="button"
                    aria-label={`Remove ${a?.name ?? `#${id}`}`}
                    onClick={() => removeAccount(id)}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <Combobox
          value=""
          onValueChange={(v) => addAccount(v ?? "")}
          items={sortAccount(
            availableAccounts.map((a): ComboboxItemShape => ({ value: String(a.id), label: a.name })),
            (a) => Number(a.value),
            (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
          )}
          placeholder={form.accountIds.length === 0 ? "Add an account…" : "Add another…"}
          searchPlaceholder="Search accounts…"
          emptyMessage="No matches"
          className="w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Goal progress sums transactions across every linked account. Leave empty for manual tracking.
        </p>
      </div>
      <div>
        <Label>Note</Label>
        <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1 pointer-coarse:min-h-11" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 pointer-coarse:min-h-11" disabled={!isFormValid || submitting}>
          {submitting ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Goal"}
        </Button>
      </div>
    </form>
  );
}
