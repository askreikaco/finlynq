"use client";

/**
 * Display section — plain "Dropdown ordering" link row in General settings
 * (old /settings/display renders General). Links to /settings/dropdown-order.
 */

import Link from "next/link";
import { Settings2, ChevronRight } from "lucide-react";

export function DisplaySection() {
  return (
    <Link
      href="/settings/dropdown-order"
      className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <Settings2 className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Dropdown ordering</span>
          <span className="block text-xs text-muted-foreground">
            Pin frequently-used items to the top of category, account, holding, and currency pickers
          </span>
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
