// @vitest-environment jsdom
// UnlockGate wipes the on-device read cache on signed-out boot and when a 423 locks the DEK (WP5).
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/unlock-panel", () => ({ UnlockPanel: () => null }));
vi.mock("@/lib/data/persist", () => ({ wipeAll: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/data/session-info", () => ({ getSessionInfo: vi.fn(() => null), setSessionInfo: vi.fn() }));
vi.mock("@/lib/data/local-read-cache-wipe", () => ({
  dropAllLocalCaches: vi.fn(() => Promise.resolve()),
  dropLocalUserCache: vi.fn(() => Promise.resolve()),
}));

import { UnlockGate } from "@/components/unlock-gate";
import { getSessionInfo, setSessionInfo } from "@/lib/data/session-info";
import { dropAllLocalCaches, dropLocalUserCache } from "@/lib/data/local-read-cache-wipe";

const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body }) as Response;

describe("UnlockGate: local-first read-cache wipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signed-out boot drops every on-device read cache", async () => {
    const f = vi.fn(async () => json({ authenticated: false }));
    vi.stubGlobal("fetch", f);
    render(<UnlockGate><div>app</div></UnlockGate>);
    await waitFor(() => expect(dropAllLocalCaches).toHaveBeenCalled());
    expect(setSessionInfo).toHaveBeenCalledWith(null);
    vi.unstubAllGlobals();
  });

  it("a 423 from an API (DEK locked) drops the signed-in user's read cache once", async () => {
    vi.mocked(getSessionInfo).mockReturnValue({ userId: "u1", locked: false });
    const f = vi.fn(async (input: unknown) => {
      if (String(input) === "/api/auth/session") return json({ authenticated: true, userId: "u1", encryptionLocked: false });
      return json({ error: "locked" }, 423);
    });
    vi.stubGlobal("fetch", f);
    window.fetch = f as unknown as typeof window.fetch;
    const { findByText } = render(<UnlockGate><div>app</div></UnlockGate>);
    await findByText("app");
    await window.fetch("/api/accounts");
    expect(setSessionInfo).toHaveBeenCalledWith({ userId: "u1", locked: true });
    expect(dropLocalUserCache).toHaveBeenCalledWith("u1");
    expect(dropAllLocalCaches).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
