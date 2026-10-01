"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DASHBOARD_CARDS, normalizeLayout, type DashboardLayout } from "@/lib/dashboard-layout";

export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

const MOVE_BTN =
  "flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

/**
 * Home customisation: every dashboard card with a show/hide Switch and 44px up/down
 * buttons (keyboard + touch friendly reorder). Save persists via `onSave`; "Reset to
 * default" persists the default layout immediately via `onReset`.
 * `availableIds` limits the listed cards (e.g. dev-only cards when dev mode is off);
 * unlisted cards keep their saved position/visibility.
 */
export function CustomizeDashboardSheet({
  open,
  onOpenChange,
  layout,
  availableIds,
  onSave,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: DashboardLayout;
  availableIds?: readonly string[];
  onSave: (layout: DashboardLayout) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [order, setOrder] = useState<string[]>(layout.order);
  const [hidden, setHidden] = useState<Set<string>>(new Set(layout.hidden));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the saved layout every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setOrder(layout.order);
    setHidden(new Set(layout.hidden));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const avail = new Set(availableIds ?? DASHBOARD_CARDS.map((c) => c.id));
  const shown = order.filter((id) => avail.has(id));
  const title = (id: string) => DASHBOARD_CARDS.find((c) => c.id === id)?.title ?? id;

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Swap with the neighbouring *listed* card (unlisted dev-only cards are skipped over).
  function move(id: string, dir: -1 | 1) {
    const i = shown.indexOf(id);
    const other = shown[i + dir];
    if (other === undefined) return;
    setOrder((prev) => {
      const next = [...prev];
      const a = next.indexOf(id);
      const b = next.indexOf(other);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onOpenChange(false);
    } catch {
      setError("Couldn't save your layout. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[90dvh] rounded-t-2xl",
          "sm:data-[side=bottom]:inset-x-auto sm:data-[side=bottom]:right-6 sm:data-[side=bottom]:left-auto sm:data-[side=bottom]:w-[28rem] sm:data-[side=bottom]:rounded-xl sm:data-[side=bottom]:border",
        )}
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-bold">Customize home</SheetTitle>
          <SheetDescription>Show, hide and reorder the cards on your dashboard.</SheetDescription>
        </SheetHeader>

        <ul data-slot="customize-list" className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
          {shown.map((id, i) => {
            const isHidden = hidden.has(id);
            const name = title(id);
            return (
              <li key={id} data-card-id={id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2 pl-3">
                <Switch checked={!isHidden} onCheckedChange={() => toggle(id)} aria-label={name} />
                <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", isHidden && "text-muted-foreground")}>{name}</span>
                <button type="button" className={MOVE_BTN} disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${name} up`}>
                  <ChevronUp className="size-4" aria-hidden />
                </button>
                <button type="button" className={MOVE_BTN} disabled={i === shown.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${name} down`}>
                  <ChevronDown className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>

        {error ? (
          <p role="alert" className="px-4 text-sm text-neg">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 border-t p-4 sm:flex-row-reverse">
          <Button className="min-h-11 flex-1" disabled={busy} onClick={() => run(() => onSave(normalizeLayout({ order, hidden: [...hidden] })))}>
            {busy ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" className="min-h-11 flex-1" disabled={busy} onClick={() => run(onReset)}>
            Reset to default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

