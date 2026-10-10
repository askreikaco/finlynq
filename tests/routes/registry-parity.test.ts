import { describe, it, expect } from "vitest";
import * as Lucide from "lucide-react";
import { FAB_ROUTES, matchFabRoute } from "@/components/mobile/fab-registry";
import { isTabBarHidden } from "@/components/nav";
import { ALL_ROUTES, matchRoute } from "@/lib/routes";

// Snapshot taken before the route-family registry (C-04) moved any entry. Icons are stored by lucide export name.
// fabRoutes: FAB_ROUTES values. tabBarHidden: isTabBarHidden for every route (sample ids substituted) plus 10 sample paths.
// matchPattern: matchFabRoute(path)?.pattern for the same paths.
const SNAPSHOT = {
  "fabRoutes": {
    "/account": {
      "kind": "fallback"
    },
    "/account/info": {
      "kind": "fallback"
    },
    "/account/security": {
      "kind": "fallback"
    },
    "/accounts": {
      "kind": "route",
      "label": "Add account",
      "href": "/accounts/new",
      "icon": "LucidePlus"
    },
    "/accounts/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/accounts/[id]/edit": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/accounts/[id]": {
      "kind": "handler",
      "label": "New transaction",
      "handlerKey": "accounts.detail.add",
      "fallbackHref": "/transactions/new",
      "icon": "LucideReceipt"
    },
    "/accounts/groups": {
      "kind": "hidden",
      "reason": "manage list; no create action"
    },
    "/admin": {
      "kind": "fallback"
    },
    "/admin/announcements": {
      "kind": "handler",
      "label": "New announcement",
      "handlerKey": "admin.announcements.new",
      "icon": "LucideMegaphone"
    },
    "/admin/api-log": {
      "kind": "fallback"
    },
    "/admin/diagnostics": {
      "kind": "fallback"
    },
    "/admin/email-inbox": {
      "kind": "fallback"
    },
    "/admin/feedback": {
      "kind": "fallback"
    },
    "/admin/inbox": {
      "kind": "fallback"
    },
    "/admin/instance": {
      "kind": "fallback"
    },
    "/admin/integrations": {
      "kind": "fallback"
    },
    "/admin/price-cache": {
      "kind": "fallback"
    },
    "/admin/system": {
      "kind": "fallback"
    },
    "/api-docs": {
      "kind": "fallback"
    },
    "/budgets": {
      "kind": "route",
      "label": "Add budget",
      "href": "/budgets/new",
      "icon": "LucidePlus"
    },
    "/budgets/move-money": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/budgets/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/budgets/templates/apply": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/budgets/templates/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/categories": {
      "kind": "route",
      "label": "Add category",
      "href": "/categories/new",
      "icon": "LucideTag"
    },
    "/categories/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/categories/[id]": {
      "kind": "fallback"
    },
    "/categories/[id]/edit": {
      "kind": "hidden",
      "reason": "is the rename flow"
    },
    "/chat": {
      "kind": "hidden",
      "reason": "full-height composer"
    },
    "/connect": {
      "kind": "fallback"
    },
    "/dashboard": {
      "kind": "route",
      "label": "New transaction",
      "href": "/transactions/new",
      "icon": "LucidePlus"
    },
    "/dev/gallery": {
      "kind": "fallback"
    },
    "/family": {
      "kind": "route",
      "label": "Invite",
      "href": "/family/share",
      "icon": "LucideUserPlus"
    },
    "/family/accept": {
      "kind": "hidden",
      "reason": "one-shot invite-accept flow"
    },
    "/family/share": {
      "kind": "handler",
      "label": "Invite",
      "handlerKey": "family.invite",
      "icon": "LucideUserPlus"
    },
    "/feedback": {
      "kind": "handler",
      "label": "Send feedback",
      "handlerKey": "feedback.send",
      "icon": "LucideMessageSquarePlus"
    },
    "/fire": {
      "kind": "fallback"
    },
    "/goals": {
      "kind": "route",
      "label": "Add goal",
      "href": "/goals/new",
      "icon": "LucidePlus"
    },
    "/goals/[id]/edit": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/goals/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/import": {
      "kind": "handler",
      "label": "Upload statement",
      "handlerKey": "import.upload",
      "icon": "LucideUpload"
    },
    "/import/pending": {
      "kind": "route",
      "label": "Upload statement",
      "href": "/import",
      "icon": "LucideUpload"
    },
    "/loans": {
      "kind": "route",
      "label": "Add loan",
      "href": "/loans/new",
      "icon": "LucidePlus"
    },
    "/loans/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/loans/[id]/edit": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/manage-accounts": {
      "kind": "handler",
      "label": "Add another account",
      "handlerKey": "manage-accounts.add",
      "icon": "LucideUserPlus"
    },
    "/more": {
      "kind": "fallback"
    },
    "/portfolio": {
      "kind": "route",
      "label": "Add holding",
      "href": "/settings/investments",
      "icon": "LucidePlus"
    },
    "/portfolio/dividends": {
      "kind": "route",
      "label": "Record dividend",
      "href": "/portfolio/new/income-expense",
      "icon": "Coins"
    },
    "/portfolio/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/portfolio/new/[op]": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/portfolio/realized-gains": {
      "kind": "route",
      "label": "Record sale",
      "href": "/portfolio/new/sell",
      "icon": "LucideTrendingDown"
    },
    "/reports": {
      "kind": "fallback"
    },
    "/scenarios": {
      "kind": "fallback"
    },
    "/settings": {
      "kind": "fallback"
    },
    "/settings/about": {
      "kind": "fallback"
    },
    "/settings/backfill": {
      "kind": "fallback"
    },
    "/settings/backfill/[runId]": {
      "kind": "route",
      "label": "New run",
      "href": "/settings/backfill",
      "icon": "LucideRefreshCw"
    },
    "/settings/bank-feeds": {
      "kind": "fallback"
    },
    "/settings/categorization": {
      "kind": "route",
      "label": "Add category",
      "href": "/categories/new",
      "icon": "LucideTag"
    },
    "/settings/data": {
      "kind": "fallback"
    },
    "/settings/developer": {
      "kind": "fallback"
    },
    "/settings/display": {
      "kind": "fallback"
    },
    "/settings/dropdown-order": {
      "kind": "fallback"
    },
    "/settings/general": {
      "kind": "fallback"
    },
    "/settings/import": {
      "kind": "fallback"
    },
    "/settings/import/reconcile-visibility": {
      "kind": "fallback"
    },
    "/settings/integrations": {
      "kind": "fallback"
    },
    "/settings/investments": {
      "kind": "route",
      "label": "Add security",
      "href": "/settings/investments/securities/new",
      "icon": "LucidePlus"
    },
    "/settings/investments/accounts/[id]/link": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/settings/investments/cash-sleeves/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/settings/investments/securities/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/settings/investments/securities/[id]/edit": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/settings/investments/securities/[id]/link": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/settings/investments/securities/[id]/prices": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/settings/reconciliation": {
      "kind": "fallback"
    },
    "/settings/rules": {
      "kind": "route",
      "label": "Add rule",
      "href": "/settings/rules/new",
      "icon": "LucideZap"
    },
    "/settings/rules/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/settings/rules/[id]/edit": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/subscriptions": {
      "kind": "route",
      "label": "Add subscription",
      "href": "/subscriptions/new",
      "icon": "LucidePlus"
    },
    "/subscriptions/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/subscriptions/[id]/edit": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/tax": {
      "kind": "fallback"
    },
    "/transactions": {
      "kind": "route",
      "label": "Add transaction",
      "href": "/transactions/new",
      "icon": "LucidePlus"
    },
    "/transactions/audit": {
      "kind": "fallback"
    },
    "/transactions/new": {
      "kind": "hidden",
      "reason": "is the create flow"
    },
    "/transactions/[id]/edit": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/transactions/transfer/[linkId]/edit": {
      "kind": "hidden",
      "reason": "is the edit flow"
    },
    "/transactions/[id]/split": {
      "kind": "hidden",
      "reason": "is the split flow"
    },
    "/transactions/search": {
      "kind": "hidden",
      "reason": "sticky bottom Reset/Search bar"
    },
    "/whats-new": {
      "kind": "fallback"
    }
  },
  "tabBarHidden": {
    "/account": false,
    "/account/info": false,
    "/account/security": false,
    "/accounts": false,
    "/accounts/7": false,
    "/accounts/7/edit": true,
    "/accounts/groups": false,
    "/accounts/new": true,
    "/admin": false,
    "/admin/announcements": false,
    "/admin/api-log": false,
    "/admin/diagnostics": false,
    "/admin/email-inbox": false,
    "/admin/env": false,
    "/admin/feedback": false,
    "/admin/inbox": false,
    "/admin/instance": false,
    "/admin/integrations": false,
    "/admin/price-cache": false,
    "/admin/system": false,
    "/api-docs": false,
    "/budgets": false,
    "/budgets/move-money": true,
    "/budgets/new": true,
    "/budgets/templates/apply": false,
    "/budgets/templates/new": true,
    "/categories": false,
    "/categories/7": false,
    "/categories/7/edit": true,
    "/categories/new": true,
    "/chat": false,
    "/connect": false,
    "/dashboard": false,
    "/dev/gallery": false,
    "/family": false,
    "/family/accept": false,
    "/family/share": false,
    "/feedback": false,
    "/fire": false,
    "/goals": false,
    "/goals/7/edit": true,
    "/goals/new": true,
    "/import": false,
    "/import/pending": false,
    "/loans": false,
    "/loans/3/edit": true,
    "/loans/7/edit": true,
    "/loans/new": true,
    "/manage-accounts": false,
    "/more": false,
    "/portfolio": false,
    "/portfolio/dividends": false,
    "/portfolio/new": false,
    "/portfolio/new/buy": true,
    "/portfolio/new/deposit": true,
    "/portfolio/new/fx-conversion": true,
    "/portfolio/new/in-kind-transfer": true,
    "/portfolio/new/income-expense": true,
    "/portfolio/new/sell": true,
    "/portfolio/new/swap": true,
    "/portfolio/new/withdrawal": true,
    "/portfolio/realized-gains": false,
    "/reports": false,
    "/scenarios": false,
    "/settings": false,
    "/settings/about": false,
    "/settings/account": false,
    "/settings/backfill": false,
    "/settings/backfill/7": false,
    "/settings/bank-feeds": false,
    "/settings/categorization": false,
    "/settings/data": false,
    "/settings/developer": false,
    "/settings/display": false,
    "/settings/dropdown-order": false,
    "/settings/general": false,
    "/settings/holding-accounts": false,
    "/settings/import": false,
    "/settings/import/reconcile-visibility": false,
    "/settings/integrations": false,
    "/settings/investments": false,
    "/settings/investments/accounts/7/link": true,
    "/settings/investments/cash-sleeves/new": true,
    "/settings/investments/securities/5/prices": true,
    "/settings/investments/securities/7/edit": true,
    "/settings/investments/securities/7/link": true,
    "/settings/investments/securities/7/prices": true,
    "/settings/investments/securities/new": true,
    "/settings/reconciliation": false,
    "/settings/rules": false,
    "/settings/rules/7/edit": true,
    "/settings/rules/9/edit": true,
    "/settings/rules/new": true,
    "/settings/securities": false,
    "/subscriptions": false,
    "/subscriptions/7/edit": true,
    "/subscriptions/new": true,
    "/tax": false,
    "/transactions": false,
    "/transactions/7/edit": true,
    "/transactions/7/split": true,
    "/transactions/audit": false,
    "/transactions/new": true,
    "/transactions/search": false,
    "/transactions/transfer/7/edit": true,
    "/transactions/transfer/tr-9/edit": true,
    "/whats-new": false
  },
  "matchPattern": {
    "/account": "/account",
    "/account/info": "/account/info",
    "/account/security": "/account/security",
    "/accounts": "/accounts",
    "/accounts/7": "/accounts/[id]",
    "/accounts/7/edit": "/accounts/[id]/edit",
    "/accounts/groups": "/accounts/groups",
    "/accounts/new": "/accounts/new",
    "/admin": "/admin",
    "/admin/announcements": "/admin/announcements",
    "/admin/api-log": "/admin/api-log",
    "/admin/diagnostics": "/admin/diagnostics",
    "/admin/email-inbox": "/admin/email-inbox",
    "/admin/env": null,
    "/admin/feedback": "/admin/feedback",
    "/admin/inbox": "/admin/inbox",
    "/admin/instance": "/admin/instance",
    "/admin/integrations": "/admin/integrations",
    "/admin/price-cache": "/admin/price-cache",
    "/admin/system": "/admin/system",
    "/api-docs": "/api-docs",
    "/budgets": "/budgets",
    "/budgets/move-money": "/budgets/move-money",
    "/budgets/new": "/budgets/new",
    "/budgets/templates/apply": "/budgets/templates/apply",
    "/budgets/templates/new": "/budgets/templates/new",
    "/categories": "/categories",
    "/categories/7": "/categories/[id]",
    "/categories/7/edit": "/categories/[id]/edit",
    "/categories/new": "/categories/new",
    "/chat": "/chat",
    "/connect": "/connect",
    "/dashboard": "/dashboard",
    "/dev/gallery": "/dev/gallery",
    "/family": "/family",
    "/family/accept": "/family/accept",
    "/family/share": "/family/share",
    "/feedback": "/feedback",
    "/fire": "/fire",
    "/goals": "/goals",
    "/goals/7/edit": "/goals/[id]/edit",
    "/goals/new": "/goals/new",
    "/import": "/import",
    "/import/pending": "/import/pending",
    "/loans": "/loans",
    "/loans/3/edit": "/loans/[id]/edit",
    "/loans/7/edit": "/loans/[id]/edit",
    "/loans/new": "/loans/new",
    "/manage-accounts": "/manage-accounts",
    "/more": "/more",
    "/portfolio": "/portfolio",
    "/portfolio/dividends": "/portfolio/dividends",
    "/portfolio/new": "/portfolio/new",
    "/portfolio/new/buy": "/portfolio/new/[op]",
    "/portfolio/new/deposit": "/portfolio/new/[op]",
    "/portfolio/new/fx-conversion": "/portfolio/new/[op]",
    "/portfolio/new/in-kind-transfer": "/portfolio/new/[op]",
    "/portfolio/new/income-expense": "/portfolio/new/[op]",
    "/portfolio/new/sell": "/portfolio/new/[op]",
    "/portfolio/new/swap": "/portfolio/new/[op]",
    "/portfolio/new/withdrawal": "/portfolio/new/[op]",
    "/portfolio/realized-gains": "/portfolio/realized-gains",
    "/reports": "/reports",
    "/scenarios": "/scenarios",
    "/settings": "/settings",
    "/settings/about": "/settings/about",
    "/settings/account": null,
    "/settings/backfill": "/settings/backfill",
    "/settings/backfill/7": "/settings/backfill/[runId]",
    "/settings/bank-feeds": "/settings/bank-feeds",
    "/settings/categorization": "/settings/categorization",
    "/settings/data": "/settings/data",
    "/settings/developer": "/settings/developer",
    "/settings/display": "/settings/display",
    "/settings/dropdown-order": "/settings/dropdown-order",
    "/settings/general": "/settings/general",
    "/settings/holding-accounts": null,
    "/settings/import": "/settings/import",
    "/settings/import/reconcile-visibility": "/settings/import/reconcile-visibility",
    "/settings/integrations": "/settings/integrations",
    "/settings/investments": "/settings/investments",
    "/settings/investments/accounts/7/link": "/settings/investments/accounts/[id]/link",
    "/settings/investments/cash-sleeves/new": "/settings/investments/cash-sleeves/new",
    "/settings/investments/securities/5/prices": "/settings/investments/securities/[id]/prices",
    "/settings/investments/securities/7/edit": "/settings/investments/securities/[id]/edit",
    "/settings/investments/securities/7/link": "/settings/investments/securities/[id]/link",
    "/settings/investments/securities/7/prices": "/settings/investments/securities/[id]/prices",
    "/settings/investments/securities/new": "/settings/investments/securities/new",
    "/settings/reconciliation": "/settings/reconciliation",
    "/settings/rules": "/settings/rules",
    "/settings/rules/7/edit": "/settings/rules/[id]/edit",
    "/settings/rules/9/edit": "/settings/rules/[id]/edit",
    "/settings/rules/new": "/settings/rules/new",
    "/settings/securities": null,
    "/subscriptions": "/subscriptions",
    "/subscriptions/7/edit": "/subscriptions/[id]/edit",
    "/subscriptions/new": "/subscriptions/new",
    "/tax": "/tax",
    "/transactions": "/transactions",
    "/transactions/7/edit": "/transactions/[id]/edit",
    "/transactions/7/split": "/transactions/[id]/split",
    "/transactions/audit": "/transactions/audit",
    "/transactions/new": "/transactions/new",
    "/transactions/search": "/transactions/search",
    "/transactions/transfer/7/edit": "/transactions/transfer/[linkId]/edit",
    "/transactions/transfer/tr-9/edit": "/transactions/transfer/[linkId]/edit",
    "/whats-new": "/whats-new"
  }
};

