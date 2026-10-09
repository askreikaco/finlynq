"use client";

import * as React from "react";
import { useViewMode, type ViewKey } from "./view-mode";

/** A view's content, or a function that builds it. The function runs only when that view is shown. */
export type DataViewContent = React.ReactNode | (() => React.ReactNode);

export interface DataViewProps {
  viewKey: ViewKey;
  cards: DataViewContent;
  list: DataViewContent;
  className?: string;
}

/**
 * Mounts ONLY the selected view (Cards or List) and wraps it in <div data-view="cards|list">.
 * The unselected view is not rendered at all, so it costs no DOM and no data work.
 * Pass a function to defer building a view until it is selected.
 */
export function DataView({ viewKey, cards, list, className }: DataViewProps) {
  const [mode] = useViewMode(viewKey);
  const content = mode === "list" ? list : cards;
  return (
    <div data-view={mode} className={className}>
      {typeof content === "function" ? content() : content}
    </div>
  );
}
