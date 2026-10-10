"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { decrementNavDepth, incrementNavDepth } from "@/lib/nav/history-depth";

/**
 * Counts in-app navigations for this tab so Back can use real history (see lib/nav/history-depth.ts).
 * +1 for each client route change after the first render, -1 for each popstate (browser or Back).
 * Renders nothing.
 */
export function NavHistoryTracker() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    incrementNavDepth();
  }, [pathname]);

  useEffect(() => {
    const onPop = () => decrementNavDepth();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return null;
}
