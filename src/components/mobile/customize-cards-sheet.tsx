"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import type { CardLayout, PageCard } from "@/lib/card-layout";

const MOVE_BTN =
  "flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

/**
 * Generic Customize sheet for any page's cards: a show/hide Switch and 44px up/down buttons per card (keyboard
 * and touch reorder). `cards` = the cards this page lists right now (e.g. dev-only ones filtered out); the
 * saved order of the others is kept. Save persists via `onSave`; "Reset to default" via `onReset`.
 */
export function CustomizeCardsSheet({
  open,
  onOpenChange,
  title = "Customize",
  description = "Show, hide and reorder the cards on this page.",
  cards,
  layout,
  onSave,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  cards: readonly PageCard[];
  layout: CardLayout;
  onSave: (layout: CardLayout) => Promise<void>;
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

  const listed = new Set(cards.map((c) => c.id));
  const shown = order.filter((id) => listed.has(id));
  const name = (id: string) => cards.find((c) => c.id === id)?.title ?? id;

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Swap with the neighbouring *listed* card (unlisted cards are skipped over).
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
          "regular:data-[side=bottom]:inset-x-auto regular:data-[side=bottom]:right-6 regular:data-[side=bottom]:left-auto regular:data-[side=bottom]:w-[28rem] regular:data-[side=bottom]:rounded-xl regular:data-[side=bottom]:border",
        )}
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-bold">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <ul data-slot="customize-list" className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
          {shown.map((id, i) => {
            const isHidden = hidden.has(id);
            const label = name(id);
            return (
              <li key={id} data-card-id={id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2 pl-3">
                <Field
                  control="switch"
                  checked={!isHidden}
                  onCheckedChange={() => toggle(id)}
                  aria-label={label}
                />
                <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", isHidden && "text-muted-foreground")}>{label}</span>
                <button type="button" className={MOVE_BTN} disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${label} up`}>
                  <ChevronUp className="size-4" aria-hidden />
                </button>
                <button type="button" className={MOVE_BTN} disabled={i === shown.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${label} down`}>
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
        <div className="flex flex-col gap-2 border-t p-4 regular:flex-row-reverse">
          <Button
            className="min-h-row flex-1"
            disabled={busy}
            // Unlisted cards keep their saved state: `order` holds every card, and their hidden ids are carried over.
            onClick={() => run(() => onSave({ order, hidden: [...new Set([...hidden, ...layout.hidden.filter((id) => !listed.has(id))])] }))}
          >
            {busy ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" className="min-h-row flex-1" disabled={busy} onClick={() => run(onReset)}>
            Reset to default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
