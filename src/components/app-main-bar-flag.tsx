"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { isTabBarHidden } from "@/components/nav";

/**
 * Renders nothing. On routes where the compact bottom tab bar is hidden (isTabBarHidden), it sets
 * data-bar-hidden on its parent, the layout's <main>. The main element then drops the bottom padding it
 * reserves for the bar below 640px (data-[bar-hidden]:max-regular:pb-[var(--sab)] in layout.tsx).
 */
export function AppMainBarFlag() {
  const pathname = usePathname();
  const hidden = isTabBarHidden(pathname ?? "");
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const main = ref.current?.parentElement;
    if (!main) return;
    if (hidden) main.setAttribute("data-bar-hidden", "");
    else main.removeAttribute("data-bar-hidden");
  }, [hidden]);
  return <span ref={ref} hidden />;
}
