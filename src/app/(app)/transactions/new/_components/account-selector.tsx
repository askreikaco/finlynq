"use client";

import React, { useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  GroupedPickerPanel,
  PICKER_SHEET_CLASS,
  type PickerEntry,
} from "./grouped-picker";
import { OTHER_GROUP, normalizeGroupName, orderGroups } from "@/lib/accounts/groups";

export interface Account {
  id: string | number;
  name: string;
  type?: string | null;
  /** User account group (Cash, Checking, Credit Card, ...). Unset rows fall under "Other". */
  group?: string | null;
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

export function AccountSelector({
  open,
  onOpenChange,
  accounts,
  onSelect,
  selectedAccountId,
  title = "Select Account",
  recentIds,
}: AccountSelectorProps) {
  const entries = useMemo<PickerEntry[]>(() => {
    const rows: PickerEntry[] = accounts
      .filter((acc) => !acc.archived)
      .map((acc) => {
        const group = normalizeGroupName(acc.group) ?? OTHER_GROUP;
        return {
          id: String(acc.id),
          name: acc.name,
          group,
          groupDetail: acc.currency || undefined,
          flatDetail: [group, acc.currency].filter(Boolean).join(" · "),
          searchText: [acc.name, group, acc.currency ?? "", acc.type ?? ""],
        };
      });
    // Sections alphabetical with "Other" last. The Accounts page also honours a saved
    // per-user group order, which needs its own fetch; not done here (the picker takes
    // accounts as props). Keys are lowercased so case variants share one section.
    const order = orderGroups(rows.map((r) => r.group), []);
    const rank = new Map(order.map((g, i) => [g.toLowerCase(), i] as const));
    const rankOf = (g: string) => rank.get(g.toLowerCase()) ?? order.length;
    return rows.sort((a, b) => rankOf(a.group) - rankOf(b.group));
  }, [accounts]);

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
          settingsHref="/accounts"
          settingsLabel="Manage accounts"
          onPick={(id) => {
            onSelect(id);
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
