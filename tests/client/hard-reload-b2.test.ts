/**
 * Multi-account B2: hardReload = full page load via window.location.assign
 * (node env: window.location is stubbed; jsdom's is not configurable).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const assign = vi.fn();
const store = new Map<string, string>();

beforeEach(() => {
  assign.mockClear();
  store.clear();
  vi.stubGlobal("window", { location: { assign, pathname: "/settings" } });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

import { hardReload, hardReloadAfterLogout, clearPerUserStorage } from "@/lib/client/hard-reload";

describe("hardReload", () => {
  it("navigates with window.location.assign (full load); default = current path", () => {
    hardReload("/dashboard");
    hardReload();
    expect(assign).toHaveBeenNthCalledWith(1, "/dashboard");
    expect(assign).toHaveBeenNthCalledWith(2, "/settings");
  });

  it("clearPerUserStorage removes that user's namespaced keys + legacy bare keys, keeps other users and device keys", () => {
    store.set("pf-chat-history:u1", "x");
    store.set("pf-dismissed-tips:u1", "x");
    store.set("pf-spotlight-dismissed:u1", "x");
    store.set("pf-chat-history:u2", "y");
    store.set("pf-chat-history", "legacy");
    store.set("pf-tx-cols-v1", "legacy");
    store.set("pf-font", "inter");
    clearPerUserStorage("u1");
    expect([...store.keys()].sort()).toEqual(["pf-chat-history:u2", "pf-font"]);
  });

  it("hardReloadAfterLogout clears then reloads", () => {
    store.set("pf-chat-history:u1", "x");
    hardReloadAfterLogout("u1", "/cloud");
    expect(store.size).toBe(0);
    expect(assign).toHaveBeenCalledWith("/cloud");
  });
});
