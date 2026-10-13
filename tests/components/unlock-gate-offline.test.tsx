// @vitest-environment jsdom
import "fake-indexeddb/auto"; // Offline mode needs IndexedDB + WebCrypto to be ON (device support check)
// Cold start with no network (Offline mode): the gate opens from the remembered identity instead of redirecting to a
// login page it cannot load; the real check runs again when the network returns.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, waitFor, cleanup, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ replace: vi.fn(), info: null as null | { userId: string; locked: boolean; offline?: boolean } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace }) }));
vi.mock("@/components/unlock-panel", () => ({ UnlockPanel: () => null }));
vi.mock("@/lib/data/persist", () => ({ wipeAll: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/data/local-read-cache-wipe", () => ({
  dropAllLocalCaches: vi.fn(() => Promise.resolve()),
  dropSignedOutDisposableCaches: vi.fn(() => Promise.resolve()),
  dropLocalUserCache: vi.fn(() => Promise.resolve()),
  dropLocalDisposableCaches: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/data/session-info", () => ({
  getSessionInfo: () => h.info,
  setSessionInfo: (i: typeof h.info) => {
    h.info = i;
  },
}));

import { UnlockGate } from "@/components/unlock-gate";
import { dropAllLocalCaches, dropSignedOutDisposableCaches } from "@/lib/data/local-read-cache-wipe";
import { OFFLINE_IDENTITY_KEY } from "@/lib/data/offline-identity";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body }) as Response;
const flagsOn = () => {
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
};
const remember = () => window.localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ userId: "u1", deviceId: "d1", at: Date.now() }));

beforeEach(() => {
  window.localStorage.clear();
  h.info = null;
  h.replace.mockReset();
  vi.mocked(dropAllLocalCaches).mockClear();
  vi.mocked(dropSignedOutDisposableCaches).mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UnlockGate: opening with no network", () => {
  it("Offline mode on + remembered identity + network failure: the app opens, marked offline, no redirect", async () => {
    flagsOn();
    remember();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { findByText } = render(<UnlockGate><div>app</div></UnlockGate>);
    await findByText("app");
    expect(h.info).toEqual({ userId: "u1", locked: false, offline: true });
    expect(h.replace).not.toHaveBeenCalled();
    expect(dropAllLocalCaches).not.toHaveBeenCalled();
  });

  it("no remembered identity: unchanged, the user is sent to sign in", async () => {
    flagsOn();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<UnlockGate><div>app</div></UnlockGate>);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/cloud"));
  });

  it("Offline mode off ('0', stray record ignored): unchanged, sent to sign in", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "0");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "0");
    remember();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<UnlockGate><div>app</div></UnlockGate>);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/cloud"));
  });

  it("a server answer that is not JSON while the browser is online is not 'offline': sent to sign in", async () => {
    flagsOn();
    remember();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } }) as unknown as Response));
    render(<UnlockGate><div>app</div></UnlockGate>);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/cloud"));
  });

  it("a hanging session check opens from the remembered identity after the timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      flagsOn();
      remember();
      vi.stubGlobal("fetch", vi.fn((_u: string, init?: { signal?: AbortSignal }) => new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })));
      const { container } = render(<UnlockGate><div>app</div></UnlockGate>);
      expect(container.textContent).not.toContain("app"); // still waiting on the hanging request
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6100);
      });
      expect(container.textContent).toContain("app");
      expect(h.info?.offline).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("network back: the real check runs; a valid session clears the offline mark", async () => {
    flagsOn();
    remember();
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return json({ authenticated: true, userId: "u1", encryptionLocked: false, username: "me" });
    }));
    const { findByText } = render(<UnlockGate><div>app</div></UnlockGate>);
    await findByText("app");
    expect(h.info?.offline).toBe(true);
    online = true;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(h.info).toEqual({ userId: "u1", locked: false }));
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("network back and the session is gone: the usual sign-out (wipe + redirect)", async () => {
    flagsOn();
    remember();
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return json({ authenticated: false });
    }));
    const { findByText } = render(<UnlockGate><div>app</div></UnlockGate>);
    await findByText("app");
    online = true;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/cloud"));
    // Expired or unauthenticated session: disposable copies only; outboxes stay for the same account to drain later.
    expect(dropSignedOutDisposableCaches).toHaveBeenCalled();
    expect(dropAllLocalCaches).not.toHaveBeenCalled();
    expect(h.info).toBeNull();
  });
});
