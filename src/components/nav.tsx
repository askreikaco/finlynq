"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getEntriesBySurface, getMobileBarItemsSorted } from "@/lib/nav-config";
import { isFullScreenRoute } from "@/lib/routes";
import { useNavUnread } from "@/components/nav-unread";

type NavItem = { href: string; label: string; icon: LucideIcon; color: string; mode?: "prod" | "dev"; activePrefixes?: string[]; flag?: "family" | "announcements" | "feedback" | "instance" };

// Single-accent system: active items glow amber (`text-primary`) to match the
// landing's restraint. Inactive icons use the sidebar-foreground muted tones.
const ACTIVE_ACCENT = "text-primary";

/**
 * Generate navGroups from the registry, filtering for sidebar surface.
 * Groups sidebar items by their group field, excluding admin/settings.
 */
function generateNavGroups(): { label: string; items: NavItem[] }[] {
  const sidebarEntries = getEntriesBySurface("sidebar")
    .filter((e) => !e.adminOnly && e.group !== "Tools" && e.group !== "Settings" && e.group !== "Admin");

  // Group by group field
  const groups = new Map<string, NavItem[]>();
  for (const entry of sidebarEntries) {
    if (!groups.has(entry.group)) {
      groups.set(entry.group, []);
    }
    const item: NavItem = {
      href: entry.path,
      label: entry.label,
      icon: entry.icon,
      color: ACTIVE_ACCENT,
      mode: entry.mode === "dev" ? "dev" : "prod",
      activePrefixes: entry.activePrefixes,
      flag: entry.flag,
    };
    groups.get(entry.group)!.push(item);
  }

  // Order by group name: empty (top) first, then Tracking, Wealth, Analysis, Planning
  const order = ["Top", "Tracking", "Wealth", "Analysis", "Planning"];
  const result = order
    .filter((g) => groups.has(g))
    .map((g) => ({ label: g === "Top" ? "" : g, items: groups.get(g)! }));

  return result;
}

/**
 * Generate adminLinks from the registry.
 */
function generateAdminLinks(): NavItem[] {
  return getEntriesBySurface("sidebar")
    .filter((e) => e.adminOnly)
    .map((entry) => ({
      href: entry.path,
      label: entry.label,
      icon: entry.icon,
      color: ACTIVE_ACCENT,
      mode: entry.mode === "dev" ? "dev" : "prod",
      activePrefixes: entry.activePrefixes,
      flag: entry.flag,
    }));
}

/**
 * Generate toolLinks from the registry (sidebar Tools entries).
 */
function generateToolLinks(): NavItem[] {
  return getEntriesBySurface("sidebar")
    .filter((e) => !e.adminOnly && e.group === "Tools")
    .map((entry) => ({
      href: entry.path,
      label: entry.label,
      icon: entry.icon,
      color: ACTIVE_ACCENT,
      mode: entry.mode === "dev" ? "dev" : "prod",
      flag: entry.flag,
    }));
}

/**
 * Generate mobileBarItems from the registry, ordered by tab.order field.
 */
function generateMobileBarItems(): NavItem[] {
  const sortedEntries = getMobileBarItemsSorted();

  const items: NavItem[] = sortedEntries.map((entry) => ({
    href: entry.path,
    label: entry.label,
    icon: entry.icon,
    color: ACTIVE_ACCENT,
  }));

  return items;
}

export const navGroups: { label: string; items: NavItem[] }[] = generateNavGroups();
export const adminLinks: NavItem[] = generateAdminLinks();
const toolLinks: NavItem[] = generateToolLinks();
export const mobileBarItems: NavItem[] = generateMobileBarItems();

export const allFlatItems = navGroups.flatMap((g) => g.items).concat(toolLinks).concat(adminLinks);

/**
 * Determine which nav item should be active by finding the longest matching
 * prefix across all sidebar, tool, and admin items. An item is active only if
 * it owns the longest match. Ties preserve the same item (portfolio case).
 */
export function pickActiveHref(
  pathname: string,
  items: NavItem[] = allFlatItems
): NavItem | null {
  let longestMatch = "";
  let activeItem: NavItem | null = null;

  for (const item of items) {
    // Build the set of prefixes to check for this item
    const prefixes = item.activePrefixes && item.activePrefixes.length > 0
      ? item.activePrefixes
      : [item.href];

    for (const prefix of prefixes) {
      const isMatch = pathname === prefix || pathname.startsWith(prefix + "/");
      if (isMatch && prefix.length > longestMatch.length) {
        longestMatch = prefix;
        activeItem = item;
      }
    }
  }

  return activeItem;
}

