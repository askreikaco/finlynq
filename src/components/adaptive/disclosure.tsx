"use client";

/**
 * Disclosure (G2-12): one header button plus one region, the same tree at every size.
 *
 * - `collapseBelow="regular"`: collapsed below 40rem (640px), expanded from regular up. The
 *   default comes from `useAppSizeClass()`, so it follows a resize until the user toggles.
 * - The user's toggle always works and wins for this mount. Nothing is persisted.
 * - The region is always mounted; a closed region gets the `hidden` attribute. Cards inside it
 *   therefore mount exactly as they did before, only their visibility changes.
 * - Header and region are wired with aria-expanded, aria-controls and aria-labelledby.
 */

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSizeClass } from "./size-class-context";

export interface DisclosureProps {
  /** Header label while the region is closed. */
  title: React.ReactNode;
  /** Header label while the region is open. Defaults to `title`. */
  expandedTitle?: React.ReactNode;
  children: React.ReactNode;
  /** Collapsed below regular, expanded from regular up (size-class driven). Omit for `defaultOpen`. */
  collapseBelow?: "regular";
  /** Initial open state when `collapseBelow` is not set. Default false. */
  defaultOpen?: boolean;
  /** Rendered next to the header button, outside it (for example a "Dismiss all" button). */
  trailing?: React.ReactNode;
  /** Extra classes for the header button, merged over the defaults. */
  headerClassName?: string;
  /** Extra classes for the root element. */
  className?: string;
  /** Extra classes for the region. */
  contentClassName?: string;
}

export function Disclosure({
  title,
  expandedTitle,
  children,
  collapseBelow,
  defaultOpen = false,
  trailing,
  headerClassName,
  className,
  contentClassName,
}: DisclosureProps) {
  const sizeClass = useAppSizeClass();
  const sizeDefault = collapseBelow === "regular" ? sizeClass !== "compact" : defaultOpen;
  const [override, setOverride] = React.useState<boolean | null>(null);
  const open = override ?? sizeDefault;

  const uid = React.useId();
  const headerId = `${uid}-header`;
  const regionId = `${uid}-region`;

  const button = (
    <button
      type="button"
      id={headerId}
      aria-expanded={open}
      aria-controls={regionId}
      onClick={() => setOverride(!open)}
      className={cn(
        "flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        headerClassName,
      )}
    >
      {open ? (expandedTitle ?? title) : title}
      <ChevronDown
        className={cn("size-4 shrink-0 motion-safe:transition-transform", open && "rotate-180")}
        aria-hidden
      />
    </button>
  );

  return (
    <div className={className} data-state={open ? "open" : "closed"}>
      {trailing ? (
        <div className="flex items-center justify-between gap-2">
          {button}
          {trailing}
        </div>
      ) : (
        button
      )}
      <div id={regionId} role="region" aria-labelledby={headerId} hidden={!open} className={contentClassName}>
        {children}
      </div>
    </div>
  );
}
