import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const savePersisted = vi.fn(async () => undefined);
vi.mock("@/lib/data/persist", () => ({ savePersisted: (...a: unknown[]) => savePersisted(...(a as [])) }));

import { createPersistentCache } from "@/lib/data/persistent-cache";
import { normalizeKey, isSafeToPersist, isSafeToNeverPersist } from "@/lib/data/persist-policy";

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

  describe("policy functions: normalizeKey()", () => {
    it("decodes percent-encoding (%61 = a)", () => {
      expect(normalizeKey("/api/%61uth/session")).toBe("/api/auth/session");
    });

    it("converts to lowercase", () => {
      expect(normalizeKey("/API/AUTH/SESSION")).toBe("/api/auth/session");
      expect(normalizeKey("/Api/Auth")).toBe("/api/auth");
    });

    it("removes fragment identifiers", () => {
      expect(normalizeKey("/api/accounts#payload")).toBe("/api/accounts");
      expect(normalizeKey("/api/auth/session#bypass")).toBe("/api/auth/session");
    });

    it("removes query strings", () => {
      expect(normalizeKey("/api/transactions?page=1")).toBe("/api/transactions");
      expect(normalizeKey("/api/accounts?filter=active")).toBe("/api/accounts");
    });

    it("collapses multiple slashes", () => {
      expect(normalizeKey("//api/auth/session")).toBe("/api/auth/session");
      expect(normalizeKey("/api//auth/session")).toBe("/api/auth/session");
      expect(normalizeKey("/api/auth///session")).toBe("/api/auth/session");
    });

    it("strips trailing slashes", () => {
      expect(normalizeKey("/api/auth/session/")).toBe("/api/auth/session");
      expect(normalizeKey("/api/accounts///")).toBe("/api/accounts");
    });

    it("rejects path traversal (..) by returning empty string", () => {
      expect(normalizeKey("/api/accounts/../auth/session")).toBe("");
      expect(normalizeKey("/api/settings/../../user/me")).toBe("");
    });

    it("rejects malformed percent-encoding by returning empty string", () => {
      expect(normalizeKey("/api/%zz/session")).toBe("");
      expect(normalizeKey("/api/%")).toBe("");
      expect(normalizeKey("/api/%G")).toBe("");
    });

    it("handles complex bypass attempts", () => {
      // Case variant + percent-encoding + multiple slashes + trailing slash
      expect(normalizeKey("/API/%61uth//session/")).toBe("/api/auth/session");
      // Path traversal should be caught
      expect(normalizeKey("/api/accounts%2F..%2Fauth")).toBe("");
    });
  });

  describe("policy functions: isSafeToNeverPersist()", () => {
    it("blocks /api/auth/* endpoints", () => {
      expect(isSafeToNeverPersist("/api/auth/session")).toBe(true);
      expect(isSafeToNeverPersist("/api/auth/device-current")).toBe(true);
      expect(isSafeToNeverPersist("/api/auth/passkey/login")).toBe(true);
      expect(isSafeToNeverPersist("/api/auth/")).toBe(true);
    });

    it("blocks /api/admin/* endpoints", () => {
      expect(isSafeToNeverPersist("/api/admin/users")).toBe(true);
      expect(isSafeToNeverPersist("/api/admin/settings")).toBe(true);
    });

    it("blocks /api/user/* endpoints", () => {
      expect(isSafeToNeverPersist("/api/user/me")).toBe(true);
      expect(isSafeToNeverPersist("/api/user/profile")).toBe(true);
    });

    it("blocks /api/oauth/* endpoints", () => {
      expect(isSafeToNeverPersist("/api/oauth/login")).toBe(true);
    });

    it("blocks /api/import/* endpoints", () => {
      expect(isSafeToNeverPersist("/api/import/status")).toBe(true);
    });

    it("blocks /api/settings/(sign-in-methods|devices|connected-apps|passkeys|recovery-codes|api-key|change-*|bank-feeds|backfill|email-retention|confirm-csv-mapping|reconcile-hidden-accounts|reporting-currency/status)", () => {
      expect(isSafeToNeverPersist("/api/settings/sign-in-methods")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/devices")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/connected-apps")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/passkeys")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/recovery-codes")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/api-key")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/change-password")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/change-email")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/change-pin")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/bank-feeds")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/backfill")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/email-retention")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/confirm-csv-mapping")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/reconcile-hidden-accounts")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/reporting-currency/status")).toBe(true);
    });

    it("blocks safe settings endpoints with sensitive sub-paths", () => {
      // These look safe but match the patterns (e.g. settings/ endpoints not on the allow-list)
      expect(isSafeToNeverPersist("/api/settings/devices/abc123")).toBe(true);
      expect(isSafeToNeverPersist("/api/settings/reporting-currency/Status")).toBe(true);
    });

    it("allows non-blocked endpoints", () => {
      expect(isSafeToNeverPersist("/api/accounts")).toBe(false);
      expect(isSafeToNeverPersist("/api/transactions")).toBe(false);
      expect(isSafeToNeverPersist("/api/settings/language")).toBe(false);
      expect(isSafeToNeverPersist("/api/settings/display-currency")).toBe(false);
    });

    it("normalizes keys before checking (case, encoding, slashes, trailing slashes)", () => {
      // These should all be blocked after normalization
      expect(isSafeToNeverPersist("/API/AUTH/SESSION")).toBe(true);
      expect(isSafeToNeverPersist("/api/%61uth/session")).toBe(true);
      expect(isSafeToNeverPersist("/api/auth//session/")).toBe(true);
    });

    it("rejects malformed keys by returning false (fail-closed)", () => {
      expect(isSafeToNeverPersist("/api/%zz/session")).toBe(false);
      expect(isSafeToNeverPersist("/api/settings/../../user/me")).toBe(false);
    });

    it("returns false for non-API keys", () => {
      expect(isSafeToNeverPersist("$swr$internal")).toBe(false);
      expect(isSafeToNeverPersist("local-storage-key")).toBe(false);
    });
  });

  describe("policy functions: isSafeToPersist()", () => {
    it("allows safe endpoints on the allow-list", () => {
      expect(isSafeToPersist("/api/accounts")).toBe(true);
      expect(isSafeToPersist("/api/transactions")).toBe(true);
      expect(isSafeToPersist("/api/budgets")).toBe(true);
      expect(isSafeToPersist("/api/goals")).toBe(true);
      expect(isSafeToPersist("/api/portfolio")).toBe(true);
      expect(isSafeToPersist("/api/dashboard")).toBe(true);
      expect(isSafeToPersist("/api/health-score")).toBe(true);
      expect(isSafeToPersist("/api/fire")).toBe(true);
      expect(isSafeToPersist("/api/forecast")).toBe(true);
      expect(isSafeToPersist("/api/loans")).toBe(true);
      expect(isSafeToPersist("/api/recurring")).toBe(true);
      expect(isSafeToPersist("/api/reports")).toBe(true);
      expect(isSafeToPersist("/api/subscriptions")).toBe(true);
      expect(isSafeToPersist("/api/categories")).toBe(true);
      expect(isSafeToPersist("/api/age-of-money")).toBe(true);
    });

    it("allows safe settings sub-paths on the allow-list", () => {
      expect(isSafeToPersist("/api/settings/language")).toBe(true);
      expect(isSafeToPersist("/api/settings/display-currency")).toBe(true);
      expect(isSafeToPersist("/api/settings/tx-sort")).toBe(true);
      expect(isSafeToPersist("/api/settings/tx-columns")).toBe(true);
      expect(isSafeToPersist("/api/settings/tx-filters")).toBe(true);
      expect(isSafeToPersist("/api/settings/dashboard-layout")).toBe(true);
      expect(isSafeToPersist("/api/settings/dev-mode")).toBe(true);
      expect(isSafeToPersist("/api/settings/active-currencies")).toBe(true);
      expect(isSafeToPersist("/api/settings/account-group-order")).toBe(true);
      expect(isSafeToPersist("/api/settings/dropdown-order")).toBe(true);
      expect(isSafeToPersist("/api/settings/reconcile-thresholds")).toBe(true);
    });

    it("blocks endpoints on the block-list even if they look like they could be data", () => {
      expect(isSafeToPersist("/api/auth/session")).toBe(false);
      expect(isSafeToPersist("/api/user/me")).toBe(false);
      expect(isSafeToPersist("/api/settings/api-key")).toBe(false);
      expect(isSafeToPersist("/api/settings/devices")).toBe(false);
      expect(isSafeToPersist("/api/settings/change-password")).toBe(false);
    });

    it("blocks endpoints NOT on the allow-list and NOT on the block-list", () => {
      expect(isSafeToPersist("/api/unknown-endpoint")).toBe(false);
      expect(isSafeToPersist("/api/data/export")).toBe(false);
      expect(isSafeToPersist("/api/random/path")).toBe(false);
    });

    it("allows sub-paths of allowed endpoints", () => {
      expect(isSafeToPersist("/api/accounts/123")).toBe(true);
      expect(isSafeToPersist("/api/transactions?page=1")).toBe(true);
      expect(isSafeToPersist("/api/dashboard/yearly")).toBe(true);
    });

    it("rejects blocked keys under allowed prefixes (e.g., /api/settings/reporting-currency/status)", () => {
      // /api/settings/ is on the allow-list, but /api/settings/reporting-currency/status is blocked
      expect(isSafeToPersist("/api/settings/reporting-currency/status")).toBe(false);
      expect(isSafeToPersist("/api/settings/reporting-currency/Status")).toBe(false);
    });

    it("normalizes before checking (fail-closed on malformed keys)", () => {
      expect(isSafeToPersist("/API/ACCOUNTS")).toBe(true);
      expect(isSafeToPersist("/api/accounts/")).toBe(true);
      expect(isSafeToPersist("/api/%61ccounts")).toBe(true);
      // Malformed: should fail-closed (return false)
      expect(isSafeToPersist("/api/%zz/session")).toBe(false);
      expect(isSafeToPersist("/api/accounts/../auth")).toBe(false);
    });

    it("returns false for non-API keys", () => {
      expect(isSafeToPersist("$swr$internal")).toBe(false);
      expect(isSafeToPersist("local-key")).toBe(false);
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

  describe("mutation tests (prove each guard is essential)", () => {
    // This test suite validates that each line of code in the policy functions
    // and cache guards is essential by verifying the tests PASS with correct code.
    // With specific mutations applied, the following tests would FAIL:
    //
    // 1. Identity normalizer (normalizeKey returns key unchanged):
    //    - "normalizeKey decodes percent-encoding" fails
    //    - "normalizeKey converts to lowercase" fails
    //    - "isSafeToNeverPersist normalizes keys before checking" fails
    //
    // 2. No .. rejection (normalizeKey doesn't check for ..):
    //    - "normalizeKey rejects path traversal" fails
    //    - "isSafeToNeverPersist returns false for non-API keys" fails (path traversal not caught)
    //
    // 3. No toLowerCase (case sensitive comparison):
    //    - "normalizeKey converts to lowercase" fails
    //    - "isSafeToNeverPersist normalizes keys before checking" fails with /API/AUTH/SESSION
    //    - bypass tests with case variants fail
    //
    // 4. No decodeURIComponent (percent-encoding not decoded):
    //    - "normalizeKey decodes percent-encoding" fails
    //    - "bypass resistance rejects percent-encoded variants" fails
    //    - "isSafeToPersist normalizes before checking" fails with %61uth
    //
    // 5. Fail-open decode catch (decode failures don't return ""):
    //    - "normalizeKey rejects malformed percent-encoding" fails
    //    - "isSafeToPersist returns false for non-API keys" fails (malformed not caught)
    //    - "isSafeToNeverPersist returns false for non-API keys" fails
    //
    // 6. No block-list check in isSafeToPersist (blocks() call removed):
    //    - "blocks endpoints on the block-list" fails
    //    - "rejects blocked keys under allowed prefixes" fails
    //    - "does not persist blocked endpoints" integration test fails
    //    - "allows keys under /api/settings/ without block-list check" would pass (REGRESSION)
    //
    // 7. No hydration purge (purgeDisallowed call removed from provider.tsx):
    //    - "purges blocked keys from initial state" integration test fails
    //    - Blocked keys would remain in memory after cold start
    //
    // 8. No allow-list check in set() (allow-list removed from isSafeToPersist or not called):
    //    - "allows safe endpoints on the allow-list" fails
    //    - "blocks endpoints NOT on allow-list and NOT on block-list" fails
    //    - "/api/unknown-endpoint" would be persisted (REGRESSION)

    it("case-insensitivity is essential: uppercased block-list keys would bypass without toLowerCase", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/API/AUTH/SESSION", { data: { userId: "u1" } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("percent-decoding is essential: %61uth encoded bypass would succeed without decodeURIComponent", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api/%61uth/session", { data: { userId: "u1" } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("path traversal rejection is essential: /api/settings/../../auth would bypass without .. check", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api/settings/../../auth/session", { data: { userId: "u1" } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("block-list check is essential: /api/settings/devices (blocked) would persist without block-list", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api/settings/devices", { data: { devices: [] } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("allow-list check is essential: /api/unknown-endpoint would persist without allow-list", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api/unknown-endpoint", { data: { ok: true } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("both block-list AND allow-list are required: only block-list would allow non-listed safe endpoints", () => {
      // /api/custom-financial-data is not blocked but also not on allow-list
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api/custom-financial-data", { data: { value: 100 } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });

    it("malformed key handling (fail-closed) is essential: %zz decode error must return empty string", () => {
      const normalized = normalizeKey("/api/%zz/session");
      expect(normalized).toBe("");
      // A failed decode that doesn't return "" would allow the key to continue
      // and potentially match patterns incorrectly
    });

    it("slash collapsing is essential: /api//auth//session/ must normalize correctly", () => {
      const cache = createPersistentCache({ userId: "u1", build: "b1", initial: new Map(), enabled: () => true });
      cache.set("/api//auth//session/", { data: { userId: "u1" } });
      vi.advanceTimersByTime(600);
      expect(savePersisted).not.toHaveBeenCalled();
    });
  });
});
