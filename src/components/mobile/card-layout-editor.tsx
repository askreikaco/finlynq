"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Overlay } from "@/components/ui/overlay";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { CardLayout, PageCard } from "@/lib/card-layout";

const MOVE_BTN =
  "flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

/**
 * Customize editor for any page's cards (an Overlay with the card list as its body): a show/hide Switch and 44px up/down buttons per card (keyboard
 * and touch reorder). `cards` = the cards this page lists right now (e.g. dev-only ones filtered out); the
 * saved order of the others is kept. Save persists via `onSave`; "Reset to default" via `onReset`.
 */
export function CardLayoutEditor({
  open,
  onClose,
  title = "Customize",
  info = "Show, hide and reorder the cards on this page.",
  cards,
  layout,
  onSave,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  info?: string;
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
      onClose();
    } catch {
      setError("Couldn't save your layout. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay
      open={open}
      onClose={onClose}
      size="md"
      title={title}
      info={info}
      busy={busy}
      bodyClassName="gap-3"
      actions={[
        { label: "Reset to default", onClick: () => run(onReset), disabled: busy, className: "min-h-row" },
        {
          label: busy ? "Saving..." : "Save",
          kind: "primary",
          className: "min-h-row",
          disabled: busy,
          // Unlisted cards keep their saved state: `order` holds every card, and their hidden ids are carried over.
          onClick: () => run(() => onSave({ order, hidden: [...new Set([...hidden, ...layout.hidden.filter((id) => !listed.has(id))])] })),
        },
      ]}
    >
      <ul data-slot="customize-list" className="min-h-0 space-y-2">
        {shown.map((id, i) => {
          const isHidden = hidden.has(id);
          const label = name(id);
          return (
            <li key={id} data-card-id={id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2 pl-3">
              <Field control="switch" checked={!isHidden} onCheckedChange={() => toggle(id)} aria-label={label} />
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
        <p role="alert" className="text-sm text-neg">
          {error}
        </p>
      ) : null}
    </Overlay>
  );
}
