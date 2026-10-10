import { describe, it, expect } from "vitest";
import { dueSubscriptions, postNowHref } from "@/lib/subscriptions/due";
import { effectiveNextDate } from "@/lib/subscriptions/calendar-events";

const s = (id: number, over: Record<string, unknown> = {}) => ({
  id, name: "n", amount: 1, currency: "USD", frequency: "monthly", status: "active", nextDate: "2026-06-01", dueCount: 1, ...over,
});

describe("dueSubscriptions", () => {
  it("keeps active rows with dueCount > 0, oldest next_date first", () => {
    const out = dueSubscriptions([
      s(1, { nextDate: "2026-06-05" }), s(2, { nextDate: "2026-06-01" }), s(3, { dueCount: 0 }),
      s(4, { status: "ended" }), s(5, { status: "paused" }), s(6, { dueCount: undefined }),
    ]);
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
  it("tolerates null/undefined", () => {
    expect(dueSubscriptions(null)).toEqual([]);
    expect(dueSubscriptions(undefined)).toEqual([]);
  });
});

describe("postNowHref", () => {
  it("builds the entry URL", () => {
    expect(postNowHref(7, "2026-06-10")).toBe("/transactions/new?subscription=7&occurrence=2026-06-10");
    expect(postNowHref(7, "2026-06-10", "/subscriptions")).toBe("/transactions/new?subscription=7&occurrence=2026-06-10&return=%2Fsubscriptions");
  });
  it("drops an off-site return path", () => {
    expect(postNowHref(7, "2026-06-10", "//evil.example")).not.toContain("return=");
    expect(postNowHref(7, "2026-06-10", "https://evil.example")).not.toContain("return=");
  });
});

describe("effectiveNextDate", () => {
  it("never rolls a postable subscription's unposted date forward", () => {
    expect(effectiveNextDate(s(1, { postable: true, nextDate: "2026-03-10" }), "2026-06-15")).toBe("2026-03-10");
  });
  it("still rolls a non-postable one", () => {
    expect(effectiveNextDate(s(1, { nextDate: "2026-03-10" }), "2026-06-15")).toBe("2026-07-10");
  });
});
