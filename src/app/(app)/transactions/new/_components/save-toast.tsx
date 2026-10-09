"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** How long the Continue confirmation stays on screen. */
export const SAVE_TOAST_MS = 3000;

/**
 * Confirmation shown after Continue books an entry. Auto-dismisses after SAVE_TOAST_MS; the timer
 * is cleared on unmount. The page remounts it (new key) for each Continue, so the timer restarts.
 */
export function SaveToast({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const dismissRef = React.useRef(onDismiss);
  React.useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(), SAVE_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="txnew-toast"
      className={cn(
        "fixed top-[calc(var(--sat,0px)+3.5rem)] inset-x-4 z-[55] mx-auto max-w-sm rounded-xl bg-card border border-border shadow-lg text-sm px-4 py-3",
        "motion-safe:animate-in motion-safe:fade-in",
      )}
    >
      {text}
    </div>
  );
}
