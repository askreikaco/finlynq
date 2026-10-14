"use client";

/**
 * ColumnShell: the iPadOS-Settings cascading columns for the More -> Settings -> Settings page family, at the `wide`
 * size class (viewport > 1024px, same threshold as the `wide:` CSS variant).
 *
 *   /more                 col 1 = More list (the leaf)
 *   /settings             col 1 = More list, col 2 = Settings hub (the leaf)
 *   /settings/<page>[/..] col 1 = More list, col 2 = Settings hub, col 3 = the page (the leaf)
 *
 * ONE component for both routers (Next layout/page and the SPA twins render it). Below wide nothing changes: only the
 * leaf renders, stacked, with its own back button, exactly as before. The ancestor columns are in the first render
 * (so the server HTML of a wide screen has no flash) and are unmounted after the first measure when the viewport is
 * not wide. Each column scrolls on its own (sticky, viewport tall); the URL of every column is a normal route.
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MoreMenu } from "@/components/more-menu";
import { SettingsHub } from "@/components/settings-hub";
import { sizeClassFor } from "@/components/ui/size-class";
import { ColumnCurrentContext } from "./column-context";

export type ColumnLevel = 1 | 2 | 3;

/** Column depth of a route: /more = 1, /settings = 2, /settings/** = 3, everything else null (no shell). */
export function columnLevelFor(pathname: string | null | undefined): ColumnLevel | null {
  if (!pathname) return null;
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === "/more") return 1;
  if (clean === "/settings") return 2;
  if (clean.startsWith("/settings/")) return 3;
  return null;
}

/** Which row each ancestor column marks: col 1 = "/settings" (level >= 2), col 2 = "/settings/<first segment>" (level 3). */
export function columnSelection(pathname: string | null | undefined): { col1: string | null; col2: string | null } {
  const level = columnLevelFor(pathname);
  if (level === null || level === 1) return { col1: null, col2: null };
  const clean = (pathname as string).split(/[?#]/)[0].replace(/\/+$/, "");
  return { col1: "/settings", col2: level === 3 ? "/" + clean.split("/").slice(1, 3).join("/") : null };
}

/** True from the wide size class (> 1024px). null until measured (server render, first client render). */
function useWideViewport(): boolean | null {
  const [wide, setWide] = React.useState<boolean | null>(null);
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => setWide(sizeClassFor(root.clientWidth) === "wide");
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  return wide;
}

const CURRENT_ROW = '[data-slot="inset-row"][aria-current="true"], [data-slot="settings-hub-row"][aria-current="true"]';

// Scroll memory for col 1 / col 2: /more -> /settings crosses a layout boundary, so the column remounts.
const scrollMemory = new Map<string, number>();

function Pane({
  id,
  remember = false,
  className,
  children,
}: {
  id: "col1" | "col2" | "col3";
  remember?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const touched = React.useRef(false);
  const pathname = usePathname();
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !remember) return;
    const y = scrollMemory.get(id);
    if (y) el.scrollTop = y;
    // Keep the current row of an ancestor column in view (Settings sits low in the More list). The rows above it load
    // late (account list), so look again shortly after, unless the user has scrolled the column meanwhile.
    touched.current = false;
    const reveal = () => {
      if (touched.current) return;
      const row = el.querySelector<HTMLElement>(CURRENT_ROW);
      if (!row) return;
      // Scroll the column only (scrollIntoView could also move the window).
      const pane = el.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const bar = 72; // the column's own top bar (sticky) covers the first 60px
      if (r.bottom > pane.bottom) el.scrollTop += r.bottom - pane.bottom + 16;
      else if (r.top < pane.top + bar) el.scrollTop -= pane.top + bar - r.top;
    };
    reveal();
    const timers = [setTimeout(reveal, 400), setTimeout(reveal, 1500)];
    return () => timers.forEach(clearTimeout);
  }, [id, remember, pathname]);
  return (
    <div
      ref={ref}
      data-column-pane={id}
      onScroll={remember ? (e) => scrollMemory.set(id, e.currentTarget.scrollTop) : undefined}
      onWheel={remember ? () => { touched.current = true; } : undefined}
      onTouchStart={remember ? () => { touched.current = true; } : undefined}
      className={cn(
        "min-w-0",
        // Wide: a viewport-tall column below the safe area that scrolls on its own, never sideways.
        "wide:sticky wide:top-[var(--sat,0px)] wide:h-[calc(100dvh-var(--sat,0px))] wide:overflow-y-auto wide:overflow-x-clip wide:overscroll-contain",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ColumnShellProps {
  /** The leaf: the route's own content (More list, Settings hub or a settings page). */
  children: React.ReactNode;
  instanceAdminEnabled?: boolean;
  categoriesMerged?: boolean;
}

export function ColumnShell({ children, instanceAdminEnabled = false, categoriesMerged = false }: ColumnShellProps) {
  const pathname = usePathname();
  const level = columnLevelFor(pathname);
  const wide = useWideViewport();
  if (level === null) return <>{children}</>;

  // Ancestors exist in the server HTML and first render (hidden below wide by CSS); drop them once measured not wide.
  const ancestors = wide !== false;
  return (
    <ColumnCurrentContext.Provider value={pathname ?? null}>
      <div
        data-column-shell=""
        data-column-level={level}
        className="wide:-mx-8 wide:-mb-8 wide:flex wide:items-start"
      >
        {level === 1 ? (
          <Pane id="col1" remember className="wide:w-[280px] wide:shrink-0 wide:border-r wide:border-border wide:px-4">
            {children}
          </Pane>
        ) : ancestors ? (
          <Pane id="col1" remember className="hidden wide:block wide:w-[280px] wide:shrink-0 wide:border-r wide:border-border wide:px-4">
            <MoreMenu instanceAdminEnabled={instanceAdminEnabled} categoriesMerged={categoriesMerged} />
          </Pane>
        ) : null}

        {level === 2 ? (
          <Pane id="col2" remember className="wide:w-[320px] wide:shrink-0 wide:border-r wide:border-border wide:px-4">
            {children}
          </Pane>
        ) : level === 3 && ancestors ? (
          <Pane id="col2" remember className="hidden wide:block wide:w-[320px] wide:shrink-0 wide:border-r wide:border-border wide:px-4">
            <SettingsHub />
          </Pane>
        ) : null}

        {level === 3 ? (
          <Pane id="col3" className="wide:min-w-0 wide:flex-1 wide:px-6">
            {children}
          </Pane>
        ) : (
          <div aria-hidden data-column-empty="" className="hidden wide:block wide:h-[calc(100dvh-var(--sat,0px))] wide:flex-1" />
        )}
      </div>
    </ColumnCurrentContext.Provider>
  );
}
