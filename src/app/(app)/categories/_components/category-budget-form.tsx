"use client";

/**
 * CategoryBudgetForm: THE category + budget form on /categories. Add = empty form, Edit = the same form prefilled.
 * Fields: name, type (add only), group, budget for the selected month (expense only; blank = no budget).
 * Edit also deletes the category. It owns the requests (categories + budgets, with the offline queue); the page
 * owns the data and what happens after (`onSaved`, `onDeleted`) and removing an existing budget (`onClearBudget`,
 * which also handles queued budgets).
 *
 *   add:  POST /api/categories { name, type, group } then POST /api/budgets { categoryId, month, amount, currency }
 *   edit: PUT  /api/categories { id, name, group }   then POST /api/budgets (upsert) or onClearBudget
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Overlay } from "@/components/ui/overlay";
import { GroupCombobox } from "@/components/ui/group-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMonthLabel } from "@/lib/currency";
import { parseSaveError } from "@/lib/save-error";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";
import { isLocalWriteQueueActive, queueOfflineBudgetSet, queueOfflineEntityEdit } from "@/lib/data/local-write-queue";
import type { Budget } from "../../budgets/_components/budget-types";

export type FormCategory = { id: number; type: string; group: string; name: string };

const TYPE_LABELS = { E: "Expense", I: "Income", R: "Reconciliation" } as const;

export interface CategoryBudgetFormProps {
  /** null = add (empty form); a category = edit (prefilled). */
  category: FormCategory | null;
  /** All categories (the group suggestions). */
  categories: FormCategory[];
  /** The month's budgets; the edit form's budget field starts from this category's. */
  budgets: Budget[];
  month: string;
  currency: string;
  /** Type for a new category (the page's Spending / Income tab). */
  defaultType?: "E" | "I";
  /** Saved; `warning` = the category saved but its budget did not. */
  onSaved: (warning?: string) => void;
  onCancel: () => void;
  onDeleted: () => void;
  /** Remove an existing budget (server or queued). Resolves false on failure. */
  onClearBudget: (b: Budget) => Promise<boolean>;
}

export function CategoryBudgetForm({
  category, categories, budgets, month, currency, defaultType = "E", onSaved, onCancel, onDeleted, onClearBudget,
}: CategoryBudgetFormProps) {
  const isEdit = category != null;
  const existing = category ? budgets.find((b) => b.categoryId === category.id) : undefined;
  const [name, setName] = useState(category?.name ?? "");
  const [group, setGroup] = useState(category?.group ?? "");
  const [type, setType] = useState<string>(category?.type ?? defaultType);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [nameError, setNameError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const groups = Array.from(new Set(categories.map((c) => c.group).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const canBudget = type === "E";

  async function saveBudget(categoryId: number, catName: string, catGroup: string): Promise<string | null> {
    const value = amount.trim() === "" ? 0 : parseFloat(amount);
    if (!Number.isFinite(value) || value < 0) return "Invalid budget";
    if (value === 0) {
      if (existing && !(await onClearBudget(existing))) return "Couldn't remove budget";
      return null;
    }
    if (existing && existing.amount === value) return null;
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, month, amount: value, currency }),
      });
      if (!res.ok) return await parseSaveError(res, "Couldn't save budget");
      return null;
    } catch (netErr) {
      if (isLocalWriteQueueActive() && isNetworkFailure(netErr)) {
        const queued = await queueOfflineBudgetSet(
          { categoryId, month, amount: value, currency, categoryName: catName, categoryGroup: catGroup },
          existing && existing.id ? { id: existing.id, categoryId, month, amount: existing.amount, currency: existing.currency ?? null, updatedAt: existing.updatedAt ?? null } : undefined,
        );
        if (queued) return null;
      }
      return "Network error";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setNameError("Name required");
      return;
    }
    setNameError("");
    setSubmitting(true);
    try {
      let id = category?.id ?? 0;
      if (isEdit) {
        const changed = name.trim() !== category!.name || group.trim() !== category!.group;
        if (changed) {
          try {
            const res = await fetch("/api/categories", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, name: name.trim(), group: group.trim() }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              setFormError(data?.error || "Couldn't save");
              return;
            }
          } catch (netErr) {
            // Offline queue (local-first L3): a rename is kept on this device; a group change needs the server.
            const renameOnly = group.trim() === category!.group;
            if (!(renameOnly && isLocalWriteQueueActive() && isNetworkFailure(netErr)
              && (await queueOfflineEntityEdit("category", id, { name: name.trim() }, { name: category!.name })))) {
              setFormError("Couldn't save");
              return;
            }
          }
        }
      } else {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), type, group: group.trim() }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setFormError(data?.error || "Couldn't create");
          return;
        }
        id = (await res.json()).id;
      }
      const warning = canBudget ? await saveBudget(id, name.trim(), group.trim()) : null;
      onSaved(warning ?? undefined);
    } catch {
      setFormError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!category) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/categories?id=${category.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      setConfirmDelete(false);
      if (!res.ok) {
        setFormError(data?.error || "Couldn't delete");
        return;
      }
      onDeleted();
    } catch {
      setConfirmDelete(false);
      setFormError("Couldn't delete");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate data-form="category-budget" className="space-y-4 px-4 pb-4">
      {formError && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {formError}
        </div>
      )}

      <div>
        <Input
          aria-label="Name"
          aria-invalid={!!nameError || undefined}
          className="h-11 text-base regular:pointer-fine:text-sm"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError(""); }}
          placeholder="Name"
          autoFocus={!isEdit}
        />
        {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
      </div>

      {!isEdit && (
        <Select items={TYPE_LABELS} value={type} onValueChange={(v) => setType(v ?? "E")}>
          <SelectTrigger aria-label="Type" className="h-11 w-full">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="E">Expense</SelectItem>
            <SelectItem value="I">Income</SelectItem>
            <SelectItem value="R">Reconciliation</SelectItem>
          </SelectContent>
        </Select>
      )}

      <GroupCombobox value={group} onChange={setGroup} options={groups} placeholder="Group" ariaLabel="Group" />

      {canBudget && (
        <div>
          <Input
            aria-label="Budget"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="h-11 text-base regular:pointer-fine:text-sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Budget · ${getMonthLabel(month)}`}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        {isEdit ? (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={submitting}>
            Delete
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : isEdit ? "Save" : "Add"}</Button>
        </div>
      </div>

      <Overlay
        variant="confirm"
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete category"
        message={<>Delete <strong>{category?.name}</strong>? Categories in use can&apos;t be deleted.</>}
        confirmLabel="Delete"
        busy={submitting}
        onConfirm={handleDelete}
      />
    </form>
  );
}
