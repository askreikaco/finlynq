"use client";

import React, { useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  GroupedPickerPanel,
  PICKER_SHEET_CLASS,
  type PickerEntry,
} from "./grouped-picker";

export interface Account {
  id: string | number;
  name: string;
  type?: string | null;
  currency?: string;
  isInvestment?: boolean;
  archived?: boolean;
}

interface AccountSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onSelect: (accountId: string) => void;
  selectedAccountId?: string;
  title?: string;
  /** Recently picked account IDs, most recent first. Shown as a "Recent" section when they match. */
  recentIds?: string[];
}

const OTHER_GROUP = "Other";

export function AccountSelector({
  open,
  onOpenChange,
  accounts,
  onSelect,
  selectedAccountId,
  title = "Select Account",
  recentIds,
}: AccountSelectorProps) {
  const entries = useMemo<PickerEntry[]>(
    () =>
      accounts
        .filter((acc) => !acc.archived)
        .map((acc) => {
          const type = acc.type || OTHER_GROUP;
          return {
            id: String(acc.id),
            name: acc.name,
            group: type,
            groupDetail: acc.currency || undefined,
            flatDetail: [type, acc.currency].filter(Boolean).join(" · "),
            searchText: [acc.name, acc.type ?? "", acc.currency ?? ""],
          };
        }),
    [accounts],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={PICKER_SHEET_CLASS}>
        <GroupedPickerPanel
          title={title}
          placeholder="Search account..."
          emptyText="No accounts found"
          entries={entries}
          selectedId={selectedAccountId}
          recentIds={recentIds}
          onPick={(id) => {
            onSelect(id);
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
