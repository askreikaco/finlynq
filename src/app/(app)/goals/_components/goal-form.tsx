"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { X } from "lucide-react";
import { parseSaveError } from "@/lib/save-error";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";
import { isLocalWriteQueueActive, queueOfflineEntityCreate, queueOfflineEntityEdit } from "@/lib/data/local-write-queue";
import { Field, type FieldComboboxOption } from "@/components/ui/field";

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
  /** Offline queue (local-first L3): set on rows that are queued on this device. */
  pendingSync?: { kind: "create" | "edit" | "delete"; status: "pending" | "failed"; opId: string; failReason: string | null };
  // FINLYNQ-123: current-rate conversions into the display currency. The ONLY
  // figures the summary tiles may sum — per-goal amounts stay in `currency`.
  targetAmountDisplay?: number; currentAmountDisplay?: number;
  /** Server clock (goals.updated_at): the baseline for a queued delete. */
  updatedAt?: string | null;
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
  baseline,
}: {
  mode: "add" | "edit";
  goalId?: number;
  initial: GoalFormState;
  accounts: Account[];
  onSaved: () => void;
  onCancel: () => void;
  displayCurrency: string;
  /** Edit: the server goal the form was opened with (conflict baseline for an offline save). */
  baseline?: Goal;
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

  /**
   * Saves the goal on this device when the request could not reach the server (local-first L3). Scalar fields only.
   * Account links are online-only: an offline save that changes them (or creates a goal with a linked account) is refused.
   */
  async function queueSaveOffline(err: unknown, payload: Record<string, unknown>): Promise<boolean> {
    if (!isLocalWriteQueueActive() || !isNetworkFailure(err)) return false;
    const fields: Record<string, string | number | null> = {
      name: String(payload.name),
      type: String(payload.type),
      targetAmount: Number(payload.targetAmount),
      currency: String(payload.currency),
      deadline: (payload.deadline as string | null) ?? null,
      priority: Number(payload.priority),
      note: String(payload.note ?? ""),
    };
    if (mode === "edit" && goalId != null) {
      if (!baseline) return false;
      const sameLinks = [...form.accountIds].sort().join(",") === [...baseline.accountIds].sort().join(",");
      if (!sameLinks) return false;
      const current: Record<string, string | number | null> = {
        name: baseline.name, type: baseline.type, targetAmount: baseline.targetAmount, currency: baseline.currency,
        deadline: baseline.deadline, priority: baseline.priority, note: baseline.note,
      };
      const patch: Record<string, string | number | null> = {};
      for (const k of Object.keys(fields)) if (fields[k] !== current[k]) patch[k] = fields[k];
      if (Object.keys(patch).length === 0) return true;
      return queueOfflineEntityEdit("goal", goalId, patch, current);
    }
    if (form.accountIds.length > 0) return false;
    return queueOfflineEntityCreate("goal", fields);
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
      try {
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
      } catch (netErr) {
        // Flag off / not eligible / online: nothing is queued and the error path is unchanged.
        if (await queueSaveOffline(netErr, payload)) {
          setErrors({ ...errors, form: "" });
          onSaved();
          return;
        }
        throw netErr;
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
      <Field
        label="Goal Name"
        error={errors.name}
        value={form.name}
        onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: "" }); }}
        placeholder="e.g. Emergency Fund"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Type"
          control="select"
          value={form.type}
          onValueChange={(v) => setForm({ ...form, type: v ?? "savings" })}
          options={[
            { value: "savings", label: "Savings" },
            { value: "debt_payoff", label: "Debt Payoff" },
            { value: "investment", label: "Investment" },
            { value: "emergency_fund", label: "Emergency Fund" },
          ]}
        />
        <Field
          label="Currency"
          control="select"
          value={form.currency}
          onValueChange={(v) => setForm({ ...form, currency: v ?? displayCurrency })}
          options={currencyOptions.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <Field
        label="Target Amount"
        error={errors.targetAmount}
        control="amount"
        step="0.01"
        value={form.targetAmount}
        onValueChange={(nv) => { setForm({ ...form, targetAmount: nv }); setErrors({ ...errors, targetAmount: "" }); }}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Deadline"
          control="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
        />
        <Field
          label="Priority"
          control="select"
          value={form.priority}
          onValueChange={(v) => setForm({ ...form, priority: v ?? "1" })}
          options={[
            { value: "1", label: "High" },
            { value: "2", label: "Medium" },
            { value: "3", label: "Low" },
          ]}
        />
      </div>
      <Field
        label="Linked Accounts"
        control="combobox"
        info="Goal progress sums transactions across every linked account. Leave empty for manual tracking."
        value=""
        onValueChange={(v) => addAccount(v ?? "")}
        options={sortAccount(
          availableAccounts.map((a): FieldComboboxOption => ({ value: String(a.id), label: a.name })),
          (a) => Number(a.value),
          (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
        )}
        placeholder={form.accountIds.length === 0 ? "Add an account…" : "Add another…"}
        searchPlaceholder="Search accounts…"
        emptyMessage="No matches"
        hint={
          form.accountIds.length > 0 ? (
            <span className="flex flex-wrap gap-1.5 pt-1">
              {form.accountIds.map((id) => {
                const a = accounts.find((x) => x.id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-medium border border-border/60 text-foreground">
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
            </span>
          ) : undefined
        }
      />
      <Field label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1 pointer-coarse:min-h-row" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 pointer-coarse:min-h-row" disabled={!isFormValid || submitting}>
          {submitting ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Goal"}
        </Button>
      </div>
    </form>
  );
}
