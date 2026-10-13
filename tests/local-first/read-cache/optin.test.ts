// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { isLocalReadCacheEnabled, setLocalReadCacheEnabled, localReadCacheState, LOCAL_READ_CACHE_KEY, type OptInStorage } from "@/lib/local-first/read-cache/optin";
import { readOptInState, readOptIn, writeOptIn, offlineStorageSupported } from "@/lib/local-first/opt-state";

function memStorage(initial: Record<string, string> = {}): OptInStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: OptInStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("read-cache switch (opt-out model, default ON)", () => {
  it("uses the documented key", () => {
    expect(LOCAL_READ_CACHE_KEY).toBe("finlynq.lf.read");
  });

  it("absent key => ON (default)", () => {
    expect(isLocalReadCacheEnabled(memStorage())).toBe(true);
    expect(localReadCacheState(memStorage())).toBe("default");
  });

  it("'1' => ON, '0' => OFF", () => {
    expect(isLocalReadCacheEnabled(memStorage({ [LOCAL_READ_CACHE_KEY]: "1" }))).toBe(true);
    expect(localReadCacheState(memStorage({ [LOCAL_READ_CACHE_KEY]: "1" }))).toBe("on");
    expect(isLocalReadCacheEnabled(memStorage({ [LOCAL_READ_CACHE_KEY]: "0" }))).toBe(false);
    expect(localReadCacheState(memStorage({ [LOCAL_READ_CACHE_KEY]: "0" }))).toBe("off");
  });

  it("only the exact '0' is OFF; any other stored value stays ON", () => {
    for (const v of ["", " 0", "0 ", "false", "off"]) {
      expect(isLocalReadCacheEnabled(memStorage({ [LOCAL_READ_CACHE_KEY]: v })), `value ${JSON.stringify(v)}`).toBe(true);
    }
  });

  it("no storage (SSR / node without window) => OFF", () => {
    expect(isLocalReadCacheEnabled(null)).toBe(false);
    expect(isLocalReadCacheEnabled()).toBe(false); // node env: no window
  });

  it("storage that throws => OFF, and never throws", () => {
    expect(isLocalReadCacheEnabled(throwing)).toBe(false);
    expect(readOptInState(throwing, LOCAL_READ_CACHE_KEY)).toBe("off");
    expect(readOptIn(throwing, LOCAL_READ_CACHE_KEY)).toBe(false);
  });

  it("no IndexedDB (unsupported device) => OFF without throwing", () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(offlineStorageSupported()).toBe(false);
    expect(isLocalReadCacheEnabled(memStorage())).toBe(false);
    expect(() => setLocalReadCacheEnabled(true, memStorage())).not.toThrow();
  });

  it("set(true) writes '1', set(false) writes '0' (never removes the key)", () => {
    const s = memStorage();
    setLocalReadCacheEnabled(true, s);
    expect(s.data.get(LOCAL_READ_CACHE_KEY)).toBe("1");
    expect(isLocalReadCacheEnabled(s)).toBe(true);
    setLocalReadCacheEnabled(false, s);
    expect(s.data.get(LOCAL_READ_CACHE_KEY)).toBe("0");
    expect(isLocalReadCacheEnabled(s)).toBe(false);
  });

  it("set swallows write failures and with no storage", () => {
    expect(() => setLocalReadCacheEnabled(true, throwing)).not.toThrow();
    expect(() => setLocalReadCacheEnabled(false, throwing)).not.toThrow();
    expect(() => setLocalReadCacheEnabled(true, null)).not.toThrow();
    expect(writeOptIn(throwing, LOCAL_READ_CACHE_KEY, true)).toBe(false);
  });

  it("opt-out persists across a fresh import (the default never re-enables it)", async () => {
    const s = memStorage();
    vi.stubGlobal("window", { localStorage: s });
    const first = await import("@/lib/local-first/read-cache/optin");
    first.setLocalReadCacheEnabled(false);
    expect(s.data.get(LOCAL_READ_CACHE_KEY)).toBe("0");
    vi.resetModules();
    const fresh = await import("@/lib/local-first/read-cache/optin");
    expect(fresh.isLocalReadCacheEnabled()).toBe(false);
    expect(fresh.localReadCacheState()).toBe("off");
  });
});
