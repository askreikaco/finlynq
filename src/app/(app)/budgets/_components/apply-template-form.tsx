"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { parseSaveError } from "@/lib/save-error";
import { Trash2 } from "lucide-react";
import type { BudgetTemplate } from "./budget-types";

/** Apply a saved template to one month, or delete a template. Rendered by /budgets/templates/apply. */
export function ApplyTemplateForm({
  month,
  displayCurrency,
  onApplied,
}: {
  month: string;
  displayCurrency: string;
  onApplied: () => void;
}) {
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [applyError, setApplyError] = useState("");

  const loadTemplates = useCallback(() => {
    fetch("/api/budget-templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const templateNames = [...new Set(templates.map((t) => t.name))];

  // Apply a template to the current month
  async function handleApplyTemplate(name: string) {
    setApplyError("");
    const templateItems = templates.filter((t) => t.name === name);
    for (const t of templateItems) {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: t.categoryId,
          month,
          amount: t.amount,
          currency: displayCurrency,
        }),
      });
      if (!res.ok) {
        // Surface the reason (e.g. 423 locked) and stop applying the rest.
        setApplyError(await parseSaveError(res, "Failed to apply template"));
        return;
      }
    }
    onApplied();
  }

  async function handleDeleteTemplate(name: string) {
    const templateItems = templates.filter((t) => t.name === name);
    for (const t of templateItems) {
      await fetch(`/api/budget-templates?id=${t.id}`, { method: "DELETE" });
    }
    loadTemplates();
  }

  return (
    <div className="space-y-3">
      {applyError && <p className="text-sm text-destructive">{applyError}</p>}
      {templateNames.length === 0 && (
        <p className="text-sm text-muted-foreground">No budget templates saved yet.</p>
      )}
      {templateNames.map((name) => {
        const items = templates.filter((t) => t.name === name);
        const total = items.reduce((s, t) => s + t.amount, 0);
        return (
          <div
            key={name}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div>
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">
                {items.length} categories &middot; {formatCurrency(total, displayCurrency)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => handleApplyTemplate(name)}>
                Apply
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label={`Delete template ${name}`}
                onClick={() => handleDeleteTemplate(name)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
