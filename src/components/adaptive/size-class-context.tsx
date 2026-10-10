"use client";

import * as React from "react";
import { sizeClassFor, type SizeClass } from "@/components/ui/size-class";

/**
 * data attribute on the app <main>. Kept for the layout contract (tests/components/adaptive/size-class-css.test.ts);
 * the provider no longer reads it, because the app size class is the viewport, not an element.
 */
export const APP_MAIN_ATTRIBUTE = "data-app-main";

const AppSizeClassContext = React.createContext<SizeClass>("compact");

export interface AppSizeClassProviderProps {
  children: React.ReactNode;
}

/**
 * App-wide size class from the VIEWPORT, the same axis as the CSS `regular:` / `wide:` variants
 * (viewport media queries). The width is documentElement.clientWidth, read in the layout effect and
 * again in the ResizeObserver callback on documentElement, so the first paint and every later
 * update use one source. Thresholds come from sizeClassFor() in ui/size-class.ts. SSR and the first
 * render use "compact". Renders no DOM of its own.
 * Use this only for JS-only decisions. Layout and styling use the CSS variants `regular:` and
 * `wide:`; container-type is not used on the shell because it would create a containing block for
 * position:fixed descendants (mobile tab bar, page FAB, banners, toasts).
 */
export function AppSizeClassProvider({ children }: AppSizeClassProviderProps) {
  const [sizeClass, setSizeClass] = React.useState<SizeClass>("compact");

  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => setSizeClass(sizeClassFor(root.clientWidth));

    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, []);

  return <AppSizeClassContext.Provider value={sizeClass}>{children}</AppSizeClassContext.Provider>;
}

/** Current app size class. "compact" when no provider is mounted. */
export function useAppSizeClass(): SizeClass {
  return React.useContext(AppSizeClassContext);
}
