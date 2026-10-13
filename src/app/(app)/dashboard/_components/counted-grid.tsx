"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { insightColumns } from "@/lib/dashboard-layout";

/**
 * Count the RENDERED cells under a grid: `display: contents` wrappers are looked through, and childless
 * (self-hidden, `empty:hidden`) wrappers are skipped, so cards that render nothing leave no column behind.
 */
export function countRenderedCells(root: Element): number {
  let n = 0;
  for (const child of Array.from(root.children)) {
    const cls = typeof child.className === "string" ? child.className : "";
    if (/(^|\s)contents(\s|$)/.test(cls)) n += countRenderedCells(child);
    else if (child.childNodes.length > 0) n += 1;
  }
  return n;
}

/** A grid whose column count follows the number of rendered cells (see insightColumns). */
export function CountedGrid({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Before measuring, assume a full row so SSR / first paint matches the old 3-column layout.
  const [count, setCount] = useState(3);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setCount(countRenderedCells(el));
    update();
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  return (
    <div ref={ref} data-counted-grid data-cells={count} className={cn(className, insightColumns(count))}>
      {children}
    </div>
  );
}
