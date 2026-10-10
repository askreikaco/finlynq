import { Plus, type LucideIcon } from "lucide-react";
import { ALL_ROUTES, matchRoute } from "@/lib/routes";

/**
 * Per-page mobile FAB registry. Pure data + pure functions (no "use client").
 * Keys are URL patterns: route groups "(x)" are stripped, "[x]" matches one segment.
 * Every page under src/app/(app) must have an entry (enforced by
 * tests/components/mobile/fab-registry-coverage.test.ts).
 */

export const FAB_HANDLER_KEYS = [
  "accounts.detail.add",
  "admin.announcements.new",
  "family.invite",
  "feedback.send",
  "import.upload",
  "manage-accounts.add",
] as const;

export type FabHandlerKey = (typeof FAB_HANDLER_KEYS)[number];

/** What a page registers through usePageFab. Label/icon override the registry entry. */
export interface FabHandlerRegistration {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  icon?: LucideIcon;
}

export type FabEntry =
  | { kind: "route"; label: string; icon: LucideIcon; href: string }
  | { kind: "handler"; label: string; icon: LucideIcon; handlerKey: FabHandlerKey; fallbackHref?: string }
  | { kind: "fallback" }
  | { kind: "hidden"; reason: string }
  | { kind: "redirect" };

export interface FabDefault {
  label: string;
  icon: LucideIcon;
  href: string;
}

export const DEFAULT_FAB: FabDefault = {
  label: "New transaction",
  icon: Plus,
  href: "/transactions/new",
};

/** Derived from the route-family registry (src/lib/routes/families/*.ts). */
export const FAB_ROUTES: Record<string, FabEntry> = Object.fromEntries(
  ALL_ROUTES.map((r) => [r.pattern, r.fab]),
);

export interface FabMatch {
  pattern: string;
  entry: FabEntry;
}

/** Exact match first, then dynamic `[x]` patterns. Trailing slash is ignored. */
export function matchFabRoute(pathname: string): FabMatch | null {
  const route = matchRoute(pathname);
  return route ? { pattern: route.pattern, entry: route.fab } : null;
}

export type FabResolved =
  | { type: "link"; href: string; label: string; icon: LucideIcon; pattern: string | null }
  | { type: "button"; onClick: () => void; disabled: boolean; label: string; icon: LucideIcon; pattern: string };

function link(href: string, label: string, icon: LucideIcon, pattern: string | null): FabResolved {
  return { type: "link", href, label, icon, pattern };
}

/**
 * Decide what the FAB shows on a path. null = hidden.
 * - hidden / redirect -> null
 * - fallback or unmatched path -> DEFAULT_FAB link
 * - route -> link
 * - handler -> button when registered; else fallbackHref link; else null
 */
export function resolveFab(
  pathname: string,
  handlers: ReadonlyMap<FabHandlerKey, FabHandlerRegistration>,
): FabResolved | null {
  const match = matchFabRoute(pathname);
  if (!match) return link(DEFAULT_FAB.href, DEFAULT_FAB.label, DEFAULT_FAB.icon, null);

  const { pattern, entry } = match;
  switch (entry.kind) {
    case "hidden":
    case "redirect":
      return null;
    case "fallback":
      return link(DEFAULT_FAB.href, DEFAULT_FAB.label, DEFAULT_FAB.icon, pattern);
    case "route":
      return link(entry.href, entry.label, entry.icon, pattern);
    case "handler": {
      const reg = handlers.get(entry.handlerKey);
      if (reg) {
        return {
          type: "button",
          onClick: reg.onClick,
          disabled: reg.disabled ?? false,
          label: reg.label ?? entry.label,
          icon: reg.icon ?? entry.icon,
          pattern,
        };
      }
      if (entry.fallbackHref) return link(entry.fallbackHref, entry.label, entry.icon, pattern);
      return null;
    }
  }
}

/**
 * "src/app/(app)/admin/(env)/api-log/page.tsx" -> "/admin/api-log".
 * Drops route groups "(x)"; an empty path maps to "/".
 */
export function routeFromPageFile(rel: string): string {
  const parts = rel
    .replace(/\\/g, "/")
    .replace(/^src\/app\/\(app\)\//, "")
    .replace(/\/?page\.tsx$/, "")
    .split("/")
    .filter((s) => s !== "" && !/^\(.*\)$/.test(s));
  return "/" + parts.join("/");
}
