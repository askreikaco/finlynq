// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { hydrateFromApi } from "@/lib/local-first/read-cache/hydrate";
import { createMemoryStore, disposeReadCache, hydrateReadCache, readLocalBalances, type ReadCacheDeps } from "@/lib/local-first/read-cache/session";
import { fakeApi, RAW_TX_PAGE_1, RAW_TX_PAGE_2 } from "./fixtures";

afterEach(async () => {
  await disposeReadCache();
});

describe("local balances equal the sum of hydrated rows (memory PGlite)", () => {
  it("per-account sums over every hydrated transaction match the store, including archived and invisible", async () => {
    const api = fakeApi();
    const store = await createMemoryStore();
    try {
      await hydrateFromApi(api.fetchImpl, store);
      // Expected: sum the API transactions that mapped (unmappable rows 102 and 106 are excluded on purpose).
      const mapped = [...RAW_TX_PAGE_1.data, ...RAW_TX_PAGE_2.data].filter((t) => t.id !== 102 && t.id !== 106);
      const expected = new Map<string, number>();
      for (const t of mapped) {
        if (t.accountId === null) continue;
        const key = String(t.accountId);
        expected.set(key, (expected.get(key) ?? 0) + Number(t.amount));
      }
      const all = await store.accountBalances({ includeArchived: true, includeInvisible: true });
      for (const row of all) {
        expect(row.balance, `account ${row.accountId}`).toBeCloseTo(expected.get(row.accountId) ?? 0, 9);
      }
      expect(all.map((r) => r.accountId).sort()).toEqual(["1", "2", "3", "4"]);
      // Hand check: account 1 = -50 + 1000.5; the 5.0 row with a bad date was skipped.
      expect(all.find((r) => r.accountId === "1")?.balance).toBeCloseTo(950.5, 9);
    } finally {
      await store.close();
    }
  });

  it("the session default excludes archived and invisible accounts, as the server default does", async () => {
    const api = fakeApi();
    const deps: ReadCacheDeps = { createStore: createMemoryStore, fetchImpl: api.fetchImpl };
    await hydrateReadCache(deps);
    const rows = await readLocalBalances(deps);
    expect(rows.map((r) => r.accountId)).toEqual(["1"]);
    expect(rows[0].balance).toBeCloseTo(950.5, 9);
  });
});

describe("session lifecycle", () => {
  it("hydrates once per page load and serves the cached result without new requests", async () => {
    const api = fakeApi();
    const deps: ReadCacheDeps = { createStore: createMemoryStore, fetchImpl: api.fetchImpl };
    const first = await hydrateReadCache(deps);
    const requests = api.urls.length;
    const second = await hydrateReadCache(deps);
    expect(second).toBe(first);
    expect(api.urls.length).toBe(requests);
  });

  it("concurrent calls share one hydrate (single-flight)", async () => {
    const api = fakeApi();
    const deps: ReadCacheDeps = { createStore: createMemoryStore, fetchImpl: api.fetchImpl };
    const [a, b] = await Promise.all([hydrateReadCache(deps), hydrateReadCache(deps)]);
    expect(a).toBe(b);
    expect(api.urls.filter((u) => u.startsWith("/api/accounts")).length).toBe(1);
  });

  it("force re-reads the APIs", async () => {
    const api = fakeApi();
    const deps: ReadCacheDeps = { createStore: createMemoryStore, fetchImpl: api.fetchImpl };
    await hydrateReadCache(deps);
    await hydrateReadCache(deps, { force: true });
    expect(api.urls.filter((u) => u.startsWith("/api/accounts")).length).toBe(2);
  });

  it("dispose closes the store, so the next use opens a fresh one", async () => {
    const api = fakeApi();
    const createStore = vi.fn(createMemoryStore);
    const deps: ReadCacheDeps = { createStore, fetchImpl: api.fetchImpl };
    await hydrateReadCache(deps);
    await disposeReadCache();
    await hydrateReadCache(deps);
    expect(createStore).toHaveBeenCalledTimes(2);
  });

  it("dispose is a no-op when nothing was opened", async () => {
    await expect(disposeReadCache()).resolves.toBeUndefined();
  });

  it("a failed open does not poison the session: the next call retries", async () => {
    const api = fakeApi();
    let attempts = 0;
    const createStore = async () => {
      attempts++;
      if (attempts === 1) throw new Error("wasm failed");
      return createMemoryStore();
    };
    const deps: ReadCacheDeps = { createStore, fetchImpl: api.fetchImpl };
    await expect(hydrateReadCache(deps)).rejects.toThrow("wasm failed");
    await expect(hydrateReadCache(deps)).resolves.toMatchObject({ loaded: { accounts: 4 } });
    expect(attempts).toBe(2);
  });

  it("the session store is memory-backed (nothing written to IndexedDB or OPFS)", async () => {
    const store = await createMemoryStore();
    try {
      expect(store.backend).toBe("memory");
    } finally {
      await store.close();
    }
  });
});
