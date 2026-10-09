"use client";

import React, { useMemo } from "react";
import { useApi } from "@/lib/data/use-api";
import { Sparkles } from "lucide-react";

interface AutocompletePillsProps {
  type: "payee" | "note" | "tag";
  currentValue: string;
  onSelect: (selected: string) => void;
  visible?: boolean;
}

export function AutocompletePills({
  type,
  currentValue,
  onSelect,
  visible = true,
}: AutocompletePillsProps) {
  const { data } = useApi<{ suggestions: string[] }>(
    `/api/transactions/autocomplete?type=${type}`
  );

  const suggestions = data?.suggestions || [];

  const filtered = useMemo(() => {
    if (!suggestions.length) return [];

    if (type === "tag") {
      // For comma-separated tags, match against the last active tag segment
      const segments = currentValue.split(",").map((s) => s.trim());
      const lastSegment = segments[segments.length - 1]?.toLowerCase() || "";
      const existingTags = new Set(
        segments.slice(0, segments.length - 1).map((s) => s.toLowerCase())
      );

      return suggestions
        .filter((tag) => !existingTags.has(tag.toLowerCase()))
        .filter((tag) => !lastSegment || tag.toLowerCase().includes(lastSegment))
        .slice(0, 8);
    }

    const term = currentValue.trim().toLowerCase();
    if (!term) return suggestions.slice(0, 8);

    return suggestions
      .filter((item) => item.toLowerCase().includes(term) && item.toLowerCase() !== term)
      .slice(0, 8);
  }, [suggestions, currentValue, type]);

  if (!visible || filtered.length === 0) {
    return null;
  }

  const handlePillClick = (item: string) => {
    if (type === "tag") {
      const segments = currentValue.split(",").map((s) => s.trim()).filter(Boolean);
      // Replace last incomplete segment or append
      const last = currentValue.split(",").pop()?.trim() || "";
      if (last && segments.length > 0) {
        segments[segments.length - 1] = item;
      } else {
        segments.push(item);
      }
      onSelect(segments.join(", "));
    } else {
      onSelect(item);
    }
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none animate-in fade-in duration-200">
      <div className="flex items-center text-[10px] text-muted-foreground font-medium mr-0.5 shrink-0">
        <Sparkles className="w-3 h-3 text-primary mr-1" />
        Suggestions:
      </div>
      {filtered.map((item) => (
        <button
          key={item}
          type="button"
          onMouseDown={(e) => {
            // Prevent input blur when tapping suggestion pill
            e.preventDefault();
            handlePillClick(item);
          }}
          className="px-2.5 py-1 text-xs font-medium rounded-full bg-muted/90 hover:bg-muted active:bg-primary/90 text-foreground active:text-primary-foreground border border-border/60 whitespace-nowrap active:scale-95 transition-all shadow-sm"
        >
          {item}
        </button>
      ))}
    </div>
  );
}
