"use client";

import React, { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Check } from "lucide-react";

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
}

export function CategorySelector({
  open,
  onOpenChange,
  categories,
  onSelect,
  selectedCategoryId,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[82vh] flex flex-col p-0 rounded-t-3xl bg-zinc-950 border-t border-zinc-800 text-white"
      >
        <SheetHeader className="px-5 py-4 border-b border-zinc-900 shrink-0">
          <SheetTitle className="text-white text-lg font-semibold">Select Category</SheetTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-500 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.keys(groupedCategories).length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No categories found
            </div>
          ) : (
            Object.entries(groupedCategories).map(([group, cats]) => (
              <div key={group} className="space-y-2.5">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
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
                        className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                          isSelected
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-200"
                            : "bg-zinc-900/90 border-zinc-800 hover:bg-zinc-800 text-zinc-200"
                        }`}
                      >
                        <span className="text-sm font-medium truncate w-full">
                          {cat.name}
                        </span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-indigo-400 shrink-0 ml-1.5" />
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
