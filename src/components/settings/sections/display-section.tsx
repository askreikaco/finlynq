"use client";

/**
 * Display section — shown as a link row in General settings.
 * Links to /settings/dropdown-order for dropdown ordering customization.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Settings2, ChevronRight } from "lucide-react";

export function DisplaySection() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <Settings2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Dropdown ordering</p>
          <p className="text-xs text-muted-foreground">
            Pin frequently-used items to the top of pickers
          </p>
        </div>
      </div>
      <Link href="/settings/dropdown-order">
        <Button variant="ghost" size="sm">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}
