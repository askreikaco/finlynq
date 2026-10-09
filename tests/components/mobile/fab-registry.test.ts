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
    const r = resolveFab("/goals", withHandler("goals.create", { onClick: spy }));
    expect(r).toMatchObject({ type: "button", label: "Add goal", disabled: false, pattern: "/goals" });
    if (r?.type === "button") r.onClick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("handler not registered and no fallbackHref -> null", () => {
    expect(resolveFab("/goals", none)).toBeNull();
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

  it("hidden and redirect routes -> null", () => {
    for (const p of ["/chat", "/family/accept", "/portfolio/new", "/portfolio/new/buy", "/portfolio/new/in-kind-transfer", "/accounts/new", "/transactions/new", "/transactions/search", "/admin/env", "/settings/holding-accounts", "/settings/securities"]) {
      expect(resolveFab(p, none), p).toBeNull();
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
  it("has 89 route keys (85 + 4 loan/subscription create and edit pages)", () => {
    expect(Object.keys(FAB_ROUTES)).toHaveLength(89);
  });

  it("kind counts are 38 fallback, 12 route, 11 handler, 25 hidden, 3 redirect", () => {
    const counts: Record<string, number> = {};
    for (const e of Object.values(FAB_ROUTES)) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    expect(counts).toEqual({ fallback: 38, route: 12, handler: 11, hidden: 25, redirect: 3 });
  });

  it("label/href table for the route entries", () => {
    const rows = Object.entries(FAB_ROUTES)
      .filter(([, e]) => e.kind === "route")
      .map(([p, e]) => (e.kind === "route" ? [p, e.label, e.href] : []))
      .sort();
    expect(rows).toEqual([
      ["/accounts", "Add account", "/accounts/new"],
      ["/dashboard", "New transaction", "/transactions/new"],
      ["/family", "Invite", "/family/share"],
      ["/import/pending", "Upload statement", "/import"],
      ["/loans", "Add loan", "/loans/new"],
      ["/portfolio", "Add holding", "/settings/investments"],
      ["/portfolio/dividends", "Record dividend", "/portfolio/new/income-expense"],
      ["/portfolio/realized-gains", "Record sale", "/portfolio/new/sell"],
      ["/settings/backfill/[runId]", "New run", "/settings/backfill"],
      ["/settings/investments", "Add security", "/settings/investments/securities/new"],
      ["/subscriptions", "Add subscription", "/subscriptions/new"],
      ["/transactions", "Add transaction", "/transactions/new"],
    ]);
  });

  it("every handler key is unique and the 11 keys are all used", () => {
    const used = Object.values(FAB_ROUTES).flatMap((e) => (e.kind === "handler" ? [e.handlerKey] : []));
    expect(used).toHaveLength(11);
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
