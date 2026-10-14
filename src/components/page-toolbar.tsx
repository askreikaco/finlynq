"use client";

/**
 * PageToolbar: the one toolbar of every list / report page, four slots in a fixed order, left to right:
 *   1. Range      dropdown: This month, This quarter, This year, Custom (Custom reveals from / to dates)
 *   2. Month      previous (icon), label, next (icon). Steps by the active unit (month / quarter / year); not shown for
 *                 Custom or a legacy range. Next is disabled on the current period.
 *   3. Search     icon button that expands an input in place (Esc clears and collapses, blur while empty collapses)
 *   4. Filter     funnel icon only (aria-label "Filter"), dot + count when filters are active; opens the filter + sort page
 *   5. Trailing   optional, after Filter: `refresh` = the icon-only Refresh button (revalidates the page's cached cards / charts);
 *                 `trailing` = any other node
 * A page passes only the slots that apply to it ("where applicable"): no `range` = no dates, no `search` = no text.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoundIconButton } from "@/components/ui/round-icon-button";
import { CONTROL_SURFACE } from "@/components/ui/control-surface";
import { Input } from "@/components/ui/input";
import { RefreshButton } from "@/components/refresh-button";
import { MetricRangeSelect } from "@/components/metric-range-select";
import { cn } from "@/lib/utils";
import { localDateISO } from "@/lib/utils/date";
import {
  TOOLBAR_RANGE_KEYS, canStepNext, isSteppable, periodLabel, stepSelection,
  type RangeSelection,
} from "@/lib/metrics/period";

export interface PageToolbarProps {
  /** Slots 1 + 2. Omit on a page without dates. */
  range?: { selection: RangeSelection; onChange: (next: RangeSelection) => void };
  /** Hide the month switcher while keeping the range dropdown. Default true. */
  monthSwitcher?: boolean;
  /** Slot 3. Omit on a page without free text. */
  search?: { value: string; onChange: (next: string) => void; placeholder?: string };
  /** Slot 4. `href` may be a function evaluated at click time (so the current URL is carried). */
  filter?: { href: string | (() => string); activeCount?: number };
  /** Slot 5: icon-only Refresh button (aria-label "Refresh") for pages with cached cards / charts. */
  refresh?: boolean;
  /** Slot 5: extra trailing node, rendered after Refresh. */
  trailing?: ReactNode;
  className?: string;
}

export function RangeSlot({ range }: { range: NonNullable<PageToolbarProps["range"]> }) {
  return (
    <MetricRangeSelect value={range.selection} onChange={range.onChange} keys={TOOLBAR_RANGE_KEYS} touch />
  );
}

export function MonthSwitcher({ selection, onChange }: { selection: RangeSelection; onChange: (next: RangeSelection) => void }) {
  const today = localDateISO();
  if (!isSteppable(selection)) return null;
  const unit = selection.range === "this_year" ? "year" : selection.range === "this_quarter" ? "quarter" : "month";
  return (
    <div data-slot="month-switcher" className={cn("flex h-11 items-center gap-1 rounded-full px-0.5", CONTROL_SURFACE)}>
      <RoundIconButton type="button" surface={false} aria-label={`Previous ${unit}`} onClick={() => onChange(stepSelection(selection, -1, today))}>
        <ChevronLeft className="h-4 w-4" />
      </RoundIconButton>
      <span data-testid="month-label" aria-live="polite" className="min-w-16 text-center text-sm font-medium tabular-nums">
        {periodLabel(selection, today)}
      </span>
      <RoundIconButton
        type="button"
        surface={false}
        aria-label={`Next ${unit}`}
        disabled={!canStepNext(selection, today)}
        onClick={() => onChange(stepSelection(selection, 1, today))}
      >
        <ChevronRight className="h-4 w-4" />
      </RoundIconButton>
    </div>
  );
}

export function SearchToggle({ value, onChange, placeholder = "Search" }: NonNullable<PageToolbarProps["search"]>) {
  const [open, setOpen] = useState(value !== "");
  const input = useRef<HTMLInputElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (open && focusNext.current) {
      focusNext.current = false;
      input.current?.focus();
    }
  }, [open]);
  if (!open) {
    return (
      <RoundIconButton
        type="button"
        aria-label="Search"
        aria-expanded={false}
        data-slot="search-toggle"
        onClick={() => {
          focusNext.current = true;
          setOpen(true);
        }}
      >
        <Search className="h-4 w-4" />
      </RoundIconButton>
    );
  }
  return (
    <div data-slot="search-toggle" className="relative min-w-40 flex-1 basis-56">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={input}
        type="search"
        aria-label="Search"
        placeholder={placeholder}
        value={value}
        className={cn("h-11 rounded-full pl-10 pr-10 text-sm", CONTROL_SURFACE)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (value === "") setOpen(false);
        }}
      />
      {value !== "" && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/** `variant` is kept for old callers; the button is always the shared RoundIconButton. */
export function FilterButton({ href, activeCount = 0 }: NonNullable<PageToolbarProps["filter"]> & { variant?: "ghost" | "outline" }) {
  // A function href reads the CURRENT address (range / search are written with replaceState, which Next does not
  // track). It is re-read after every render, so the link is already right when it is clicked; the first render
  // (and the server) render "#" for a function href, so hydration matches.
  const initial = typeof href === "string" ? href : null;
  const [resolved, setResolved] = useState<string | null>(initial);
  const next = typeof href === "function" ? href() : href;
  useEffect(() => {
    if (next !== resolved) setResolved(next);
  });
  return (
    <RoundIconButton
            aria-label="Filter"
      title={activeCount > 0 ? `Filter (${activeCount} active)` : "Filter"}
      data-slot="filter-button"
      className="relative"
      render={<Link href={resolved ?? "#"} />}
    >
      <Filter className="h-4 w-4" />
      {activeCount > 0 && (
        <span
          data-testid="filter-badge"
          aria-hidden
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
        >
          {activeCount}
        </span>
      )}
    </RoundIconButton>
  );
}

export function PageToolbar({ range, monthSwitcher = true, search, filter, refresh, trailing, className }: PageToolbarProps) {
  if (!range && !search && !filter && !refresh && !trailing) return null;
  return (
    <div data-slot="page-toolbar" data-testid="page-toolbar" role="toolbar" aria-label="Page controls" className={cn("flex w-full flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {range && (
        <div data-slot="range-month" className="flex flex-nowrap items-center gap-1">
          <RangeSlot range={range} />
          {monthSwitcher && <MonthSwitcher selection={range.selection} onChange={range.onChange} />}
        </div>
      )}
      {search && <SearchToggle {...search} />}
      {filter && (
        <div className={cn(!search && "ml-auto")}>
          <FilterButton {...filter} />
        </div>
      )}
      {(refresh || trailing) && (
        <div data-slot="toolbar-trailing" className={cn("flex items-center gap-1", !filter && "ml-auto")}>
          {refresh && <RefreshButton />}
          {trailing}
        </div>
      )}
    </div>
  );
}
