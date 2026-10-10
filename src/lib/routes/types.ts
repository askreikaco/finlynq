import type { FabEntry } from "@/components/mobile/fab-registry";

/** One file per route family under ./families. */
export type RouteFamily =
  | "goals"
  | "loans"
  | "subscriptions"
  | "budgets"
  | "categories"
  | "rules"
  | "investments"
  | "accounts"
  | "transactions"
  | "portfolio"
  | "reports"
  | "hubs"
  | "settings"
  | "admin"
  | "family-import"
  | "misc"
  | "aliases";

export type RouteKind = "list" | "form" | "detail" | "hub" | "report" | "section" | "admin" | "tool" | "alias";

/**
 * One app route. `pattern` uses "[x]" for one dynamic segment (matching rules in ./index.ts).
 * `fullScreen` true = the compact bottom tab bar is hidden on this route (nav.tsx isTabBarHidden).
 */
export interface RouteDef {
  pattern: string;
  family: RouteFamily;
  kind: RouteKind;
  fab: FabEntry;
  fullScreen?: boolean;
}