// Full-screen entry and edit flows hide the compact tab bar. The flag lives on each route in
// src/lib/routes/families/*.ts (fullScreen). The rail is never hidden: it sits left of the content.
/** True when the compact bottom bar is hidden on this route. The rail is never hidden. */
export function isTabBarHidden(pathname: string): boolean {
  return isFullScreenRoute(pathname);
}

const isTabActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

// One tab list for both layouts: the registry tabs (mobileBar surface, tab.order), then More.
const TAB_LINKS: { href: string; label: string; icon: LucideIcon; color?: string; ariaLabel?: string }[] = [
  ...mobileBarItems.map((i) => ({ href: i.href, label: i.label, icon: i.icon, color: i.color })),
  { href: "/more", label: "More", icon: MoreHorizontal, ariaLabel: "More" },
];

/**
 * App navigation: one tab list, two layouts. Below 640px (`regular:` is a viewport query) the
 * floating glass bottom bar. From 640px up a fixed left rail with the same tabs in the same order.
 * No groups, collapse toggle, admin group or account switcher: admin and settings live under More.
 */
export const AppTabs = memo(function AppTabs() {
  const pathname = usePathname();
  const nav = useNavUnread();
  const moreUnread = nav.announcementsUnread + nav.feedbackUnread;
  const barHidden = isTabBarHidden(pathname);
  const moreActive = !mobileBarItems.some((i) => isTabActive(pathname, i.href));
  const tabActive = (href: string) => (href === "/more" ? moreActive : isTabActive(pathname, href));
  // One unread dot, on the More tab only, in both layouts.
  const moreDot = (href: string) =>
    href === "/more" && moreUnread > 0 ? (
      <span data-testid="more-unread-dot" aria-hidden="true" className="absolute -right-1 -top-1 size-2 rounded-full bg-primary" />
    ) : null;
  // Text alternative for that dot (the dot itself is aria-hidden): same rule in both layouts.
  const moreSrText = (href: string) =>
    href === "/more" && moreUnread > 0 ? <span className="sr-only">, has unread items</span> : null;

  return (
    <>
      {!barHidden && (
        <nav aria-label="Mobile navigation" className="regular:hidden fixed z-50 mobile-glass-bar bottom-[max(12px,var(--sab))] left-[calc(16px+var(--sal))] right-[calc(16px+var(--sar))] h-16 rounded-[28px]">
          <div className="flex h-full items-stretch justify-around p-1.5" data-testid="mobile-bar-row">
            {TAB_LINKS.map((item) => {
              const isActive = tabActive(item.href);
              return (
                <Link
                  key={item.href}
                  aria-label={item.href === "/more" && moreUnread > 0 ? "More, has unread items" : item.ariaLabel}
                  aria-current={isActive ? "page" : undefined}
                  href={item.href}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-0 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    isActive ? "mobile-glass-pill text-tab-active" : "text-tab-inactive"
                  )}
                >
                  <span className="relative inline-flex">
                    <item.icon className={cn("size-6", isActive && item.color)} />
                    {moreDot(item.href)}
                  </span>
                  <span className="mobile-tab-label block max-w-full truncate">{item.label}</span>{moreSrText(item.href)}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <nav
        aria-label="Main navigation"
        data-testid="app-rail"
        className="hidden regular:flex fixed inset-y-0 left-0 z-50 w-[calc(5rem+var(--sal))] flex-col gap-1 overflow-y-auto overscroll-contain border-r border-sidebar-border/50 bg-sidebar/90 pl-[var(--sal)] pr-2 pt-[calc(var(--sat)+0.75rem)] pb-[calc(var(--sab)+0.75rem)] backdrop-blur-xl"
      >
        {TAB_LINKS.map((item) => {
          const isActive = tabActive(item.href);
          return (
            <Link
              key={item.href}
              aria-current={isActive ? "page" : undefined}
              href={item.href}
              className={cn(
                "flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                isActive ? "mobile-glass-pill text-tab-active" : "text-tab-inactive"
              )}
            >
              <span className="relative inline-flex">
                <item.icon className={cn("size-6", isActive && item.color)} />
                {moreDot(item.href)}
              </span>
              <span className="mobile-tab-label block max-w-full truncate">{item.label}</span>{moreSrText(item.href)}
            </Link>
          );
        })}
      </nav>
    </>
  );
});
