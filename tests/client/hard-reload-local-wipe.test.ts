/**
 * Logout paths (clearPerUserStorage) also drop the logged-out user's opt-in on-device read cache (WP5).
 * node env: window.location and localStorage are stubbed, as in hard-reload-b2.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const dropLocalUserCache = vi.fn((_userId: string) => Promise.resolve());
vi.mock("@/lib/data/local-read-cache-wipe", () => ({ dropLocalUserCache: (userId: string) => dropLocalUserCache(userId) }));

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  dropLocalUserCache.mockClear();
  vi.stubGlobal("window", { location: { assign: vi.fn(), pathname: "/x" } });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

import { clearPerUserStorage } from "@/lib/client/hard-reload";

describe("clearPerUserStorage drops the on-device read cache", () => {
  it("calls the local-first wipe for that user", () => {
    clearPerUserStorage("u1");
    expect(dropLocalUserCache).toHaveBeenCalledWith("u1");
  });
});
