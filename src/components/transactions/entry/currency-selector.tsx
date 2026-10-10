"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PICKER_SHEET_CLASS, PickerCard, PickerRow } from "./grouped-picker";

interface CurrencySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Codes from useActiveCurrencies (the user's enabled currencies). */
  currencies: string[];
  /** Selected currency code. */
  selected?: string;
  onSelect: (code: string) => void;
  title?: string;
}

/** English currency name for a code, or undefined when the runtime has no data for it. */
export function currencyName(code: string): string | undefined {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
    return name && name !== code ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Flat, searchable currency list in the same bottom sheet as the other entry pickers.
 * Built from the exported PickerCard/PickerRow primitives: GroupedPickerPanel has no
 * flat mode, so it is not used here. Mounted inside SheetContent, so search resets on open.
 */
export function CurrencySelector({
  open,
  onOpenChange,
  currencies,
  selected,
  onSelect,
  title = "Select Currency",
}: CurrencySelectorProps) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();

  const rows = useMemo(
    () =>
      currencies
        .map((code) => ({ code, name: currencyName(code) }))
        .filter(
          (c) =>
            term === "" ||
            c.code.toLowerCase().includes(term) ||
            (c.name ?? "").toLowerCase().includes(term),
        ),
    [currencies, term],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={PICKER_SHEET_CLASS}>
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4">
          <SheetTitle className="text-lg font-semibold text-foreground">{title}</SheetTitle>
          <div className="relative mt-3">
            <Search
              aria-hidden="true"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />
            <input
              type="text"
              aria-label="Search currency..."
              placeholder="Search currency..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-base text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
            />
          </div>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No currencies found</div>
          ) : (
            <PickerCard>
              {rows.map((c) => (
                <PickerRow
                  key={c.code}
                  label={c.code}
                  detail={c.name}
                  selected={c.code === selected}
                  onSelect={() => {
                    onSelect(c.code);
                    onOpenChange(false);
                  }}
                />
              ))}
            </PickerCard>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
