"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

export interface InfoTipProps {
  /** The help text shown in the popover. Keep it to one short sentence. */
  text: React.ReactNode;
  /** Accessible name of the (i) button. Default "More info". Name the subject, e.g. "About display currency". */
  label?: string;
  /** Popover side. Default "top". */
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * The one (i) help icon: a keyboard-focusable button that opens a small popover with `text`.
 * Opens on tap/click and on keyboard focus (touch has no hover); on desktop it also opens on hover.
 * Esc, an outside tap or blur closes it. Replaces visible subtitle/description paragraphs.
 */
export function InfoTip({ text, label = "More info", side = "top", className }: InfoTipProps) {
  const [open, setOpen] = React.useState(false);
  // A pointer press focuses the button too; only a keyboard focus (no preceding pointerdown) opens on focus,
  // otherwise the focus-open and the click-toggle would cancel each other.
  const pointerRef = React.useRef(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        data-slot="info-tip"
        aria-label={label}
        openOnHover
        delay={200}
        onPointerDown={() => {
          pointerRef.current = true;
        }}
        onFocus={() => {
          if (!pointerRef.current) setOpen(true);
        }}
        onBlur={() => {
          pointerRef.current = false;
          setOpen(false);
        }}
        className={cn(
          // pointer-events-auto: the page-header title block is pointer-events-none.
          "pointer-events-auto inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        <Info className="size-4" aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side={side} sideOffset={6} collisionPadding={12} className="isolate z-50">
          <PopoverPrimitive.Popup
            data-slot="info-tip-content"
            role="tooltip"
            className="max-w-[min(20rem,calc(100vw-1.5rem))] rounded-lg bg-popover px-3 py-2 text-xs font-normal normal-case tracking-normal text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            {text}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
