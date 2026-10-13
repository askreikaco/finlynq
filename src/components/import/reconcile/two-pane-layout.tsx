"use client";

/**
 * TwoPaneLayout — the reconcile panes (DbPane / FilePane) on /import, as ONE column at every width.
 *
 * Both panes stack (left first, then right) with the same centred width as the rest of the page. Each
 * pane scrolls inside its own capped box, so a long list never pushes the action bar out of reach.
 * `rightWide` is accepted for callers but has no effect: there is no side-by-side layout any more.
 */

import type { ReactNode } from "react";

export function TwoPaneLayout({
  leftLabel,
  left,
  rightLabel,
  right,
}: {
  leftLabel: ReactNode;
  left: ReactNode;
  rightLabel: ReactNode;
  right: ReactNode;
  /** @deprecated no-op: the panes are always one column. */
  rightWide?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <section className="flex max-h-[55dvh] flex-col overflow-hidden rounded-lg border bg-card">
        <h2 className="px-4 pb-2 pt-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {leftLabel}
        </h2>
        <div className="min-h-0 overflow-y-auto">
          {left}
        </div>
      </section>
      <section className="flex max-h-[55dvh] flex-col overflow-hidden rounded-lg border bg-card">
        <h2 className="px-4 pb-2 pt-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {rightLabel}
        </h2>
        <div className="min-h-0 overflow-y-auto">
          {right}
        </div>
      </section>
    </div>
  );
}
