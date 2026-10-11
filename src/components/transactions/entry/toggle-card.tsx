"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ToggleCardProps {
  /** Stable DOM id base; the panel gets `${id}-panel`. */
  id: string;
  testId?: string;
  icon: LucideIcon;
  /** Visible card title (also the accessible name of the region). */
  title: string;
  /** Muted line under the title, e.g. the series summary. */
  description?: React.ReactNode;
  /** Header control: a Switch (Repeat) or a count input (Split). Never nested inside a button. */
  control: React.ReactNode;
  /** Panel shown while open. */
  open: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Accordion card for the entry form (same card look as the FormGroup / ui Accordion item): a header row
 * with icon, title and a control that drives `open` (Switch or count input), and an inline panel.
 * The header is not a button because it holds an interactive control; the panel mounts only while open.
 */
export function ToggleCard({ id, testId, icon: Icon, title, description, control, open, children, className }: ToggleCardProps) {
  return (
    <section
      data-testid={testId}
      data-slot="accordion-item"
      data-state={open ? "open" : "closed"}
      aria-label={title}
      className={cn("shrink-0 overflow-hidden rounded-2xl dense:rounded-xl border border-border bg-card", className)}
    >
      <div className="flex min-h-12 dense:pointer-fine:min-h-10 items-center gap-3 dense:gap-2 px-4">
        <Icon aria-hidden="true" data-slot="form-row-icon" className="size-[18px] shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base text-foreground">{title}</div>
          {description ? (
            <div data-testid={testId ? `${testId}-summary` : undefined} className="truncate text-xs text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {open && (
        <div id={`${id}-panel`} className="space-y-3 border-t border-border p-4 animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </section>
  );
}
