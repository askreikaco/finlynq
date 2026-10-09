"use client";

import React, { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Check } from "lucide-react";
import { filterRecent } from "@/lib/transactions/recent-picks";

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
  /** Recently picked category IDs, most recent first. Shown as a "Recent" chip section when they match. */
  recentIds?: string[];
}

export function CategorySelector({
  open,
  onOpenChange,
  categories,
  onSelect,
  selectedCategoryId,
  recentIds,
}: CategorySelectorProps) {
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const term = search.toLowerCase();
    return categories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(term) ||
        (cat.group && cat.group.toLowerCase().includes(term))
    );
  }, [categories, search]);

  const groupedCategories = useMemo(() => {
    const groups: Record<string, Category[]> = {};
    filteredCategories.forEach((cat) => {
      const groupName = cat.group || "Other";
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(cat);
    });
    return groups;
  }, [filteredCategories]);

  const recentList = useMemo(() => {
    if (!recentIds || recentIds.length === 0) return [];
    const byId = new Map(filteredCategories.map((cat) => [String(cat.id), cat] as const));
    return filterRecent(recentIds, [...byId.keys()])
      .map((id) => byId.get(id))
      .filter((cat): cat is Category => cat !== undefined);
  }, [recentIds, filteredCategories]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex flex-col p-0 pt-0 rounded-t-3xl bg-background border-t border-border text-foreground max-h-[75dvh] h-auto"
      >
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0">
          <SheetTitle className="text-foreground text-lg font-semibold">Select Category</SheetTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-base text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
          {recentList.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Recent
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentList.map((cat) => (
                  <button
                    key={`recent-${cat.id}`}
                    type="button"
                    onClick={() => {
                      onSelect(String(cat.id));
                      onOpenChange(false);
                      setSearch("");
                    }}
                    className="min-h-11 px-3.5 rounded-full border border-border bg-card text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98] transition-all"
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {Object.keys(groupedCategories).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No categories found
            </div>
          ) : (
            Object.entries(groupedCategories).map(([group, cats]) => (
              <div key={group} className="space-y-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  {group}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {cats.map((cat) => {
                    const isSelected = String(cat.id) === selectedCategoryId;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onSelect(String(cat.id));
                          onOpenChange(false);
                          setSearch("");
                        }}
                        className={`flex items-center justify-between min-h-12 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                          isSelected
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-card/90 border-border hover:bg-muted text-foreground"
                        }`}
                      >
                        <span className="text-sm font-medium truncate w-full">
                          {cat.name}
                        </span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary shrink-0 ml-1.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
