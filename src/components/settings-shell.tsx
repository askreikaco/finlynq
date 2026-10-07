"use client";

/**
 * Settings left-nav shell — wraps every /settings/* sub-page via
 * src/app/(app)/settings/layout.tsx (issue #57), and /connect (Integrations
 * rendered in place with "Connect your AI" open). The 1573-line monolith was split into 8 grouped
 * sub-pages; this layout is what makes them feel like one section.
 *
 * - md+ : vertical left nav (~220px) + content slot.
 * - <md : horizontal scrollable pill row above the content.
 *
 * Active state mirrors the global app sidebar idiom (`pf-app/src/components/nav.tsx`):
 * amber left-edge marker + `bg-white/[0.08]` highlight.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { getEntriesBySurface, ALIASES } from "@/lib/nav-config";
import { BackButton } from "@/components/mobile/back-button";

type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Generate NAV_ITEMS from the registry's settings surface.
 * Order: General, Categories, Reconciliation, Investments, Integrations, Developer, About.
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
        icon: entry.icon,
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

function activeHref(pathname: string): string {
  for (const { prefix, group } of ROUTE_GROUP) {
    if (pathname.startsWith(prefix)) return group;
  }
  // Bare /settings -> redirect handles it, but also light up General as a
  // sensible fallback if the redirect hasn't landed yet on the first paint.
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

export function SettingsShell({ children, hubBackHref }: { children: React.ReactNode; hubBackHref?: string }) {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const isHub = pathname === "/settings";

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      {/* Mobile pill row — hidden on hub page */}
      {!isHub && (
        <nav
          aria-label="Settings sections"
          className="md:hidden -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        >
          <div className="flex gap-2 overflow-x-auto pb-2">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Desktop left nav — hidden on hub page */}
      {!isHub && (
        <aside
          aria-label="Settings sections"
          className="hidden md:block w-56 shrink-0"
        >
          <div className="sticky top-[calc(1.5rem+var(--sat))]">
            <p className="px-3 mb-2 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
              Settings
            </p>
            <nav className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === active;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group/link relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                      isActive
                        ? "bg-white/[0.08] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-primary shadow-[0_0_8px_2px] shadow-primary/30" />
                    )}
                    <item.icon
                      className={cn(
                        "h-[16px] w-[16px] shrink-0 transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground/70 group-hover/link:text-foreground"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>
      )}

      {/* Content slot — `min-w-0` lets the flex item shrink below intrinsic
          content width; `overflow-x-auto` makes wide tables (issue #88)
          scroll inside the slot instead of pushing the page wider. */}
      <div className="flex-1 min-w-0 overflow-x-auto">
        {hubBackHref && !isHub && (
          <BackButton href={hubBackHref} label="Back to Settings" />
        )}
        {children}
      </div>
    </div>
  );
}
