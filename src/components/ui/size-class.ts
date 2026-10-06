"use client";

import { useEffect, useRef, useState } from "react";

export type SizeClass = "compact" | "regular" | "wide";

/**
 * Determines the size class based on container width.
 * compact: < 640px
 * regular: >= 640px and <= 1024px
 * wide: > 1024px
 */
export function sizeClassFor(width: number): SizeClass {
  if (width < 640) return "compact";
  if (width <= 1024) return "regular";
  return "wide";
}

/**
 * Hook to determine the current size class based on a container element's width.
 * Uses ResizeObserver for reactivity, SSR-safe (returns "compact" before mount).
 */
export function useSizeClass(ref: React.RefObject<HTMLElement | null>): SizeClass {
  const [sizeClass, setSizeClass] = useState<SizeClass>("compact");
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const updateSize = () => {
      if (ref.current) {
        setSizeClass(sizeClassFor(ref.current.clientWidth));
      }
    };

    // Set initial size
    updateSize();

    // Create ResizeObserver
    observerRef.current = new ResizeObserver(updateSize);
    observerRef.current.observe(ref.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [ref]);

  return sizeClass;
}
