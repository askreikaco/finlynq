import * as React from "react";
import type { DetailItem } from "@/components/ui/overlay";

/** The label/value list of a detail (a <dl>): inside the split-view pane's detail and the detail routes. */
export function DetailList({ items, className }: { items: DetailItem[]; className?: string }) {
  return (
    <dl data-slot="detail-list" className={["[&>*:not(:last-child)]:shadow-[var(--list-divider)]", className].filter(Boolean).join(" ")}>
      {items.map((it, i) => (
        <div key={i} className="flex min-h-row items-center justify-between gap-4 py-2">
          <dt className="text-sm text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 text-right text-sm font-medium text-foreground break-words">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
