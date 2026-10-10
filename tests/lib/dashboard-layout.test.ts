import { describe, it, expect } from "vitest";
import { DASHBOARD_CARDS, DEFAULT_CARD_ORDER, defaultLayout, normalizeLayout } from "@/lib/dashboard-layout";

describe("dashboard-layout registry", () => {
  it("default order is today's dashboard order (pinned: no visible change until customised)", () => {
    expect([...DEFAULT_CARD_ORDER]).toEqual([
      "onboarding-tips", "due-subscriptions", "net-worth", "health-score", "summary-stats", "key-metrics", "net-worth-history",
      "action-center", "weekly-recap", "quick-import",
      "income-expense-chart", "spending-category-chart", "available-to-spend", "insights",
    ]);
    expect(new Set(DEFAULT_CARD_ORDER).size).toBe(DASHBOARD_CARDS.length);
    expect(defaultLayout()).toEqual({ order: [...DEFAULT_CARD_ORDER], hidden: [] });
  });
});

describe("normalizeLayout", () => {
  it("garbage -> defaults", () => {
    for (const bad of [null, undefined, 5, "x", [], { order: "nope", hidden: 3 }]) {
      expect(normalizeLayout(bad)).toEqual(defaultLayout());
    }
  });

  it("drops unknown ids and duplicates, keeps the user's order", () => {
    const out = normalizeLayout({ order: ["onboarding-tips", "insights", "bogus", "net-worth", "insights"], hidden: ["bogus", "key-metrics", "key-metrics"] });
    // the card added later (due-subscriptions) is slotted after its default predecessor; the user's relative order holds
    expect(out.order.filter((i) => i !== "due-subscriptions").slice(0, 3)).toEqual(["onboarding-tips", "insights", "net-worth"]);
    expect(out.order).not.toContain("bogus");
    expect(out.order.filter((i) => i === "insights")).toHaveLength(1);
    expect(out.hidden).toEqual(["key-metrics"]);
  });

  it("cards missing from a saved order are inserted at their default position", () => {
    const saved = DEFAULT_CARD_ORDER.filter((i) => i !== "key-metrics");
    expect(normalizeLayout({ order: saved, hidden: [] }).order).toEqual([...DEFAULT_CARD_ORDER]);
    // missing first card goes to the front
    const noFirst = DEFAULT_CARD_ORDER.filter((i) => i !== "onboarding-tips");
    expect(normalizeLayout({ order: noFirst }).order[0]).toBe("onboarding-tips");
    // a reordered list keeps the reorder and appends the new card after its default predecessor
    const out = normalizeLayout({ order: ["insights", "net-worth"], hidden: [] });
    expect(out.order).toHaveLength(DEFAULT_CARD_ORDER.length);
    expect(out.order.indexOf("insights")).toBeLessThan(out.order.indexOf("net-worth"));
  });

  it("a layout saved before due-subscriptions existed gets the card right after its default predecessor", () => {
    const legacy = DEFAULT_CARD_ORDER.filter((i) => i !== "due-subscriptions");
    const out = normalizeLayout({ order: legacy, hidden: [] });
    expect(out.order).toEqual([...DEFAULT_CARD_ORDER]);
    expect(out.order.indexOf("due-subscriptions")).toBe(out.order.indexOf("onboarding-tips") + 1);
    // the user's own reorder is kept; the new card follows onboarding-tips wherever the user put it
    const reordered = ["net-worth", "onboarding-tips", ...legacy.filter((i) => i !== "net-worth" && i !== "onboarding-tips")];
    const out2 = normalizeLayout({ order: reordered, hidden: ["net-worth"] });
    expect(out2.order.slice(0, 3)).toEqual(["net-worth", "onboarding-tips", "due-subscriptions"]);
    expect(out2.hidden).toEqual(["net-worth"]); // never auto-hidden, never un-hides
  });

  it("due-subscriptions is a main card (not dev-only) and is hidable", () => {
    const def = DASHBOARD_CARDS.find((c) => c.id === "due-subscriptions");
    expect(def).toEqual({ id: "due-subscriptions", title: "Due subscriptions" });
    expect(normalizeLayout({ hidden: ["due-subscriptions"] }).hidden).toEqual(["due-subscriptions"]);
  });
});
