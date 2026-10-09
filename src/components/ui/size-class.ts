"use client";

import { useLayoutEffect, useState } from "react";

export type SizeClass = "compact" | "regular" | "wide";

/**
 * Single source of the size-class thresholds, in CSS px.
 * The container variants in src/app/globals.css use the same values in rem at the
 * 16px root: regular = `@container app (width >= 40rem)` (640px), wide = `(width > 64rem)` (1024px).
 * Pinned together by tests/components/adaptive/size-class-css.test.ts.
 */
export const SIZE_CLASS_REGULAR_MIN = 640;
export const SIZE_CLASS_WIDE_ABOVE = 1024;

/**
 * Pure function to determine size class from container width (in pixels).
 * Boundaries: <640 = compact, 640-1024 = regular, >1024 = wide.
 */
export function sizeClassFor(width: number): SizeClass {
  if (width < SIZE_CLASS_REGULAR_MIN) return "compact";
  if (width <= SIZE_CLASS_WIDE_ABOVE) return "regular";
  return "wide";
}

/**
 * Hook to observe container width and return the adaptive size class.
 * Returns "compact" on the server. Measures synchronously on mount (useLayoutEffect),
 * so the first paint on the client already has the right class. Cleans up on unmount.
 */
export function useSizeClass(ref: React.RefObject<HTMLElement | null>): SizeClass {
  const [sizeClass, setSizeClass] = useState<SizeClass>("compact");

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    setSizeClass(sizeClassFor(element.getBoundingClientRect().width));

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const width = entry.contentRect.width;
        setSizeClass(sizeClassFor(width));
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return sizeClass;
}
