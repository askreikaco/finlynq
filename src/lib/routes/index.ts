import type { RouteDef } from "./types";
import { ROUTES as goals } from "./families/goals";
import { ROUTES as loans } from "./families/loans";
import { ROUTES as subscriptions } from "./families/subscriptions";
import { ROUTES as budgets } from "./families/budgets";
import { ROUTES as categories } from "./families/categories";
import { ROUTES as rules } from "./families/rules";
import { ROUTES as investments } from "./families/investments";
import { ROUTES as accounts } from "./families/accounts";
import { ROUTES as transactions } from "./families/transactions";
import { ROUTES as portfolio } from "./families/portfolio";
import { ROUTES as reports } from "./families/reports";
import { ROUTES as hubs } from "./families/hubs";
import { ROUTES as settings } from "./families/settings";
import { ROUTES as admin } from "./families/admin";
import { ROUTES as familyImport } from "./families/family-import";
import { ROUTES as misc } from "./families/misc";
import { ROUTES as aliases } from "./families/aliases";

export type { RouteDef, RouteFamily, RouteKind } from "./types";

/** Every app route, in family order. Order inside a family is the original FAB_ROUTES key order. */
export const ALL_ROUTES: RouteDef[] = [
  ...goals,
  ...loans,
  ...subscriptions,
  ...budgets,
  ...categories,
  ...rules,
  ...investments,
  ...accounts,
  ...transactions,
  ...portfolio,
  ...reports,
  ...hubs,
  ...settings,
  ...admin,
  ...familyImport,
  ...misc,
  ...aliases,
];

const BY_PATTERN = new Map<string, RouteDef>(ALL_ROUTES.map((r) => [r.pattern, r]));
const DYNAMIC_ROUTES = ALL_ROUTES.filter((r) => r.pattern.includes("["));

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function segmentMatches(patternSeg: string, seg: string): boolean {
  if (/^\[[^\]]+\]$/.test(patternSeg)) return seg.length > 0;
  return patternSeg === seg;
}

/** Exact match first, then dynamic `[x]` patterns in registry order. Trailing slash is ignored. */
export function matchRoute(pathname: string): RouteDef | null {
  const path = normalizePath(pathname);
  const exact = BY_PATTERN.get(path);
  if (exact) return exact;

  const segs = path.split("/");
  for (const route of DYNAMIC_ROUTES) {
    const patternSegs = route.pattern.split("/");
    if (patternSegs.length !== segs.length) continue;
    if (patternSegs.every((p, i) => segmentMatches(p, segs[i]))) return route;
  }
  return null;
}

/** True when the route is a full-screen entry/edit flow (compact tab bar hidden). Unmatched paths are false. */
export function isFullScreenRoute(pathname: string): boolean {
  return matchRoute(pathname)?.fullScreen ?? false;
}
