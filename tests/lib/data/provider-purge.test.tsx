// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";

import { DataProvider } from "@/lib/data/provider";
import { isSafeToPersist } from "@/lib/data/persist-policy";

// Mock the modules
vi.mock("@/lib/data/session-info", () => ({
  getSessionInfo: vi.fn(),
  onSessionInfo: vi.fn((cb) => () => {}),
}));

vi.mock("@/lib/data/persist", () => ({
  persistSupported: vi.fn(() => true),
  loadPersisted: vi.fn(() => Promise.resolve(new Map())),
  purgeDisallowed: vi.fn(() => Promise.resolve()),
  wipeUser: vi.fn(() => Promise.resolve()),
}));

import { getSessionInfo, onSessionInfo } from "@/lib/data/session-info";
import { persistSupported, loadPersisted, purgeDisallowed, wipeUser } from "@/lib/data/persist";

describe("DataProvider: purgeDisallowed integration (M7a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub global.fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ id: null }),
      } as Response),
    );
  });

  it("purgeDisallowed is called during hydration with userId and BUILD", async () => {
    const mockGetSessionInfo = getSessionInfo as any;
    const mockLoadPersisted = loadPersisted as any;
    const mockPurgeDisallowed = purgeDisallowed as any;

    // Setup: unlocked user, trusted device
    mockGetSessionInfo.mockReturnValue({
      userId: "u",
      locked: false,
    });

    // Setup: loadPersisted returns an empty map (normal hydration)
    mockLoadPersisted.mockResolvedValue(new Map());

    // Render the provider
    const { unmount } = render(
      <DataProvider>
        <div data-testid="child">test</div>
      </DataProvider>,
    );

    // Wait for the effect to run
    await waitFor(() => {
      // purgeDisallowed should be called with userId and BUILD
      expect(mockPurgeDisallowed).toHaveBeenCalled();
    });

    // Verify the call arguments
    expect(mockPurgeDisallowed.mock.calls[0][0]).toBe("u");
    // BUILD is from provider.tsx: process.env.NEXT_PUBLIC_APP_BUILD ?? "dev"
    expect(mockPurgeDisallowed.mock.calls[0][1]).toBe("dev");

    unmount();
  });

  it("loadPersisted is called with isSafeToPersist predicate", async () => {
    const mockGetSessionInfo = getSessionInfo as any;
    const mockLoadPersisted = loadPersisted as any;
    const mockPurgeDisallowed = purgeDisallowed as any;

    mockGetSessionInfo.mockReturnValue({
      userId: "u",
      locked: false,
    });

    mockLoadPersisted.mockResolvedValue(new Map());

    const { unmount } = render(
      <DataProvider>
        <div>test</div>
      </DataProvider>,
    );

    await waitFor(() => {
      expect(mockLoadPersisted).toHaveBeenCalled();
    });

    // Verify the predicate argument is isSafeToPersist (reference equality)
    expect(mockLoadPersisted.mock.calls[0][2]).toBe(isSafeToPersist);

    unmount();
  });

  it("wipeUser is called when device is locked", async () => {
    const mockGetSessionInfo = getSessionInfo as any;
    const mockWipeUser = wipeUser as any;
    const mockPurgeDisallowed = purgeDisallowed as any;

    mockGetSessionInfo.mockReturnValue({
      userId: "u",
      locked: true,
    });

    const { unmount } = render(
      <DataProvider>
        <div>test</div>
      </DataProvider>,
    );

    await waitFor(() => {
      expect(mockWipeUser).toHaveBeenCalledWith("u");
    });

    // When locked, purgeDisallowed should NOT be called
    expect(mockPurgeDisallowed).not.toHaveBeenCalled();

    unmount();
  });

  it("purgeDisallowed is NOT called when device is locked", async () => {
    const mockGetSessionInfo = getSessionInfo as any;
    const mockPurgeDisallowed = purgeDisallowed as any;

    mockGetSessionInfo.mockReturnValue({
      userId: "u",
      locked: true,
    });

    const { unmount } = render(
      <DataProvider>
        <div>test</div>
      </DataProvider>,
    );

    await waitFor(() => {
      // When locked, wipeUser is called instead
      expect(mockPurgeDisallowed).not.toHaveBeenCalled();
    });

    unmount();
  });
});
