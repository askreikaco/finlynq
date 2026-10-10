"use client";

import React, { useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  GroupedPickerPanel,
  PICKER_SHEET_CLASS,
  type PickerEntry,
} from "./grouped-picker";

export interface Category {
  id: string | number;
  name: string;
  group?: string;
  type?: string;
  note?: string;
}

interface CategorySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onSelect: (categoryId: string) => void;
  selectedCategoryId?: string;
  /** Recently picked category IDs, most recent first. Shown as a "Recent" section when they match. */
  recentIds?: string[];
}

const OTHER_GROUP = "Other";

export function CategorySelector({
  open,
  onOpenChange,
  categories,
  onSelect,
  selectedCategoryId,
  recentIds,
}: CategorySelectorProps) {
  const entries = useMemo<PickerEntry[]>(
    () =>
      categories.map((cat) => {
        const group = cat.group || OTHER_GROUP;
        return {
          id: String(cat.id),
          name: cat.name,
          group,
          groupDetail: undefined,
          flatDetail: group,
          searchText: [cat.name, group],
        };
      }),
    [categories],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={PICKER_SHEET_CLASS}>
        <GroupedPickerPanel
          title="Select Category"
          placeholder="Search category..."
          emptyText="No categories found"
          entries={entries}
          selectedId={selectedCategoryId}
          recentIds={recentIds}
          layout="expand"
          settingsHref="/categories"
          settingsLabel="Manage categories"
          onPick={(id) => {
            onSelect(id);
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
