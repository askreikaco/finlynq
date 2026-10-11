"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useViewModeState, type ViewKey } from "./view-mode";

/** A view's content, or a function that builds it. The function runs only when that view is shown. */
export type DataViewContent = React.ReactNode | (() => React.ReactNode);

export interface DataViewProps {
  viewKey: ViewKey;
  cards: DataViewContent;
  list: DataViewContent;
  className?: string;
}

/** Compact density: tighter gap on a direct-child card grid (list rows tighten themselves in ListRow). */
const DENSE_VIEW =
  "dense:[&[data-view=cards]>.grid]:gap-2";

/**
 * Mounts ONLY the selected view (Cards or List) and wraps it in <div data-view="cards|list">.
 * The unselected view is not rendered at all, so it costs no DOM and no data work.
 * Pass a function to defer building a view until it is selected.
 * Until the stored choice is loaded (`pending`) it renders an empty placeholder, so neither view
 * mounts with the default and then swaps.
 */
export function DataView({ viewKey, cards, list, className }: DataViewProps) {
  const { mode, pending } = useViewModeState(viewKey);
  if (pending) return <div data-view-pending="" aria-busy="true" className={className} />;
  const content = mode === "list" ? list : cards;
  return (
    <div data-view={mode} className={cn(DENSE_VIEW, className)}>
      {typeof content === "function" ? content() : content}
    </div>
  );
}
