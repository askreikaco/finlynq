"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { AmountInput } from "@/components/amount-input";
import { parseSaveError } from "@/lib/save-error";
import type { Category } from "./budget-types";

/** Set (upsert) one category's monthly budget. Rendered by /budgets/new. */
export function SetBudgetForm({
  month,
  displayCurrency,
  onSaved,
}: {
  month: string;
  displayCurrency: string;
  onSaved: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ categoryId: "", amount: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sortCategory = useDropdownOrder("category");

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((cats: Category[]) => setCategories(Array.isArray(cats) ? cats.filter((c) => c.type === "E") : []))
      .catch(() => {});
  }, []);

  function validateForm() {
    const newErrors: Record<string, string> = {};
    if (!form.categoryId) newErrors.categoryId = "Category is required";
    if (!form.amount || parseFloat(form.amount) <= 0) newErrors.amount = "Amount must be greater than 0";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const isFormValid = form.categoryId !== "" && form.amount !== "" && parseFloat(form.amount) > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(form.categoryId),
          month,
          amount: parseFloat(form.amount),
          currency: displayCurrency,
        }),
      });
      if (!res.ok) {
        setFormError(await parseSaveError(res, "Failed to save budget"));
        return;
      }
      setErrors({});
      setFormError("");
      onSaved();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Category</Label>
        <Combobox
          value={form.categoryId}
          onValueChange={(v) => { setForm({ ...form, categoryId: v }); setErrors({ ...errors, categoryId: "" }); }}
          items={sortCategory(
            categories.map((c): ComboboxItemShape => ({ value: String(c.id), label: `${c.group} - ${c.name}` })),
            (c) => Number(c.value),
            (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
          )}
          placeholder="Select category"
          searchPlaceholder="Search categories…"
          emptyMessage="No categories"
          className="w-full"
        />
        {errors.categoryId && <p className="text-xs text-destructive mt-1">{errors.categoryId}</p>}
      </div>
      <div>
        <Label>Budget Amount</Label>
        <AmountInput step="0.01" value={form.amount} onValueChange={(nv) => { setForm({ ...form, amount: nv }); setErrors({ ...errors, amount: "" }); }} placeholder="500.00" />
        {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
      </div>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
      <Button type="submit" className="w-full" disabled={!isFormValid || submitting}>{submitting ? "Saving…" : "Save Budget"}</Button>
    </form>
  );
}
