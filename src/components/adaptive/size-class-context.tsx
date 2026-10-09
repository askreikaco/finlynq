"use client";

import * as React from "react";
import { sizeClassFor, type SizeClass } from "@/components/ui/size-class";

/** data attribute on the app <main>; the provider measures that element when no target is passed. */
export const APP_MAIN_ATTRIBUTE = "data-app-main";

const AppSizeClassContext = React.createContext<SizeClass>("compact");

export interface AppSizeClassProviderProps {
  children: React.ReactNode;
  /** Element to measure. Defaults to the element carrying APP_MAIN_ATTRIBUTE. */
  target?: React.RefObject<HTMLElement | null>;
}

/**
 * One ResizeObserver on the app <main> ([data-app-main]). Renders no DOM of its own, so it adds
 * no markup depth. Thresholds come from sizeClassFor() in ui/size-class.ts. SSR and the first
 * render use "compact"; a layout effect measures before paint.
 * Use this only for JS-only decisions. Layout and styling use the CSS variants `regular:` and
 * `wide:`, which are viewport media queries by design: container-type creates a containing block
 * for position:fixed descendants (mobile tab bar, page FAB, banners, toasts).
 */
export function AppSizeClassProvider({ children, target }: AppSizeClassProviderProps) {
  const [sizeClass, setSizeClass] = React.useState<SizeClass>("compact");

  React.useLayoutEffect(() => {
    const element =
      target?.current ??
      (document.querySelector(`[${APP_MAIN_ATTRIBUTE}]`) as HTMLElement | null);
    if (!element) return;

    setSizeClass(sizeClassFor(element.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setSizeClass(sizeClassFor(width));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [target]);

  return <AppSizeClassContext.Provider value={sizeClass}>{children}</AppSizeClassContext.Provider>;
}

/** Current app size class. "compact" when no provider is mounted. */
export function useAppSizeClass(): SizeClass {
  return React.useContext(AppSizeClassContext);
}
