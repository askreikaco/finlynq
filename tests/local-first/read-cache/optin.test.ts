// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isLocalReadCacheEnabled, setLocalReadCacheEnabled, LOCAL_READ_CACHE_KEY, type OptInStorage } from "@/lib/local-first/read-cache/optin";

function memStorage(initial: Record<string, string> = {}): OptInStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("read-cache opt-in", () => {
  it("uses the documented key", () => {
    expect(LOCAL_READ_CACHE_KEY).toBe("finlynq.lf.read");
  });

  it("is on only for the exact value '1'", () => {
    expect(isLocalReadCacheEnabled(memStorage({ [LOCAL_READ_CACHE_KEY]: "1" }))).toBe(true);
    for (const v of ["0", "true", "yes", "", " 1", "1 "]) {
      expect(isLocalReadCacheEnabled(memStorage({ [LOCAL_READ_CACHE_KEY]: v })), `value ${JSON.stringify(v)}`).toBe(false);
    }
    expect(isLocalReadCacheEnabled(memStorage())).toBe(false);
  });

  it("is off with no storage (SSR / node) and when reads throw", () => {
    expect(isLocalReadCacheEnabled(null)).toBe(false);
    expect(isLocalReadCacheEnabled()).toBe(false); // node env: no window
    const throwing: OptInStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(isLocalReadCacheEnabled(throwing)).toBe(false);
  });

  it("set(true) writes '1', set(false) removes the key", () => {
    const s = memStorage();
    setLocalReadCacheEnabled(true, s);
    expect(s.data.get(LOCAL_READ_CACHE_KEY)).toBe("1");
    expect(isLocalReadCacheEnabled(s)).toBe(true);
    setLocalReadCacheEnabled(false, s);
    expect(s.data.has(LOCAL_READ_CACHE_KEY)).toBe(false);
    expect(isLocalReadCacheEnabled(s)).toBe(false);
  });

  it("set swallows write failures and with no storage", () => {
    const throwing: OptInStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => setLocalReadCacheEnabled(true, throwing)).not.toThrow();
    expect(() => setLocalReadCacheEnabled(false, throwing)).not.toThrow();
    expect(() => setLocalReadCacheEnabled(true, null)).not.toThrow();
  });
});
