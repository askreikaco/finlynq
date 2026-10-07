"use client";

import React from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { AmountInput } from "@/components/amount-input";
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
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-white flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
          />
          <span>Split this transaction</span>
        </label>
        {enabled && (
          <div className="flex items-center text-xs">
            {isBalanced ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Balanced ({formatCurrency(splitSum, currency)})
              </span>
            ) : diff > 0 ? (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                {formatCurrency(diff, currency)} remaining
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-400 font-medium">
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
                className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Split #{idx + 1}
                  </span>
                  {rows.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      className="text-zinc-500 hover:text-rose-400 p-1 rounded-md transition-colors"
                      title="Remove split"
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
                    className="flex items-center justify-between px-3 py-2 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 rounded-lg text-left transition-colors"
                  >
                    <span className="text-xs truncate font-medium text-white">
                      {cat?.name || "Pick category"}
                    </span>
                  </button>

                  {/* Amount input */}
                  <AmountInput
                    value={row.amount}
                    onValueChange={(val) => handleUpdateRow(idx, "amount", val)}
                    placeholder={`0${currencyDecimals(currency) > 0 ? ".00" : ""}`}
                    className="h-8 px-2.5 py-1.5 bg-zinc-800/80 border border-zinc-700/60 rounded-lg text-xs text-white placeholder:text-zinc-500 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                {/* Split Note */}
                <input
                  type="text"
                  placeholder="Split note (optional)"
                  value={row.note}
                  onChange={(e) => handleUpdateRow(idx, "note", e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-800/50 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-700 transition-colors"
                />
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddRow}
            className="w-full py-2.5 border border-dashed border-zinc-700/70 hover:border-indigo-500/50 rounded-xl text-xs font-medium text-zinc-400 hover:text-indigo-300 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Split Row
          </button>
        </div>
      )}
    </div>
  );
}
