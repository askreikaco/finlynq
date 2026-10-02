import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const savePersisted = vi.fn(async () => undefined);
vi.mock("@/lib/data/persist", () => ({ savePersisted: (...a: unknown[]) => savePersisted(...(a as [])) }));

import { createPersistentCache } from "@/lib/data/persistent-cache";

describe("persistent SWR cache", () => {
  beforeEach(() => {
    savePersisted.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("pre-fills from the device copy and writes through only /api data, batched, while enabled", () => {
    let enabled = true;
    const cache = createPersistentCache({
      userId: "u1",
      build: "b1",
      initial: new Map([["/api/accounts", [{ id: 1 }]]]),
      enabled: () => enabled,
    });
    expect(cache.get("/api/accounts")?.data).toEqual([{ id: 1 }]);
    // hydration itself is not written back
    vi.advanceTimersByTime(1000);
    expect(savePersisted).not.toHaveBeenCalled();

    cache.set("/api/dashboard", { data: { nw: 1 } });
    cache.set("/api/transactions?page=1", { data: { data: [] } });
    cache.set("$swr$internal", { data: 1 }); // not an API key
    cache.set("/api/loading", { isValidating: true }); // no data
    vi.advanceTimersByTime(600);
    expect(savePersisted).toHaveBeenCalledTimes(1);
    const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
    expect([...batch.keys()].sort()).toEqual(["/api/dashboard", "/api/transactions?page=1"]);

    // same data reference again: not re-written
    const d = cache.get("/api/dashboard")!.data;
    cache.set("/api/dashboard", { data: d, isValidating: false });
    vi.advanceTimersByTime(600);
    expect(savePersisted).toHaveBeenCalledTimes(1);

    // disabled (locked / untrusted): nothing persists
    enabled = false;
    cache.set("/api/goals", { data: [1] });
    vi.advanceTimersByTime(600);
    expect(savePersisted).toHaveBeenCalledTimes(1);
  });

  it("a delete is written through as a removal", () => {
    const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
    cache.set("/api/x", { data: 1 });
    cache.delete("/api/x");
    vi.advanceTimersByTime(600);
    const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
    expect(batch.has("/api/x")).toBe(true);
    expect(batch.get("/api/x")).toBeUndefined();
  });
});
