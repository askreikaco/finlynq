"use client";

import { useKeyboardInset } from "./use-keyboard-inset";

/** Mounts the visualViewport keyboard-inset listener once for the app shell. Renders nothing. */
export function KeyboardInsetObserver() {
  useKeyboardInset();
  return null;
}
