// @vitest-environment jsdom
// DataProvider wipes the opt-in on-device read cache at the same places it wipes the SWR cache (WP5).
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";

import { DataProvider } from "@/lib/data/provider";

let sessionListener: ((i: unknown) => void) | null = null;
vi.mock("@/lib/data/session-info", () => ({
  getSessionInfo: vi.fn(),
  onSessionInfo: vi.fn((cb: (i: unknown) => void) => {
    sessionListener = cb;
    return () => {};
  }),
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

import { getSessionInfo } from "@/lib/data/session-info";
import { dropLocalUserCache } from "@/lib/data/local-read-cache-wipe";

const trusted = (id: string | null) =>
  vi.fn(async () => ({ ok: true, json: async () => ({ id }) }) as Response);

describe("DataProvider: local-first read-cache wipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionListener = null;
  });

  it("locked boot wipes the user's on-device read cache", async () => {
    vi.mocked(getSessionInfo).mockReturnValue({ userId: "u", locked: true });
    global.fetch = trusted("d1");
    const { unmount } = render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(dropLocalUserCache).toHaveBeenCalledWith("u"));
    unmount();
  });

  it("an untrusted device wipes the user's on-device read cache", async () => {
    vi.mocked(getSessionInfo).mockReturnValue({ userId: "u", locked: false });
    global.fetch = trusted(null);
    const { unmount } = render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(dropLocalUserCache).toHaveBeenCalledWith("u"));
    unmount();
  });

  it("a trusted, unlocked boot does not wipe", async () => {
    vi.mocked(getSessionInfo).mockReturnValue({ userId: "u", locked: false });
    const fetchMock = trusted("d1");
    global.fetch = fetchMock;
    const { unmount } = render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(dropLocalUserCache).not.toHaveBeenCalled();
    unmount();
  });

  it("lock or sign-out (session listener) wipes the user's on-device read cache", async () => {
    vi.mocked(getSessionInfo).mockReturnValue({ userId: "u", locked: false });
    global.fetch = trusted("d1");
    const { unmount } = render(<DataProvider><div>x</div></DataProvider>);
    await waitFor(() => expect(sessionListener).not.toBeNull());
    sessionListener!({ userId: "u", locked: true });
    expect(dropLocalUserCache).toHaveBeenCalledWith("u");
    unmount();
  });
});
