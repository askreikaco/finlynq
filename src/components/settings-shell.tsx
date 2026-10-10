"use client";

/**
 * Settings shell — wraps every /settings/* sub-page via src/app/(app)/settings/layout.tsx, and /connect
 * (Integrations rendered in place with "Connect your AI" open).
 *
 * - /settings is the hub (settings-hub.tsx, level 1). The shell adds nothing to it.
 * - Every other page is level 2: one detail bar (round back to the hub | centred active section title, the
 *   PHONE_BAR primitive) at every size. Below regular it is the glass bar; from regular it is the opaque
 *   sticky bar (PageHeader v2). The page's own PageHeader is then static and its title is sr-only, so
 *   two sticky rows never stack.
 * - No side nav and no pill strip at any size (G2-06: the hub is the only section switcher).
 *
 * Active section label mirrors the registry (ALIASES map legacy paths to their settings entry).
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SettingsBackContext } from "@/components/settings-back-context";
import { getEntriesBySurface, ALIASES } from "@/lib/nav-config";
import { BackButton } from "@/components/mobile/back-button";
import {
  HEADER_TITLE_CLASS,
  PHONE_BAR,
  PHONE_BAR_CENTER,
  PHONE_BAR_TITLE,
} from "@/components/mobile/page-header";

type NavItem = { href: string; label: string };

const SETTINGS_HUB_HREF = "/settings";

/**
 * Settings entries from the registry, in display order: General, Categories, Reconciliation, Investments,
 * Integrations, Developer, About.
 */
function generateNavItems(): NavItem[] {
  const settingsEntries = getEntriesBySurface("settings");
  const order = [
    "/settings/general",
    "/settings/categorization",
    "/settings/reconciliation",
    "/settings/investments",
    "/settings/integrations",
    "/settings/developer",
    "/settings/about",
  ];

  const items: NavItem[] = [];
  for (const href of order) {
    const entry = settingsEntries.find((e) => e.path === href);
    if (entry) {
      items.push({
        href: entry.path,
        label: entry.label,
      });
    }
  }
  return items;
}

const NAV_ITEMS: NavItem[] = generateNavItems();

/**
 * Map legacy sub-routes to their canonical nav item via the registry aliases.
 * Maps both redirect and render-parent aliases to their target paths.
 */
function generateRouteGroup(): Array<{ prefix: string; group: string }> {
  const routeGroup: Array<{ prefix: string; group: string }> = [];

  for (const alias of ALIASES) {
    if (alias.path.startsWith("/settings") || alias.path === "/connect") {
      routeGroup.push({
        prefix: alias.path,
        group: alias.target,
      });
    }
  }

  return routeGroup;
}

const ROUTE_GROUP: Array<{ prefix: string; group: string }> = generateRouteGroup();

// Pages that render their own PageHeader backHref must be listed here to avoid a double back button.
const SELF_BACK_PATHS = ["/settings/import/reconcile-visibility"];

function activeHref(pathname: string): string {
  for (const { prefix, group } of ROUTE_GROUP) {
    if (pathname.startsWith(prefix)) return group;
  }
  // Bare /settings is the hub (no detail bar); General is the fallback label if a caller ever asks for it.
  if (pathname === "/settings") return "/settings/general";
  // Match the most specific nav item that prefixes the current pathname.
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best ?? "";
}

/**
 * Sub-page PageHeader inside the shell: the detail bar is the one visible title row at every size.
 * The page's header row is static (no second sticky bar), its h1 is sr-only (kept for a11y and tests),
 * and its subtitle is hidden. Viewport-free: the same rule at every size.
 */
const SUB_PAGE_HEADER_OVERRIDES =
  "[&_[data-slot=page-header]]:static [&_[data-slot=page-header]]:min-h-0 [&_[data-slot=page-header]]:border-0 [&_[data-slot=page-header-title]]:sr-only [&_[data-slot=page-header-subtitle]]:hidden";

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const isHub = pathname === SETTINGS_HUB_HREF;
  const activeLabel = NAV_ITEMS.find((item) => item.href === active)?.label ?? "Settings";
  const showDetailBar = !isHub && !SELF_BACK_PATHS.some((p) => pathname.startsWith(p));
  // A page that passes its own backHref (PageHeader reports it) keeps its back; the bar back is hidden.
  const [pageHasBack, setPageHasBack] = React.useState(false);
  const backState = React.useMemo(() => ({ detail: showDetailBar, setOwnBack: setPageHasBack }), [showDetailBar]);

  return (
    <SettingsBackContext.Provider value={backState}>
    <div className="flex min-w-0 flex-col gap-6">
      {/* Not inside the overflow container below: sticky needs a non-overflow ancestor. */}
      {showDetailBar && (
        <div data-slot="settings-detail-bar" className={PHONE_BAR}>
          <div className="flex items-center gap-3 max-regular:contents">
            {!pageHasBack && (
              <BackButton href={SETTINGS_HUB_HREF} label="Back to Settings" className="justify-self-start" />
            )}
            <div className={PHONE_BAR_CENTER}>
              <span aria-hidden className={cn(HEADER_TITLE_CLASS, PHONE_BAR_TITLE)}>
                {activeLabel}
              </span>
            </div>
          </div>
        </div>
      )}
      {/* Content slot: min-w-0 lets the column shrink below intrinsic width. No scroll container here at any size:
          the sticky detail bar pins to the page scroller. Wide tables scroll in their own ui/table container. */}
      <div
        className={cn("min-w-0", showDetailBar && SUB_PAGE_HEADER_OVERRIDES)}
        data-slot="settings-content"
      >
        <div className="overflow-x-clip">{children}</div>
      </div>
    </div>
    </SettingsBackContext.Provider>
  );
}
