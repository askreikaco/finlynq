"use client";

/**
 * Back target from the nav registry. Level 1 = a tab (no parent) or the More page itself; each
 * `parent` step adds one. `href` is the back target (null on level 1); `level` is the level of the
 * CURRENT page, so PageHeader shows a back button when level >= 2.
 *
 * Matching is by path prefix, longest registry path wins: /accounts/5 -> /accounts,
 * /transactions/9/edit -> /transactions, /portfolio/new/buy -> /portfolio/new (registry entry).
 * Routes with no registry prefix (e.g. /foo) resolve to null.
 */

import { usePathname } from "next/navigation";
import { NAV_REGISTRY, getNavEntry, type NavPageEntry } from "@/lib/nav-config";

export interface BackTarget {
  href: string | null;
  level: number;
}

// Entries with a query string (e.g. /import?tab=reconcile) are menu shortcuts, never a route.
const ROUTE_ENTRIES = NAV_REGISTRY.filter((e) => !e.path.includes("?"));

function parentOf(entry: NavPageEntry): NavPageEntry | undefined {
  return entry.parent ? getNavEntry(entry.parent) : undefined;
}

/** Number of levels from the top: a tab is 1, its child 2, and so on. Cycles stop at the first repeat. */
export function levelOf(entry: NavPageEntry): number {
  let level = 1;
  const seen = new Set<string>([entry.path]);
  let cur = parentOf(entry);
  while (cur && !seen.has(cur.path)) {
    seen.add(cur.path);
    level += 1;
    cur = parentOf(cur);
  }
  return level;
}

/** Pure resolver (the hook is a thin wrapper). Returns null when no registry entry owns the path. */
export function resolveBackTarget(pathname: string | null | undefined): BackTarget | null {
  if (!pathname) return null;
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  let owner: NavPageEntry | undefined;
  for (const e of ROUTE_ENTRIES) {
    if (clean === e.path || clean.startsWith(e.path + "/")) {
      if (!owner || e.path.length > owner.path.length) owner = e;
    }
  }
  if (!owner) return null;
  const level = levelOf(owner);
  if (clean === owner.path) {
    return { href: parentOf(owner)?.path ?? null, level };
  }
  // A page below the owner (dynamic segment or unregistered child): its parent is the owner.
  return { href: owner.path, level: level + 1 };
}

/** Back target for the current route. */
export function useBackTarget(): BackTarget | null {
  return resolveBackTarget(usePathname());
}
