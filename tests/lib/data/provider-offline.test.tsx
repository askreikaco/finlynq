// @vitest-environment jsdom
// DataProvider and the remembered identity: a trusted device is remembered while Offline mode is on; opened with no
// network, the remembered (trusted) device starts the offline write queue; the real device check runs on `online`.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, waitFor, cleanup, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ info: null as null | { userId: string; locked: boolean; offline?: boolean }, start: vi.fn() }));

vi.mock("@/lib/data/session-info", () => ({
  getSessionInfo: () => h.info,
  onSessionInfo: () => () => {},
}));
vi.mock("@/lib/data/persist", () => ({
  persistSupported: vi.fn(() => true),
  loadPersisted: vi.fn(() => Promise.resolve(new Map())),
  purgeDisallowed: vi.fn(() => Promise.resolve()),
  wipeUser: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/data/local-read-cache-wipe", () => ({
  dropLocalUserCache: vi.fn(() => Promise.resolve()),
  dropAllLocalCaches: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/data/local-write-queue", () => ({
  startLocalWriteQueue: (...a: unknown[]) => h.start(...a),
  setLocalWriteSyncedHandler: vi.fn(),
}));

import { DataProvider } from "@/lib/data/provider";
import { OFFLINE_IDENTITY_KEY } from "@/lib/data/offline-identity";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

const flagsOn = () => {
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
};
const stored = () => {
  const raw = window.localStorage.getItem(OFFLINE_IDENTITY_KEY);
  return raw ? (JSON.parse(raw) as { userId: string; deviceId: string }) : null;
};
const device = (id: string | null) => ({ ok: true, json: async () => ({ id }) }) as Response;

beforeEach(() => {
  window.localStorage.clear();
  h.start.mockReset();
  h.info = { userId: "u1", locked: false };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DataProvider: remembered identity", () => {
  it("online, trusted, Offline mode on: the identity is remembered and the queue starts", async () => {
    flagsOn();
    vi.stubGlobal("fetch", vi.fn(async () => device("d1")));
    render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(h.start).toHaveBeenCalledWith("u1", "d1"));
    expect(stored()).toMatchObject({ userId: "u1", deviceId: "d1" });
  });

  it("Offline mode off: nothing is remembered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => device("d1")));
    render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(h.start).toHaveBeenCalled());
    expect(stored()).toBeNull();
  });

  it("an untrusted device forgets the identity", async () => {
    flagsOn();
    window.localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ userId: "u1", deviceId: "d1", at: Date.now() }));
    vi.stubGlobal("fetch", vi.fn(async () => device(null)));
    render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(stored()).toBeNull());
    expect(h.start).not.toHaveBeenCalled();
  });

  it("opened offline from the remembered identity: the remembered device starts the offline queue", async () => {
    flagsOn();
    window.localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ userId: "u1", deviceId: "d9", at: Date.now() }));
    h.info = { userId: "u1", locked: false, offline: true };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(h.start).toHaveBeenCalledWith("u1", "d9"));
  });

  it("a failed device check when the app did NOT open offline changes nothing (stays untrusted)", async () => {
    flagsOn();
    window.localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ userId: "u1", deviceId: "d9", at: Date.now() }));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<DataProvider><div>x</div></DataProvider>);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.start).not.toHaveBeenCalled();
  });

  it("a remembered identity for a different user is not used", async () => {
    flagsOn();
    window.localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ userId: "someone-else", deviceId: "d9", at: Date.now() }));
    h.info = { userId: "u1", locked: false, offline: true };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<DataProvider><div>x</div></DataProvider>);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.start).not.toHaveBeenCalled();
  });

  it("network back after an offline open: the real device check runs", async () => {
    flagsOn();
    window.localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ userId: "u1", deviceId: "d9", at: Date.now() }));
    h.info = { userId: "u1", locked: false, offline: true };
    let online = false;
    const f = vi.fn(async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return device("d9");
    });
    vi.stubGlobal("fetch", f);
    render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
    const callsBefore = f.mock.calls.length;
    online = true;
    h.info = { userId: "u1", locked: false }; // the gate's real check has replaced the offline mark
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(stored()).toMatchObject({ deviceId: "d9" });
  });
});
