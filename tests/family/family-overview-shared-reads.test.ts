import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearSharedReads, sharedRead } from "@/lib/family/overview/shared-reads";

describe("family overview shared reads", () => {
  beforeEach(() => {
    clearSharedReads();
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("concurrent builds share one load per (read, owner, day); other owners/days/reads don't", async () => {
    const load = vi.fn(async () => [1, 2, 3]);
    const [a, b] = await Promise.all([
      sharedRead("cashSnaps", "o1", "2026-10-02", {}, load),
      sharedRead("cashSnaps", "o1", "2026-10-02", {}, load),
    ]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    await sharedRead("cashSnaps", "o2", "2026-10-02", {}, load);
    await sharedRead("cashSnaps", "o1", "2026-10-03", {}, load);
    await sharedRead("balances", "o1", "2026-10-02", {}, load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("expires after 60s; a Refresh only reuses a load started within 5s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
    const load = vi.fn(async () => "rows");
    await sharedRead("x", "o1", "d", {}, load);
    vi.setSystemTime(new Date("2026-10-02T00:00:03Z"));
    await sharedRead("x", "o1", "d", { refresh: true }, load); // sibling of a fresh load: reused
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-02T00:00:30Z"));
    await sharedRead("x", "o1", "d", {}, load); // within 60s: reused
    expect(load).toHaveBeenCalledTimes(1);
    await sharedRead("x", "o1", "d", { refresh: true }, load); // 30s old: refresh reloads
    expect(load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-10-02T00:02:00Z"));
    await sharedRead("x", "o1", "d", {}, load); // expired
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("a failed load is not reused; disabled outside production", async () => {
    const bad = vi.fn(async () => {
      throw new Error("db");
    });
    await expect(sharedRead("x", "o1", "d", {}, bad)).rejects.toThrow("db");
    await expect(sharedRead("x", "o1", "d", {}, bad)).rejects.toThrow("db");
    expect(bad).toHaveBeenCalledTimes(2);
    vi.stubEnv("NODE_ENV", "test");
    const load = vi.fn(async () => 1);
    await sharedRead("y", "o1", "d", {}, load);
    await sharedRead("y", "o1", "d", {}, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
