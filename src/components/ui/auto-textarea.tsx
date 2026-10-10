"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// SSR-safe: useLayoutEffect on the client (no measurement needed on the server).
const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * Sets the height to fit the content, capped at the computed max-height (then the
 * textarea scrolls inside). Reads scrollHeight after resetting height to auto.
 * Border is added back because height is border-box and scrollHeight is not.
 */
export function fitTextareaToContent(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  const border = Math.max(0, el.offsetHeight - el.clientHeight);
  const content = el.scrollHeight + border;
  const max = parseFloat(getComputedStyle(el).maxHeight);
  const capped = Number.isFinite(max) && content > max;
  el.style.height = `${capped ? max : content}px`;
  el.style.overflowY = capped ? "auto" : "hidden";
}

/**
 * Multi-line text field that grows with its content. Starts at 2 rows; the caller
 * sets the min-height and max-height (Tailwind classes). Wraps long words, keeps
 * newlines, and never scrolls horizontally. Enter inserts a newline (no submit).
 */
export function AutoTextarea({
  className,
  value,
  ref,
  rows = 2,
  ...props
}: React.ComponentProps<"textarea"> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const setRef = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = node;
    },
    [ref],
  );

  // Re-fit when the value changes (typing, prefill, programmatic reset).
  useIsoLayoutEffect(() => {
    if (innerRef.current) fitTextareaToContent(innerRef.current);
  }, [value]);

  // Width changes re-wrap the text, so re-fit on resize. Window listener only (no ResizeObserver loop).
  React.useEffect(() => {
    const onResize = () => {
      if (innerRef.current) fitTextareaToContent(innerRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <textarea
      ref={setRef}
      rows={rows}
      value={value}
      className={cn(
        "block w-full min-w-0 resize-none overflow-y-auto whitespace-pre-wrap break-words text-base text-foreground outline-none placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
