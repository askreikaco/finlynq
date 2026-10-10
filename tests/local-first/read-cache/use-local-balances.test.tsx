// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { useLocalAccountBalances } from "@/lib/local-first/read-cache/use-local-balances";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { disposeReadCache } from "@/lib/local-first/read-cache/session";
import { fakeApi } from "./fixtures";

// Fake store: records open/use, so the test can tell whether PGlite was touched at all.
const pgliteCtor = vi.fn();
vi.mock("@/lib/local-first/store/pglite-store", () => {
  class PgliteStore {
    readonly backend = "memory";
    readonly engine = "pglite";
    rows = new Map<string, Array<{ id: string; type: string | null; group: string | null; currency: string | null; archived: boolean; isInvestment: boolean; invisible: boolean; amount: number; accountId: string | null }>>();
    constructor(opts: unknown) {
      pgliteCtor(opts);
    }
    async open() {}
    async close() {}
    async upsertRows(table: string, rows: Array<Record<string, unknown>>) {
      const m = this.rows.get(table) ?? [];
      for (const r of rows) m.push(r as never);
      this.rows.set(table, m);
    }
    async accountBalances() {
      const accounts = (this.rows.get("accounts") ?? []) as Array<{ id: string; type: string | null; group: string | null; currency: string | null; archived: boolean; isInvestment: boolean; invisible: boolean }>;
      const txs = (this.rows.get("transactions") ?? []) as Array<{ accountId: string | null; amount: number }>;
      return accounts
        .filter((a) => !a.archived && !a.invisible)
        .map((a) => ({
          accountId: a.id,
          accountType: a.type,
          accountGroup: a.group,
          currency: a.currency,
          archived: a.archived,
          isInvestment: a.isInvestment,
          invisible: a.invisible,
          balance: txs.filter((t) => t.accountId === a.id).reduce((s, t) => s + t.amount, 0),
        }));
    }
  }
  return { PgliteStore };
});

describe("useLocalAccountBalances", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    window.localStorage.clear();
    pgliteCtor.mockClear();
    const api = fakeApi();
    fetchSpy = vi.fn(api.fetchImpl);
    vi.stubGlobal("fetch", fetchSpy);
    await disposeReadCache();
  });

  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    await disposeReadCache();
  });

  it("is inert when off: no store, no fetch, status off, refresh resolves null", async () => {
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(pgliteCtor).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.balances).toEqual([]);
    await expect(result.current.refresh()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pgliteCtor).not.toHaveBeenCalled();
  });

  it("is inert when the flag is set to anything but '1'", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "true");
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pgliteCtor).not.toHaveBeenCalled();
  });

  it("when opted in, hydrates once on mount and exposes balances from the local store", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(pgliteCtor).toHaveBeenCalledTimes(1);
    expect(pgliteCtor).toHaveBeenCalledWith({ backend: "memory" });
    expect(result.current.balances.map((b) => b.accountId)).toEqual(["1"]);
    expect(result.current.balances[0].balance).toBeCloseTo(950.5, 9);
    expect(result.current.lastHydrate?.loaded.accounts).toBe(4);
    const accountCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).startsWith("/api/accounts")).length;
    expect(accountCalls).toBe(1);
  });

  it("never throws into the page: a failing API becomes status error", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    fetchSpy.mockImplementation(async () => {
      throw new Error("network down");
    });
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("network down");
    let out: unknown = "unset";
    await act(async () => {
      out = await result.current.refresh();
    });
    expect(out).toBeNull();
  });

  it("turning the flag off clears the status back to off and drops the store", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    const { result } = renderHook(() => useLocalAccountBalances());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    window.localStorage.removeItem(LOCAL_READ_CACHE_KEY);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe("off");
    expect(result.current.balances).toEqual([]);
  });
});
