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

  it("a delete of allowed key is written through as a removal", () => {
    const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
    cache.set("/api/accounts", { data: 1 });
    cache.delete("/api/accounts");
    vi.advanceTimersByTime(600);
    const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
    expect(batch.has("/api/accounts")).toBe(true);
    expect(batch.get("/api/accounts")).toBeUndefined();
  });

  it("does not persist blocked endpoints (auth, admin, settings/*) even while enabled", () => {
    const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

    // Safe endpoints should persist
    cache.set("/api/accounts", { data: [{ id: 1 }] });
    cache.set("/api/transactions", { data: { items: [] } });
    cache.set("/api/dashboard?currency=VND", { data: { balance: 100 } });

    // Blocked auth endpoints
    cache.set("/api/auth/session", { data: { userId: "u1" } });
    cache.set("/api/auth/device-current", { data: { id: "dev1" } });
    cache.set("/api/auth/passkey/login", { data: { ok: true } });

    // Blocked settings endpoints
    cache.set("/api/settings/sign-in-methods", { data: { google: true } });
    cache.set("/api/settings/devices", { data: { devices: [] } });
    cache.set("/api/settings/connected-apps", { data: { apps: [] } });
    cache.set("/api/settings/api-key", { data: { key: "sk_..." } });
    cache.set("/api/settings/change-password", { data: { ok: true } });

    // Blocked user endpoint
    cache.set("/api/user/me", { data: { email: "user@example.com" } });

    // Blocked admin endpoint
    cache.set("/api/admin/users", { data: { users: [] } });

    // Blocked feedback
    cache.set("/api/feedback", { data: [] });

    vi.advanceTimersByTime(600);

    expect(savePersisted).toHaveBeenCalledTimes(1);
    const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
    const persistedKeys = [...batch.keys()].sort();

    // Only safe endpoints should persist
    expect(persistedKeys).toEqual(["/api/accounts", "/api/dashboard?currency=VND", "/api/transactions"]);
  });

  describe("bypass resistance", () => {
    it("rejects case variants (e.g. /api/AUTH/session)", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      cache.set("/api/AUTH/session", { data: { userId: "u1" } });
      cache.set("/api/Auth/Session", { data: { userId: "u2" } });

      vi.advanceTimersByTime(600);

      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("rejects percent-encoded variants (e.g. %61uth)", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      cache.set("/api/%61uth/session", { data: { userId: "u1" } });
      cache.set("%2Fapi%2Fauth%2Fsession", { data: { userId: "u2" } });

      vi.advanceTimersByTime(600);

      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("rejects URLs with multiple slashes", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      cache.set("//api/auth/session", { data: { userId: "u1" } });
      cache.set("/api//auth/session", { data: { userId: "u2" } });

      vi.advanceTimersByTime(600);

      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("rejects fragments in blocked keys (fragment is ignored for security check)", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      cache.set("/api/auth/session#bypass", { data: { userId: "u1" } });
      cache.set("/api/accounts#payload", { data: [{ id: 1 }] });

      vi.advanceTimersByTime(600);

      // Auth endpoint with fragment is still blocked (fragment stripped for security check)
      // Safe endpoint is persisted with its fragment (fragments are client-side only)
      const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
      expect([...batch.keys()]).toEqual(["/api/accounts#payload"]);
    });

    it("rejects path traversal (..)", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      cache.set("/api/settings/../../user/me", { data: { email: "user@example.com" } });

      vi.advanceTimersByTime(600);

      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("rejects trailing slashes on blocked endpoints", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      cache.set("/api/auth/session/", { data: { userId: "u1" } });
      cache.set("/api/user/me/", { data: { email: "user@example.com" } });
      cache.set("/api/settings/api-key/", { data: { key: "sk_..." } });

      vi.advanceTimersByTime(600);

      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("rejects sub-paths of blocked endpoints", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      cache.set("/api/user/me/extra", { data: { ok: true } });
      cache.set("/api/settings/devices/abc123", { data: { ok: true } });
      cache.set("/api/auth/session/something", { data: { ok: true } });

      vi.advanceTimersByTime(600);

      expect(savePersisted).not.toHaveBeenCalled();
    });
  });

  describe("allow-list enforcement", () => {
    it("persists only explicitly allowed endpoints", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      // Allowed endpoints
      cache.set("/api/accounts", { data: [{ id: 1 }] });
      cache.set("/api/transactions", { data: { items: [] } });
      cache.set("/api/budgets", { data: { budgets: [] } });
      cache.set("/api/goals", { data: { goals: [] } });
      cache.set("/api/portfolio", { data: { holdings: [] } });

      // Not allowed (not on allow-list, even though not explicitly blocked)
      cache.set("/api/data/export", { data: { url: "..." } });
      cache.set("/api/unknown", { data: { ok: true } });

      vi.advanceTimersByTime(600);

      expect(savePersisted).toHaveBeenCalledTimes(1);
      const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
      const persistedKeys = [...batch.keys()].sort();

      expect(persistedKeys).toEqual(["/api/accounts", "/api/budgets", "/api/goals", "/api/portfolio", "/api/transactions"]);
    });

    it("persists safe settings endpoints only", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

      // Safe settings
      cache.set("/api/settings/language", { data: "en" });
      cache.set("/api/settings/display-currency", { data: "USD" });
      cache.set("/api/settings/tx-sort", { data: "date-desc" });

      // Unsafe settings
      cache.set("/api/settings/api-key", { data: "sk_..." });
      cache.set("/api/settings/devices", { data: [] });

      vi.advanceTimersByTime(600);

      expect(savePersisted).toHaveBeenCalledTimes(1);
      const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
      const persistedKeys = [...batch.keys()].sort();

      expect(persistedKeys).toEqual(["/api/settings/display-currency", "/api/settings/language", "/api/settings/tx-sort"]);
    });
  });

  describe("mutation tests (prove each guard is essential)", () => {
    it("block-list guard in set() prevents blocked keys from persisting", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api/auth/session", { data: { userId: "u1" } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("allow-list guard in set() prevents non-allowed keys from persisting", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api/unknown-endpoint", { data: { data: [] } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("purge guard in hydration removes blocked keys from memory", () => {
      const compromisedInitial = new Map([["/api/auth/session", { userId: "u1" }]]);
      const cache = createPersistentCache({
        userId: "u1",
        build: "b1",
        initial: compromisedInitial,
        enabled: () => true,
      });
      expect(cache.get("/api/auth/session")).toBeUndefined();
    });

    it("normalization prevents bypass via percent-encoding", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api/%61uth/session", { data: { userId: "u1" } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });
  });

  it("purges blocked keys from initial state and queues them for deletion", () => {
    const compromisedInitial = new Map([
      ["/api/accounts", [{ id: 1 }]], // safe - should be hydrated
      ["/api/auth/session", { userId: "u1" }], // blocked - should be purged
      ["/api/user/me", { email: "user@example.com" }], // blocked - should be purged
      ["/api/settings/api-key", { key: "sk_..." }], // blocked - should be purged
    ]);

    const cache = createPersistentCache({
      userId: "u1",
      build: "b1",
      initial: compromisedInitial,
      enabled: () => true,
    });

    // Safe endpoint should be available
    expect(cache.get("/api/accounts")?.data).toEqual([{ id: 1 }]);

    // Blocked endpoints should NOT be available in memory (purged)
    expect(cache.get("/api/auth/session")).toBeUndefined();
    expect(cache.get("/api/user/me")).toBeUndefined();
    expect(cache.get("/api/settings/api-key")).toBeUndefined();

    vi.advanceTimersByTime(600);

    // Blocked keys must be queued for deletion
    expect(savePersisted).toHaveBeenCalledTimes(1);
    const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
    const persistedKeys = [...batch.keys()].sort();

    expect(persistedKeys).toEqual(["/api/auth/session", "/api/settings/api-key", "/api/user/me"]);
    expect(batch.get("/api/auth/session")).toBeUndefined();
    expect(batch.get("/api/user/me")).toBeUndefined();
    expect(batch.get("/api/settings/api-key")).toBeUndefined();
  });

  it("delete of blocked endpoints queues their removal to purge old encrypted entries", () => {
    const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });

    cache.set("/api/auth/session", { data: { userId: "u1" } });
    cache.delete("/api/auth/session");

    vi.advanceTimersByTime(600);

    // Delete of blocked key should queue a removal (to purge from store)
    expect(savePersisted).toHaveBeenCalledTimes(1);
    const batch = (savePersisted.mock.calls[0] as unknown[])[2] as Map<string, unknown>;
    expect(batch.get("/api/auth/session")).toBeUndefined();
  });
});
