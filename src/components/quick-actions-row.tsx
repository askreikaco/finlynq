"use client";

import { PillButton } from "@/components/mobile";
import { Plus } from "lucide-react";

/**
 * Quick-actions row for Home/Dashboard
 * Quick transaction shortcuts: Expense, Income, Transfer, Duplicate Last
 */
export function QuickActionsRow() {
  return (
    <div className="flex gap-2 flex-wrap justify-center sm:justify-start">
      <PillButton href="/transactions/new?type=Expense">
        <Plus className="h-4 w-4" />
        Expense
      </PillButton>
      <PillButton href="/transactions/new?type=Income">
        <Plus className="h-4 w-4" />
        Income
      </PillButton>
      <PillButton href="/transactions/new?type=Transfer">
        <Plus className="h-4 w-4" />
        Transfer
      </PillButton>
    </div>
  );
}
