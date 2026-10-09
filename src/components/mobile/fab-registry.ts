import {
  Coins,
  MessageSquarePlus,
  Megaphone,
  Plus,
  Receipt,
  RefreshCw,
  Tag,
  TrendingDown,
  Upload,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Per-page mobile FAB registry. Pure data + pure functions (no "use client").
 * Keys are URL patterns: route groups "(x)" are stripped, "[x]" matches one segment.
 * Every page under src/app/(app) must have an entry (enforced by
 * tests/components/mobile/fab-registry-coverage.test.ts).
 */

export const FAB_HANDLER_KEYS = [
  "accounts.detail.add",
  "admin.announcements.new",
  "budgets.create",
  "categories.create",
  "family.invite",
  "feedback.send",
  "goals.create",
  "import.upload",
  "manage-accounts.add",
  "settings.categories.create",
  "rules.create",
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

const FALLBACK: FabEntry = { kind: "fallback" };

export const FAB_ROUTES: Record<string, FabEntry> = {
  "/account": FALLBACK,
  "/account/info": FALLBACK,
  "/account/security": FALLBACK,
  "/accounts": { kind: "route", label: "Add account", icon: Plus, href: "/accounts/new" },
  "/accounts/new": { kind: "hidden", reason: "is the create flow" },
  "/accounts/[id]": {
    kind: "handler",
    label: "New transaction",
    icon: Receipt,
    handlerKey: "accounts.detail.add",
    fallbackHref: "/transactions/new",
  },
  "/accounts/groups": { kind: "hidden", reason: "manage list; no create action" },
  "/admin": FALLBACK,
  "/admin/announcements": {
    kind: "handler",
    label: "New announcement",
    icon: Megaphone,
    handlerKey: "admin.announcements.new",
  },
  "/admin/api-log": FALLBACK,
  "/admin/diagnostics": FALLBACK,
  "/admin/email-inbox": FALLBACK,
  "/admin/env": { kind: "redirect" },
  "/admin/feedback": FALLBACK,
  "/admin/inbox": FALLBACK,
  "/admin/instance": FALLBACK,
  "/admin/integrations": FALLBACK,
  "/admin/price-cache": FALLBACK,
  "/admin/system": FALLBACK,
  "/api-docs": FALLBACK,
  "/budgets": { kind: "handler", label: "Add budget", icon: Plus, handlerKey: "budgets.create" },
  "/categories": {
    kind: "handler",
    label: "Add category",
    icon: Tag,
    handlerKey: "categories.create",
    fallbackHref: "/settings/categorization",
  },
  "/categories/[id]": FALLBACK,
  "/chat": { kind: "hidden", reason: "full-height composer" },
  "/connect": FALLBACK,
  "/dashboard": { kind: "route", label: "New transaction", icon: Plus, href: "/transactions/new" },
  "/dev/gallery": FALLBACK,
  "/family": { kind: "route", label: "Invite", icon: UserPlus, href: "/family/share" },
  "/family/accept": { kind: "hidden", reason: "one-shot invite-accept flow" },
  "/family/share": { kind: "handler", label: "Invite", icon: UserPlus, handlerKey: "family.invite" },
  "/feedback": { kind: "handler", label: "Send feedback", icon: MessageSquarePlus, handlerKey: "feedback.send" },
  "/fire": FALLBACK,
  "/goals": { kind: "handler", label: "Add goal", icon: Plus, handlerKey: "goals.create" },
  "/import": { kind: "handler", label: "Upload statement", icon: Upload, handlerKey: "import.upload" },
  "/import/pending": { kind: "route", label: "Upload statement", icon: Upload, href: "/import" },
  "/loans": { kind: "route", label: "Add loan", icon: Plus, href: "/loans/new" },
  "/loans/new": { kind: "hidden", reason: "is the create flow" },
  "/loans/[id]/edit": { kind: "hidden", reason: "is the edit flow" },
  "/manage-accounts": {
    kind: "handler",
    label: "Add another account",
    icon: UserPlus,
    handlerKey: "manage-accounts.add",
  },
  "/more": FALLBACK,
  "/portfolio": { kind: "route", label: "Add holding", icon: Plus, href: "/settings/investments" },
  "/portfolio/dividends": {
    kind: "route",
    label: "Record dividend",
    icon: Coins,
    href: "/portfolio/new/income-expense",
  },
  "/portfolio/new": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/new/buy": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/new/deposit": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/new/fx-conversion": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/new/in-kind-transfer": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/new/income-expense": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/new/sell": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/new/swap": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/new/withdrawal": { kind: "hidden", reason: "is the create flow" },
  "/portfolio/realized-gains": {
    kind: "route",
    label: "Record sale",
    icon: TrendingDown,
    href: "/portfolio/new/sell",
  },
  "/reports": FALLBACK,
  "/scenarios": FALLBACK,
  "/settings": FALLBACK,
  "/settings/about": FALLBACK,
  "/settings/account": FALLBACK,
  "/settings/backfill": FALLBACK,
  "/settings/backfill/[runId]": { kind: "route", label: "New run", icon: RefreshCw, href: "/settings/backfill" },
  "/settings/bank-feeds": FALLBACK,
  "/settings/categorization": {
    kind: "handler",
    label: "Add category",
    icon: Tag,
    handlerKey: "settings.categories.create",
  },
  "/settings/data": FALLBACK,
  "/settings/developer": FALLBACK,
  "/settings/display": FALLBACK,
  "/settings/dropdown-order": FALLBACK,
  "/settings/general": FALLBACK,
  "/settings/holding-accounts": { kind: "redirect" },
  "/settings/import": FALLBACK,
  "/settings/import/reconcile-visibility": FALLBACK,
  "/settings/integrations": FALLBACK,
  "/settings/investments": {
    kind: "route",
    label: "Add security",
    icon: Plus,
    href: "/settings/investments/securities/new",
  },
  "/settings/investments/accounts/[id]/link": { kind: "hidden", reason: "is the create flow" },
  "/settings/investments/cash-sleeves/new": { kind: "hidden", reason: "is the create flow" },
  "/settings/investments/securities/new": { kind: "hidden", reason: "is the create flow" },
  "/settings/investments/securities/[id]/edit": { kind: "hidden", reason: "is the edit flow" },
  "/settings/investments/securities/[id]/link": { kind: "hidden", reason: "is the create flow" },
  "/settings/investments/securities/[id]/prices": { kind: "hidden", reason: "is the edit flow" },
  "/settings/reconciliation": FALLBACK,
  "/settings/rules": { kind: "handler", label: "Add rule", icon: Zap, handlerKey: "rules.create" },
  "/settings/securities": { kind: "redirect" },
  "/subscriptions": { kind: "route", label: "Add subscription", icon: Plus, href: "/subscriptions/new" },
  "/subscriptions/new": { kind: "hidden", reason: "is the create flow" },
  "/subscriptions/[id]/edit": { kind: "hidden", reason: "is the edit flow" },
  "/tax": FALLBACK,
  "/transactions": { kind: "route", label: "Add transaction", icon: Plus, href: "/transactions/new" },
  "/transactions/audit": FALLBACK,
  "/transactions/new": { kind: "hidden", reason: "is the create flow" },
  "/transactions/search": { kind: "hidden", reason: "sticky bottom Reset/Search bar" },
  "/whats-new": FALLBACK,
};

export interface FabMatch {
  pattern: string;
  entry: FabEntry;
}

const DYNAMIC_PATTERNS = Object.keys(FAB_ROUTES).filter((k) => k.includes("["));

function hasRoute(pattern: string): boolean {
  return Object.prototype.hasOwnProperty.call(FAB_ROUTES, pattern);
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function segmentMatches(patternSeg: string, seg: string): boolean {
  if (/^\[[^\]]+\]$/.test(patternSeg)) return seg.length > 0;
  return patternSeg === seg;
}

/** Exact match first, then dynamic `[x]` patterns. Trailing slash is ignored. */
export function matchFabRoute(pathname: string): FabMatch | null {
  const path = normalizePath(pathname);
  if (hasRoute(path)) return { pattern: path, entry: FAB_ROUTES[path] };

  const segs = path.split("/");
  for (const pattern of DYNAMIC_PATTERNS) {
    const patternSegs = pattern.split("/");
    if (patternSegs.length !== segs.length) continue;
    if (patternSegs.every((p, i) => segmentMatches(p, segs[i]))) {
      return { pattern, entry: FAB_ROUTES[pattern] };
    }
  }
  return null;
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
