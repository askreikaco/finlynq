"use client";

/**
 * TwoPaneLayout — the reconcile panes (DbPane / FilePane) on /import, as ONE column at every width.
 *
 * Both panes stack (left first, then right) with the same centred width as the rest of the page. Each
 * pane scrolls inside its own capped box, so a long list never pushes the action bar out of reach.
 * `rightWide` is accepted for callers but has no effect: there is no side-by-side layout any more.
 */

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** Each pane is a Card capped in height; only its body scrolls. */
const PANE_CARD = "flex max-h-[55dvh] flex-col overflow-hidden";
const PANE_BODY = "min-h-0 overflow-y-auto";

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
      <Card title={leftLabel} padded={false} frameClassName={PANE_CARD} className={PANE_BODY}>
        {left}
      </Card>
      <Card title={rightLabel} padded={false} frameClassName={PANE_CARD} className={PANE_BODY}>
        {right}
      </Card>
    </div>
  );
}
