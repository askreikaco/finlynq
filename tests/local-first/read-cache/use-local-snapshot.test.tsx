// @vitest-environment jsdom
// Hook-level persistence (local-first L2b, WP4b): snapshot-first status, trust and lock gating, account switch.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { useLocalAccountBalances } from "@/lib/local-first/read-cache/use-local-balances";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { createMemoryStore, disposeReadCache, hydrateReadCache, type ReadCacheDeps } from "@/lib/local-first/read-cache/session";
import { readCacheDbName, snapshotAgeMs, wipeAll } from "@/lib/local-first/read-cache/persist-store";
import { fakeApi, jsonRes } from "./fixtures";

type Info = { userId: string; locked: boolean } | null;
const sess = vi.hoisted(() => ({ info: null as Info, listeners: new Set<(i: Info) => void>() }));
vi.mock("@/lib/data/session-info", () => ({
  getSessionInfo: () => sess.info,
  onSessionInfo: (l: (i: Info) => void) => {
    sess.listeners.add(l);
    return () => sess.listeners.delete(l);
  },
}));

// Fake store: no PGlite. Same balance rule as the session tests.
vi.mock("@/lib/local-first/store/pglite-store", () => {
  class PgliteStore {
    readonly backend = "memory";
    readonly engine = "pglite";
    rows = new Map<string, Array<Record<string, unknown>>>();
    async open() {}
    async close() {}
    async upsertRows(table: string, rows: Array<Record<string, unknown>>) {
      const m = this.rows.get(table) ?? [];
      for (const r of rows) {
        const i = m.findIndex((x) => x.id === r.id);
        if (i >= 0) m[i] = r;
        else m.push(r);
      }
      this.rows.set(table, m);
    }
    async accountBalances() {
      const accounts = (this.rows.get("accounts") ?? []) as Array<{ id: string; type: string | null; group: string | null; currency: string | null; archived: boolean; isInvestment: boolean; invisible: boolean }>;
      const txs = (this.rows.get("transactions") ?? []) as Array<{ accountId: string | null; amount: number }>;
      return accounts
        .filter((a) => !a.archived && !a.invisible)
        .map((a) => ({
          accountId: a.id, accountType: a.type, accountGroup: a.group, currency: a.currency,
          archived: a.archived, isInvestment: a.isInvestment, invisible: a.invisible,
          balance: txs.filter((t) => t.accountId === a.id).reduce((s, t) => s + t.amount, 0),
        }));
    }
  }
  return { PgliteStore };
});

const dbNames = async (): Promise<string[]> => (await indexedDB.databases()).map((d) => d.name ?? "");

/** fetch stub: device-current answers with `trustedId`; API calls go to the fake API, held until `gate` resolves. */
function stubFetch(trustedId: string | null, gate: Promise<void> = Promise.resolve()) {
  const api = fakeApi();
  const spy = vi.fn(async (url: string) => {
    if (url === "/api/auth/device-current") return jsonRes({ id: trustedId });
    await gate;
    return api.fetchImpl(url);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Writes a real snapshot for `userId` on the device `dev-1` (build "dev", the hook's build). */
async function seedSnapshot(userId: string): Promise<void> {
  const api = fakeApi();
  const deps: ReadCacheDeps = {
    createStore: createMemoryStore,
    fetchImpl: api.fetchImpl,
    persist: { userId, deviceId: "dev-1", build: "dev", debounceMs: 0, allowPersist: () => true },
  };
  await hydrateReadCache(deps);
  const end = Date.now() + 3000;
  while ((await snapshotAgeMs(userId)) === null) {
    if (Date.now() > end) throw new Error("seed snapshot not written");
    await new Promise((r) => setTimeout(r, 5));
  }
  await disposeReadCache();
}

beforeEach(async () => {
  window.localStorage.clear();
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  sess.info = { userId: "u-hook", locked: false };
  sess.listeners.clear();
  await disposeReadCache();
  await wipeAll();
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  await disposeReadCache();
  await wipeAll();
});

describe("useLocalAccountBalances persistence", () => {
  it("opt-in off: no IndexedDB, no device check, no fetch", async () => {
    window.localStorage.removeItem(LOCAL_READ_CACHE_KEY);
    const fetchSpy = stubFetch("dev-1");
    const openSpy = vi.spyOn(indexedDB, "open");
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(openSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("trusted and unlocked: paints from the snapshot before the network answers, then refreshes", async () => {
    await seedSnapshot("u-hook");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    stubFetch("dev-1", gate);
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.source).toBe("snapshot");
    expect(result.current.balances.map((b) => b.accountId)).toEqual(["1"]);
    expect(result.current.balances[0].balance).toBeCloseTo(950.5, 9);
    expect(result.current.lastHydrate).toBeNull();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.source).toBe("network"));
    expect(result.current.lastHydrate?.loaded.accounts).toBe(4);
  });

  it("untrusted device: network only, and the snapshot is never opened", async () => {
    await seedSnapshot("u-hook");
    stubFetch(null);
    const openSpy = vi.spyOn(indexedDB, "open");
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.source).toBe("network"));
    expect(openSpy).not.toHaveBeenCalled();
    expect(result.current.balances.length).toBe(1);
  });

  it("locked session: network only, no snapshot", async () => {
    await seedSnapshot("u-hook");
    sess.info = { userId: "u-hook", locked: true };
    stubFetch("dev-1");
    const openSpy = vi.spyOn(indexedDB, "open");
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.source).toBe("network"));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("a lock event drops the memory store and clears what is shown", async () => {
    await seedSnapshot("u-hook");
    stubFetch("dev-1");
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      for (const l of sess.listeners) l({ userId: "u-hook", locked: true });
    });
    expect(result.current.status).toBe("off");
    expect(result.current.balances).toEqual([]);
    expect(result.current.source).toBeNull();
  });

  it("account switch: another user's snapshot is never used, and the first user's database stays", async () => {
    await seedSnapshot("u-hook");
    sess.info = { userId: "u-other", locked: false };
    stubFetch("dev-1");
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.source).toBe("network"));
    expect(result.current.balances.length).toBe(1);
    expect(await dbNames()).toContain(await readCacheDbName("u-hook"));
  });
});
