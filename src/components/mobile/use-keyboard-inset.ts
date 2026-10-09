"use client";

import { useEffect } from "react";

/** CSS custom property on <html>: px height hidden under the on-screen keyboard. */
export const KEYBOARD_INSET_VAR = "--kb-inset";
/** <html data-keyboard-open> is set while the inset exceeds this many px. */
export const KEYBOARD_OPEN_THRESHOLD = 100;

interface ViewportLike {
  height: number;
  offsetTop: number;
}

/** innerHeight - visualViewport.height - offsetTop, rounded, floored at 0. */
export function computeKeyboardInset(
  innerHeight: number,
  vv: ViewportLike | null | undefined,
): number {
  if (!vv) return 0;
  const raw = innerHeight - vv.height - vv.offsetTop;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

/**
 * iOS Safari (and the installed PWA) overlays the keyboard on fixed UI instead of
 * resizing the layout viewport. Publish the overlap as --kb-inset so fixed bottom
 * UI can lift above it. Writes the CSS var directly (no React state), rAF-throttled.
 * Does nothing when window.visualViewport is unsupported.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;

    const apply = () => {
      frame = 0;
      const inset = computeKeyboardInset(window.innerHeight, window.visualViewport);
      root.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`);
      if (inset > KEYBOARD_OPEN_THRESHOLD) {
        root.setAttribute("data-keyboard-open", "");
      } else {
        root.removeAttribute("data-keyboard-open");
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(apply) : 0;
      if (!frame) apply();
    };

    vv.addEventListener("resize", schedule, { passive: true });
    vv.addEventListener("scroll", schedule, { passive: true });
    apply();

    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      root.style.removeProperty(KEYBOARD_INSET_VAR);
      root.removeAttribute("data-keyboard-open");
    };
  }, []);
}