const iconName = (icon: unknown): string | null =>
  Object.entries(Lucide).find(([, v]) => v === icon)?.[0] ?? null;

function concretePaths(): string[] {
  return Object.keys(SNAPSHOT.tabBarHidden);
}

describe("route registry parity (C-04)", () => {
  it("FAB_ROUTES deep-equals the pre-change snapshot", () => {
    const actual: Record<string, unknown> = {};
    for (const [pattern, entry] of Object.entries(FAB_ROUTES)) {
      const { icon, ...rest } = entry as { icon?: unknown };
      actual[pattern] = icon ? { ...rest, icon: iconName(icon) } : rest;
    }
    expect(actual).toEqual(SNAPSHOT.fabRoutes);
  });

  it("isTabBarHidden returns the snapshot result for every route and sample path", () => {
    const actual: Record<string, boolean> = {};
    for (const p of concretePaths()) actual[p] = isTabBarHidden(p);
    expect(actual).toEqual(SNAPSHOT.tabBarHidden);
  });

  it("matchFabRoute resolves the same pattern for every route and sample path", () => {
    const actual: Record<string, string | null> = {};
    for (const p of concretePaths()) actual[p] = matchFabRoute(p)?.pattern ?? null;
    expect(actual).toEqual(SNAPSHOT.matchPattern);
  });

  it("the 8 retired /portfolio/new/<op> routes resolve to /portfolio/new/[op] with the old fab and fullScreen values", () => {
    const OLD_PORTFOLIO_OPS = ["buy", "deposit", "fx-conversion", "in-kind-transfer", "income-expense", "sell", "swap", "withdrawal"];
    for (const op of OLD_PORTFOLIO_OPS) {
      const path = `/portfolio/new/${op}`;
      const route = matchRoute(path);
      expect(route?.pattern, path).toBe("/portfolio/new/[op]");
      expect(route?.fab, path).toEqual({ kind: "hidden", reason: "is the create flow" });
      expect(route?.fullScreen, path).toBe(true);
      expect(isTabBarHidden(path), path).toBe(true);
    }
    // the list keeps the tab bar
    expect(matchRoute("/portfolio/new")?.fullScreen ?? false).toBe(false);
    expect(isTabBarHidden("/portfolio/new")).toBe(false);
  });

  it("registry has one def per FAB key and no duplicate patterns", () => {
    const patterns = ALL_ROUTES.map((r) => r.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
    expect(patterns.sort()).toEqual(Object.keys(FAB_ROUTES).sort());
  });
});
