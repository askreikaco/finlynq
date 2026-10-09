/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getRecent,
  pushRecent,
  getLastAccount,
  setLastAccount,
  filterRecent,
} from "@/lib/transactions/recent-picks";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("pushRecent / getRecent", () => {
  it("caps the list at 6 entries", () => {
    for (let i = 1; i <= 8; i++) pushRecent("category", "E", String(i));
    expect(getRecent("category", "E")).toEqual(["8", "7", "6", "5", "4", "3"]);
  });

  it("de-duplicates and moves a re-picked id to the front", () => {
    pushRecent("account", "E", "a");
    pushRecent("account", "E", "b");
    pushRecent("account", "E", "c");
    pushRecent("account", "E", "a");
    expect(getRecent("account", "E")).toEqual(["a", "c", "b"]);
  });

  it("keeps most recent first", () => {
    pushRecent("category", "I", "x");
    pushRecent("category", "I", "y");
    expect(getRecent("category", "I")).toEqual(["y", "x"]);
  });

  it("keys lists per kind and per transaction type", () => {
    pushRecent("category", "E", "1");
    pushRecent("category", "I", "2");
    pushRecent("account", "E", "3");
    expect(getRecent("category", "E")).toEqual(["1"]);
    expect(getRecent("category", "I")).toEqual(["2"]);
    expect(getRecent("account", "E")).toEqual(["3"]);
    expect(getRecent("account", "T")).toEqual([]);
  });

  it("uses the finlynq:tx-recent: prefix", () => {
    pushRecent("category", "E", "9");
    const keys = Object.keys(window.localStorage);
    expect(keys.length).toBe(1);
    expect(keys[0].startsWith("finlynq:tx-recent:")).toBe(true);
  });

  it("stores IDs only, never names", () => {
    pushRecent("category", "E", "42");
    const raw = window.localStorage.getItem("finlynq:tx-recent:category:E");
    expect(raw).toBe('["42"]');
  });

  it("ignores empty ids and tolerates malformed stored values", () => {
    pushRecent("category", "E", "");
    expect(getRecent("category", "E")).toEqual([]);
    window.localStorage.setItem(
      "finlynq:tx-recent:category:E",
      JSON.stringify([{ name: "Food" }, null, "7", 8, "7", ""]),
    );
    expect(getRecent("category", "E")).toEqual(["7", "8"]);
    window.localStorage.setItem("finlynq:tx-recent:category:E", "not json{");
    expect(getRecent("category", "E")).toEqual([]);
    window.localStorage.setItem("finlynq:tx-recent:category:E", '{"a":1}');
    expect(getRecent("category", "E")).toEqual([]);
  });
});

describe("filterRecent", () => {
  it("keeps only ids present in the list, in recent order", () => {
    expect(filterRecent(["3", "9", "1"], ["1", "2", "3"])).toEqual(["3", "1"]);
    expect(filterRecent(["9"], ["1"])).toEqual([]);
  });
});

describe("last account", () => {
  it("returns null when nothing was set", () => {
    expect(getLastAccount()).toBeNull();
  });

  it("round-trips the id", () => {
    setLastAccount("12");
    expect(getLastAccount()).toBe("12");
    setLastAccount(15);
    expect(getLastAccount()).toBe("15");
  });
});

describe("storage failures", () => {
  it("getRecent returns [] when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getRecent("account", "E")).toEqual([]);
    expect(getLastAccount()).toBeNull();
  });

  it("pushRecent and setLastAccount do not throw when setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => pushRecent("category", "E", "1")).not.toThrow();
    expect(() => setLastAccount("1")).not.toThrow();
  });

  it("returns defaults when the localStorage accessor throws", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getRecent("category", "E")).toEqual([]);
    expect(getLastAccount()).toBeNull();
    expect(() => pushRecent("category", "E", "1")).not.toThrow();
    expect(() => setLastAccount("1")).not.toThrow();
  });
});

describe("SSR", () => {
  it("returns defaults and writes nothing when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(getRecent("category", "E")).toEqual([]);
    expect(getLastAccount()).toBeNull();
    expect(() => pushRecent("category", "E", "1")).not.toThrow();
    expect(() => setLastAccount("1")).not.toThrow();
    vi.unstubAllGlobals();
    expect(window.localStorage.length).toBe(0);
  });
});
