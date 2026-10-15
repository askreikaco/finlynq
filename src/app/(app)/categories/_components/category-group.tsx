"use client";

/**
 * CategoryGroup: one parent row of the Categories list. The row body (`children` of the header slot, a link or button
 * the page builds around a CategoryRow) SELECTS the group; the chevron button on the right is the ONLY thing that expands
 * and collapses it, and it never selects. The members render below when open.
 *
 * (An accordion trigger wraps its whole header, so a selectable body cannot live inside one; this is the same
 * disclosure pattern with a separate toggle: aria-expanded + aria-controls on the chevron button.)
 */

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CategoryGroupProps {
  /** Group name, for the toggle's accessible name. */
  label: string;
  /** DOM id of the member list (aria-controls). */
  panelId: string;
  open: boolean;
  onToggle: () => void;
  /** The selectable header row (link / button around a CategoryRow). */
  header: ReactNode;
  /** The member rows; rendered only while open. */
  children: ReactNode;
}

export function CategoryGroup({ label, panelId, open, onToggle, header, children }: CategoryGroupProps) {
  return (
    <div data-slot="category-group-item" data-open={open ? "true" : "false"}>
      <div className="relative">
        {header}
        <button
          type="button"
          data-slot="category-group-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>
      {open ? (
        <div id={panelId} data-slot="category-group-panel" className="border-t border-border/50">
          {children}
        </div>
      ) : null}
    </div>
  );
}
