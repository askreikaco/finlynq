"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export interface DetailItem {
  label: React.ReactNode;
  value: React.ReactNode;
}

/**
 * Bottom sheet that lists every field a mobile ListRow leaves out as label/value pairs
 * (a <dl>). `children` renders below the list (e.g. Edit / Delete actions).
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  items,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  items: DetailItem[];
  children?: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-lg font-bold">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <dl data-slot="detail-list" className="divide-y divide-border/50 px-4">
          {items.map((it, i) => (
            <div key={i} className="flex min-h-row items-center justify-between gap-4 py-2">
              <dt className="text-sm text-muted-foreground">{it.label}</dt>
              <dd className="min-w-0 text-right text-sm font-medium text-foreground break-words">{it.value}</dd>
            </div>
          ))}
        </dl>
        {children ? <div className="flex flex-col gap-2 p-4">{children}</div> : null}
      </SheetContent>
    </Sheet>
  );
}
