import { describe, it, expect, beforeEach } from "vitest";
import {
  clearOverviewCache,
  getCachedOverview,
  invalidateViewerOverview,
  overviewCacheKey,
  setCachedOverview,
} from "@/lib/family/overview/cache";

const share = (id: string, sections: string[]) => ({
  id,
  allSections: false,
  sections,
  mustShareBack: false,
  requiredBackSections: null,
});
const base = { viewerId: "v1", dataVersion: 1, period: "month", display: "VND", unlocked: true, shares: [share("s1", ["net_worth"])] };

describe("family overview cache", () => {
  beforeEach(() => clearOverviewCache());

  it("serves the same day, expires the next day", () => {
    const k = overviewCacheKey(base);
    setCachedOverview(k, "2026-10-02", { a: 1 });
    expect(getCachedOverview(k, "2026-10-02")?.body).toEqual({ a: 1 });
    expect(getCachedOverview(k, "2026-10-03")).toBeNull();
    expect(getCachedOverview(k, "2026-10-02")).toBeNull();
  });

  it("a revoke, narrowed grant, lock, other period or other viewer changes the key", () => {
    const k = overviewCacheKey(base);
    expect(overviewCacheKey({ ...base, shares: [] })).not.toBe(k);
    expect(overviewCacheKey({ ...base, shares: [share("s1", [])] })).not.toBe(k);
    expect(overviewCacheKey({ ...base, unlocked: false })).not.toBe(k);
    expect(overviewCacheKey({ ...base, period: "all" })).not.toBe(k);
    expect(overviewCacheKey({ ...base, viewerId: "v2" })).not.toBe(k);
    expect(overviewCacheKey({ ...base, display: "USD" })).not.toBe(k);
    // share order does not matter
    const two = { ...base, shares: [share("a", []), share("b", [])] };
    expect(overviewCacheKey(two)).toBe(overviewCacheKey({ ...two, shares: [...two.shares].reverse() }));
  });

  it("invalidateViewerOverview drops only that viewer", () => {
    const k1 = overviewCacheKey(base);
    const k2 = overviewCacheKey({ ...base, viewerId: "v2" });
    setCachedOverview(k1, "2026-10-02", 1);
    setCachedOverview(k2, "2026-10-02", 2);
    invalidateViewerOverview("v1");
    expect(getCachedOverview(k1, "2026-10-02")).toBeNull();
    expect(getCachedOverview(k2, "2026-10-02")?.body).toBe(2);
  });
});
