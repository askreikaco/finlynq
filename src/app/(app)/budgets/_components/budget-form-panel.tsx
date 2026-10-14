"use client";

/**
 * BudgetFormPanel: THE set-budget form. /budgets/new renders it as a page; the /budgets split view renders it
 * `embedded` in the pane, for a new budget (?sel=new) or the selected budget (?sel=<id>, category fixed, amount
 * prefilled). One component (FormPage + SetBudgetForm): same fields, validation, request and offline queue in both.
 */
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { FormPage } from "@/components/templates";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { isLocalWriteQueueOn } from "@/lib/data/local-write-queue";
import { SetBudgetForm } from "./set-budget-form";
import { parseMonthParam, type Budget } from "./budget-types";

export interface BudgetFormPanelProps {
  /** Pane: the month of the list. Page: omitted, read from ?month=. */
  month?: string;
  /** Edit: the selected budget. Omit to set a new one. */
  budget?: Budget | null;
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  /** Pane edit: the host page owns the delete confirm; this opens it. */
  onDelete?: () => void;
}

export function BudgetFormPanel({ month: monthProp, budget, embedded, onSaved, onCancel, onDelete }: BudgetFormPanelProps) {
  const searchParams = useSearchParams();
  const month = monthProp ?? parseMonthParam(searchParams.get("month"), getCurrentMonth());
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
  // The month's server budgets, only for the offline queue (edit baseline). Same url as the list: shares its cache.
  // Flag off: no request at all.
  const existingRes = useCacheFirstJson<Budget[]>(
    currencyLoading || !isLocalWriteQueueOn() ? null : `/api/budgets?month=${month}&rollover=1&currency=${encodeURIComponent(displayCurrency)}`,
  );

  return (
    <FormPage
      id="budget-new"
      entity="budget"
      embedded={
        embedded
          ? {
              onSaved,
              onCancel,
              actions:
                budget && onDelete ? (
                  <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={onDelete} aria-label={`Delete budget for ${budget.categoryName}`}>
                    <Trash2 className="mr-1 h-4 w-4" aria-hidden /> Delete
                  </Button>
                ) : undefined,
            }
          : undefined
      }
      title={budget ? `Edit budget: ${budget.categoryName}` : `Set budget for ${getMonthLabel(month)}`}
      fallbackReturn={`/budgets?month=${month}`}
      form="external"
      header={{ actions: null }}
    >
      {(ctx) => (
        <SetBudgetForm
          month={month}
          displayCurrency={displayCurrency}
          existing={Array.isArray(existingRes.data) ? existingRes.data : undefined}
          budget={budget}
          onSaved={ctx.finish}
        />
      )}
    </FormPage>
  );
}
