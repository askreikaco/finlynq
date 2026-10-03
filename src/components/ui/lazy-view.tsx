"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type ElementType,
} from "react";
import { cn } from "@/lib/utils";

export interface LazyViewProps {
  children: ReactNode;
  /** Custom placeholder or skeleton to show while waiting for intersection */
  placeholder?: ReactNode;
  /** Margin around the root. Defaults to "150px 0px" so content loads slightly before entering viewport */
  rootMargin?: string;
  /** Threshold at which to trigger (0 to 1). Defaults to 0 */
  threshold?: number | number[];
  /** Minimum height for the placeholder container to prevent layout collapse */
  minHeight?: number | string;
  /** Additional CSS class names */
  className?: string;
  /** Optional inline styles */
  style?: CSSProperties;
  /** If true, bypasses lazy loading and renders children immediately */
  disabled?: boolean;
  /** HTML element type for wrapper. Defaults to 'div' */
  as?: ElementType;
}

/**
 * LazyView renders a skeleton/placeholder until the component enters the viewport
 * (or within `rootMargin`), then mounts the real children and disconnects the observer.
 */
export function LazyView({
  children,
  placeholder,
  rootMargin = "150px 0px",
  threshold = 0,
  minHeight = 120,
  className,
  style,
  disabled = false,
  as: Component = "div",
}: LazyViewProps) {
  // If IntersectionObserver is unavailable (SSR, jsdom, unsupported environments)
  // or explicitly disabled, render immediately.
  const [isIntersecting, setIsIntersecting] = useState<boolean>(() => {
    if (disabled) return true;
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return true;
    }
    return false;
  });

  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (disabled || isIntersecting) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsIntersecting(true);
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && (entry.isIntersecting || entry.intersectionRatio > 0)) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [disabled, isIntersecting, rootMargin, threshold]);

  if (isIntersecting) {
    return (
      <Component className={className} style={style}>
        {children}
      </Component>
    );
  }

  return (
    <Component
      ref={containerRef}
      className={cn("w-full", className)}
      style={{
        minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight,
        ...style,
      }}
    >
      {placeholder ?? (
        <div
          className="w-full h-full min-h-[inherit] rounded-xl bg-muted/20 border border-border/40 animate-pulse"
          aria-hidden="true"
        />
      )}
    </Component>
  );
}
