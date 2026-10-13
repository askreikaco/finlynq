/**
 * @vitest-environment jsdom
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { PASSKEY_UNLOCK_KEY } from "@/lib/local-first/crypto/passkey-unlock";

const h = vi.hoisted(() => ({
  status: { supported: true, enabled: false, createdAt: null as number | null },
  enable: vi.fn(async () => ({ ok: true }) as { ok: boolean; code?: string }),
  unlock: vi.fn(async () => ({ ok: true }) as { ok: boolean; code?: string }),
  disable: vi.fn(async () => ({ ok: true }) as { ok: boolean; code?: string }),
  unsynced: 0,
  fetch: vi.fn(),
}));
vi.mock("@/lib/data/session-info", () => ({ getSessionInfo: () => ({ userId: "u1", locked: false }), onSessionInfo: () => () => undefined }));
vi.mock("@/lib/data/local-write-queue", () => ({ countUnsyncedWrites: async () => h.unsynced }));
vi.mock("@/lib/data/passkey-unlock", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    getPasskeyUnlockStatus: async () => h.status,
    enablePasskeyUnlock: h.enable,
    unlockWithPasskey: h.unlock,
    disablePasskeyUnlock: h.disable,
    hasPasskeyUnlockedSession: () => false,
  };
});

import { PasskeyUnlockCard } from "@/components/settings/sections/passkey-unlock-card";

beforeEach(() => {
  window.localStorage.clear();
  h.status = { supported: true, enabled: false, createdAt: null };
  h.unsynced = 0;
  h.enable.mockClear();
  h.unlock.mockClear();
  h.disable.mockClear();
  h.fetch.mockClear();
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("PasskeyUnlockCard", () => {
  it("renders nothing while the flag is off (the default)", async () => {
    const { container } = render(<PasskeyUnlockCard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
  });

  it("flag on + supported + not enabled: shows the enable action, which calls enable and nothing else", async () => {
    window.localStorage.setItem(PASSKEY_UNLOCK_KEY, "1");
    render(<PasskeyUnlockCard />);
    fireEvent.click(await screen.findByTestId("passkey-unlock-enable"));
    await waitFor(() => expect(h.enable).toHaveBeenCalledWith("u1"));
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("flag on + not supported: says so and offers no action", async () => {
    window.localStorage.setItem(PASSKEY_UNLOCK_KEY, "1");
    h.status = { supported: false, enabled: false, createdAt: null };
    render(<PasskeyUnlockCard />);
    expect(await screen.findByTestId("passkey-unlock-unsupported")).toBeTruthy();
    expect(screen.queryByTestId("passkey-unlock-enable")).toBeNull();
  });

  it("enabled: turning off with queued writes asks first and does not disable until confirmed", async () => {
    window.localStorage.setItem(PASSKEY_UNLOCK_KEY, "1");
    h.status = { supported: true, enabled: true, createdAt: 1 };
    h.unsynced = 3;
    render(<PasskeyUnlockCard />);
    fireEvent.click(await screen.findByTestId("passkey-unlock-disable"));
    expect(await screen.findByText(/3 unsynced changes are waiting on this device/)).toBeTruthy();
    expect(h.disable).not.toHaveBeenCalled();
  });

  it("a cancelled test unlock shows a message and changes nothing", async () => {
    window.localStorage.setItem(PASSKEY_UNLOCK_KEY, "1");
    h.status = { supported: true, enabled: true, createdAt: 1 };
    h.unlock.mockResolvedValueOnce({ ok: false, code: "cancelled" });
    render(<PasskeyUnlockCard />);
    fireEvent.click(await screen.findByTestId("passkey-unlock-test"));
    expect((await screen.findByTestId("passkey-unlock-message")).textContent).toBe("Cancelled. Nothing was changed.");
    expect(h.disable).not.toHaveBeenCalled();
  });
});
