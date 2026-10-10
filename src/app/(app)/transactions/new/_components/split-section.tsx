"use client";

import React from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, Split } from "lucide-react";
import { AmountInput } from "@/components/amount-input";
import { Switch } from "@/components/ui/switch";
import { formatCurrency, currencyDecimals } from "@/lib/currency";
import { type Category } from "./category-selector";

export interface SplitRow {
  id: string;
  categoryId: string;
  amount: string;
  note: string;
}

interface SplitSectionProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  rows: SplitRow[];
  onChangeRows: (rows: SplitRow[]) => void;
  categories: Category[];
  totalAmount: number;
  currency: string;
  onOpenCategorySelector: (rowIndex: number) => void;
}

export function SplitSection({
  enabled,
  onToggle,
  rows,
  onChangeRows,
  categories,
  totalAmount,
  currency,
  onOpenCategorySelector,
}: SplitSectionProps) {
  const decimals = currencyDecimals(currency);
  const multiplier = Math.pow(10, decimals);
  const splitSum = rows.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);
  const diff = Math.round((totalAmount - splitSum) * multiplier) / multiplier;
  const isBalanced = Math.abs(diff) < Math.pow(10, -decimals) && totalAmount > 0;

  const handleAddRow = () => {
    const remaining = Math.max(0, diff);
    onChangeRows([
      ...rows,
      {
        id: Math.random().toString(36).slice(2, 9),
        categoryId: "",
        amount: remaining > 0 ? remaining.toFixed(decimals) : "",
        note: "",
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    onChangeRows(rows.filter((_, i) => i !== index));
  };

  const handleUpdateRow = (index: number, field: keyof SplitRow, value: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    onChangeRows(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex min-h-row items-center justify-between gap-3">
        <label
          htmlFor="txnew-split-toggle"
          className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
        >
          <Split aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
          <span>Split this transaction</span>
        </label>
        <Switch
          id="txnew-split-toggle"
          checked={enabled}
          onCheckedChange={(checked) => onToggle(checked)}
          className="shrink-0"
        />
        {enabled && (
          <div className="flex items-center text-xs">
            {isBalanced ? (
              <span className="flex items-center gap-1 text-pos font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Balanced ({formatCurrency(splitSum, currency)})
              </span>
            ) : diff > 0 ? (
              <span className="flex items-center gap-1 text-warning font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                {formatCurrency(diff, currency)} remaining
              </span>
            ) : (
              <span className="flex items-center gap-1 text-neg font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                Over by {formatCurrency(Math.abs(diff), currency)}
              </span>
            )}
          </div>
        )}
      </div>

      {enabled && (
        <div className="space-y-3 pt-1 animate-in fade-in duration-200">
          {rows.map((row, idx) => {
            const cat = categories.find((c) => String(c.id) === row.categoryId);
            return (
              <div
                key={row.id}
                className="p-3 bg-card/90 border border-border rounded-xl space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Split #{idx + 1}
                  </span>
                  {rows.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      className="text-muted-foreground hover:text-destructive p-1 max-regular:p-3 max-regular:-m-3 rounded-md transition-colors"
                      title="Remove split"
                      aria-label="Remove split"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Category picker trigger */}
                  <button
                    type="button"
                    onClick={() => onOpenCategorySelector(idx)}
                    className="flex items-center justify-between px-3 py-2 bg-muted/80 hover:bg-muted border border-border/60 rounded-lg text-left transition-colors"
                  >
                    <span className="text-xs truncate font-medium text-foreground">
                      {cat?.name || "Pick category"}
                    </span>
                  </button>

                  {/* Amount input */}
                  <AmountInput
                    value={row.amount}
                    onValueChange={(val) => handleUpdateRow(idx, "amount", val)}
                    placeholder={`0${currencyDecimals(currency) > 0 ? ".00" : ""}`}
                    className="h-8 px-2.5 py-1.5 bg-muted/80 border border-border/60 rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
                  />
                </div>

                {/* Split Note */}
                <input
                  type="text"
                  placeholder="Split note (optional)"
                  value={row.note}
                  onChange={(e) => handleUpdateRow(idx, "note", e.target.value)}
                  className="w-full px-3 py-1.5 bg-muted/50 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
                />
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddRow}
            className="w-full py-2.5 border border-dashed border-border/70 hover:border-primary/50 rounded-xl text-xs font-medium text-muted-foreground hover:text-primary/80 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Split Row
          </button>
        </div>
      )}
    </div>
  );
}
