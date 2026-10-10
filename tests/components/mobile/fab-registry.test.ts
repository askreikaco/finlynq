import { describe, it, expect, vi } from "vitest";
import { Plus, Receipt, TrendingUp } from "lucide-react";
import {
  DEFAULT_FAB,
  FAB_HANDLER_KEYS,
  FAB_ROUTES,
  matchFabRoute,
  resolveFab,
  routeFromPageFile,
  type FabHandlerKey,
  type FabHandlerRegistration,
} from "@/components/mobile/fab-registry";
import { ALL_ROUTES } from "@/lib/routes";

const none = new Map<FabHandlerKey, FabHandlerRegistration>();

function withHandler(key: FabHandlerKey, reg: Partial<FabHandlerRegistration> = {}) {
  return new Map<FabHandlerKey, FabHandlerRegistration>([[key, { onClick: () => {}, ...reg }]]);
}

describe("matchFabRoute", () => {
  it("matches an exact route", () => {
    expect(matchFabRoute("/goals")?.pattern).toBe("/goals");
  });

  it("matches a [id] dynamic route", () => {
    expect(matchFabRoute("/accounts/42")?.pattern).toBe("/accounts/[id]");
    expect(matchFabRoute("/settings/backfill/abc")?.pattern).toBe("/settings/backfill/[runId]");
  });

  it("ignores a trailing slash", () => {
    expect(matchFabRoute("/goals/")?.pattern).toBe("/goals");
  });

  it("returns null for an unknown path", () => {
    expect(matchFabRoute("/does-not-exist")).toBeNull();
    expect(matchFabRoute("/accounts/1/extra")).toBeNull();
  });
});

describe("resolveFab", () => {
  it("handler registered -> button with the registration's onClick", () => {
    const spy = vi.fn();
    const r = resolveFab("/admin/announcements", withHandler("admin.announcements.new", { onClick: spy }));
    expect(r).toMatchObject({ type: "button", label: "New announcement", disabled: false, pattern: "/admin/announcements" });
    if (r?.type === "button") r.onClick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("route entry -> link to the create page, no handler needed (goals)", () => {
    expect(resolveFab("/goals", none)).toMatchObject({ type: "link", label: "Add goal", href: "/goals/new", pattern: "/goals" });
  });

  it("handler not registered and no fallbackHref -> null", () => {
    expect(resolveFab("/admin/announcements", none)).toBeNull();
  });

  it("handler not registered with fallbackHref -> link to the fallback", () => {
    expect(resolveFab("/accounts/7", none)).toMatchObject({
      type: "link",
      href: "/transactions/new",
      label: "New transaction",
      pattern: "/accounts/[id]",
    });
  });

  it("registration label and icon override the entry", () => {
    const r = resolveFab("/accounts/7", withHandler("accounts.detail.add", { label: "Buy", icon: TrendingUp }));
    expect(r).toMatchObject({ type: "button", label: "Buy", icon: TrendingUp });
  });

  it("hidden routes -> null", () => {
    for (const p of ["/chat", "/family/accept", "/portfolio/new", "/portfolio/new/buy", "/portfolio/new/in-kind-transfer", "/accounts/new", "/accounts/7/edit", "/transactions/new", "/transactions/search"]) {
      expect(resolveFab(p, none), p).toBeNull();
    }
  });

  it("routes removed by C-36 have no registry entry -> DEFAULT_FAB link with null pattern", () => {
    for (const p of ["/admin/env", "/settings/holding-accounts", "/settings/securities"]) {
      expect(matchFabRoute(p), p).toBeNull();
      expect(resolveFab(p, none), p).toMatchObject({ type: "link", href: DEFAULT_FAB.href, pattern: null });
    }
  });

  it("fallback route -> DEFAULT_FAB link", () => {
    expect(resolveFab("/account", none)).toEqual({
      type: "link",
      href: DEFAULT_FAB.href,
      label: DEFAULT_FAB.label,
      icon: DEFAULT_FAB.icon,
      pattern: "/account",
    });
  });

  it("unknown path -> DEFAULT_FAB link with null pattern", () => {
    expect(resolveFab("/unknown", none)).toMatchObject({ type: "link", href: "/transactions/new", pattern: null });
  });
});

describe("FAB_ROUTES table", () => {
  it("has one key per registry route, ratcheted at most 93", () => {
    expect(Object.keys(FAB_ROUTES)).toHaveLength(ALL_ROUTES.length);
    expect(ALL_ROUTES.length).toBeLessThanOrEqual(93);
  });

  it("kind counts are 38 fallback, 17 route, 6 handler, 32 hidden, 0 redirect", () => {
    const counts: Record<string, number> = {};
    for (const e of Object.values(FAB_ROUTES)) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    expect(counts).toEqual({ fallback: 38, route: 17, handler: 6, hidden: 32 });
    expect(counts.redirect).toBeUndefined();
  });

  it("label/href table for the route entries", () => {
    const rows = Object.entries(FAB_ROUTES)
      .filter(([, e]) => e.kind === "route")
      .map(([p, e]) => (e.kind === "route" ? [p, e.label, e.href] : []))
      .sort();
    expect(rows).toEqual([
      ["/accounts", "Add account", "/accounts/new"],
      ["/budgets", "Add budget", "/budgets/new"],
      ["/categories", "Add category", "/categories/new"],
      ["/dashboard", "New transaction", "/transactions/new"],
      ["/family", "Invite", "/family/share"],
      ["/goals", "Add goal", "/goals/new"],
      ["/import/pending", "Upload statement", "/import"],
      ["/loans", "Add loan", "/loans/new"],
      ["/portfolio", "Add holding", "/settings/investments"],
      ["/portfolio/dividends", "Record dividend", "/portfolio/new/income-expense"],
      ["/portfolio/realized-gains", "Record sale", "/portfolio/new/sell"],
      ["/settings/backfill/[runId]", "New run", "/settings/backfill"],
      ["/settings/categorization", "Add category", "/categories/new"],
      ["/settings/investments", "Add security", "/settings/investments/securities/new"],
      ["/settings/rules", "Add rule", "/settings/rules/new"],
      ["/subscriptions", "Add subscription", "/subscriptions/new"],
      ["/transactions", "Add transaction", "/transactions/new"],
    ]);
  });

  it("every handler key is unique and the 6 keys are all used", () => {
    const used = Object.values(FAB_ROUTES).flatMap((e) => (e.kind === "handler" ? [e.handlerKey] : []));
    expect(used).toHaveLength(6);
    expect(new Set(used).size).toBe(used.length);
    expect([...used].sort()).toEqual([...FAB_HANDLER_KEYS].sort());
  });
});

describe("routeFromPageFile", () => {
  it("drops route groups", () => {
    expect(routeFromPageFile("src/app/(app)/admin/(env)/api-log/page.tsx")).toBe("/admin/api-log");
  });

  it("keeps [id] segments and maps the root to /", () => {
    expect(routeFromPageFile("src/app/(app)/accounts/[id]/page.tsx")).toBe("/accounts/[id]");
    expect(routeFromPageFile("src/app/(app)/page.tsx")).toBe("/");
  });

  it("registration without an icon keeps the entry icon; DEFAULT_FAB uses Plus", () => {
    expect(DEFAULT_FAB.icon).toBe(Plus);
    expect(resolveFab("/accounts/9", withHandler("accounts.detail.add"))).toMatchObject({ icon: Receipt });
  });
});
