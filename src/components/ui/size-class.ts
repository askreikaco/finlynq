"use client";

import { useEffect, useState } from "react";

export type SizeClass = "compact" | "regular" | "wide";

/**
 * Pure function to determine size class from container width (in pixels).
 * Boundaries: <640 = compact, 640-1024 = regular, >1024 = wide.
 */
export function sizeClassFor(width: number): SizeClass {
  if (width < 640) return "compact";
  if (width <= 1024) return "regular";
  return "wide";
}

/**
 * Hook to observe container width and return the adaptive size class.
 * Returns "compact" on SSR and before the ResizeObserver fires (SSR-safe).
 * Cleans up observer on unmount.
 */
export function useSizeClass(ref: React.RefObject<HTMLElement>): SizeClass {
  const [sizeClass, setSizeClass] = useState<SizeClass>("compact");

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") {
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
