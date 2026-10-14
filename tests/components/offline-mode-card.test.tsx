/**
 * @vitest-environment jsdom
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

const h = vi.hoisted(() => ({ trusted: "dev-1" as string | null, count: 0 }));
vi.mock("@/lib/data/trusted-device", () => ({ fetchTrustedDeviceId: async () => h.trusted }));
vi.mock("@/lib/data/session-info", () => ({ getSessionInfo: () => ({ userId: "u1", locked: false }), onSessionInfo: () => () => undefined }));

import * as facade from "@/lib/data/local-write-queue";
import { OfflineModeCard } from "@/components/settings/sections/offline-mode-card";

const sw = () => screen.getByRole("switch");
const status = () => screen.getByTestId("offline-mode-status").textContent;
beforeEach(() => { window.localStorage.clear(); h.trusted = "dev-1"; });
afterEach(() => { cleanup(); facade.stopLocalWriteQueue(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("OfflineModeCard", () => {
  it("renders label, help and encryption line; a user who never chose is On (default); no IndexedDB opened", async () => {
    const open = vi.spyOn(indexedDB, "open");
    render(<OfflineModeCard />);
    expect(screen.getByText("Offline mode (beta)", { selector: "[data-slot=card-title], h3, div, span" })).toBeTruthy();
    expect(screen.getByText(/Save new and edited transactions on this device when you are offline and sync them when you are back online\. Home and Accounts also open from the last saved data\. Trusted devices only\./)).toBeTruthy();
    expect(screen.getByTestId("offline-mode-encryption").textContent).toBe("Offline copies are encrypted on this device and wiped when you sign out. On a shared computer, turn this off.");
    expect(screen.getByTestId("offline-mode-unsynced-note").textContent).toBe("If you are signed out unexpectedly, unsent changes stay encrypted on this device until you sign in again.");
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
    expect(status()).toBe("On (default)");
    expect(open).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBeNull(); // showing the default writes nothing
  });

  it("explicit '1' shows On (not the default label)", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
    expect(status()).toBe("On");
  });

  it("explicit '0' shows Off", async () => {
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "0");
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("false"));
    expect(status()).toBe("Off");
  });

  it("untrusted device: disabled with explanation, shows Off, no toggle", async () => {
    h.trusted = null;
    render(<OfflineModeCard />);
    await screen.findByText("Only on trusted devices");
    expect(sw().hasAttribute("disabled") || sw().getAttribute("aria-disabled") === "true" || sw().hasAttribute("data-disabled")).toBe(true);
    expect(status()).toBe("Off");
    fireEvent.click(sw());
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBeNull();
  });

  it("turning OFF writes '0' (not removed) on both switches, shows Off, and turning ON writes '1' and starts the queue", async () => {
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().hasAttribute("disabled")).toBe(false));
    fireEvent.click(sw());
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("false"));
    expect(status()).toBe("Off");
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBe("0");
    expect(window.localStorage.getItem(LOCAL_READ_CACHE_KEY)).toBe("0");
    fireEvent.click(sw());
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
    expect(status()).toBe("On");
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBe("1");
    expect(window.localStorage.getItem(LOCAL_READ_CACHE_KEY)).toBe("1");
    expect(facade.isLocalWriteQueueActive()).toBe(true);
  });

  it("OFF without pending entries: no confirm, '0' written", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(sw());
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("false"));
    expect(screen.queryByText(/will be discarded/)).toBeNull();
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBe("0");
  });

  it("OFF with pending entries (default-on): confirm first; cancel keeps it on, confirm discards and writes '0'", async () => {
    vi.spyOn(facade, "countUnsyncedWrites").mockResolvedValue(2);
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(sw());
    await screen.findByText("2 unsynced changes will be discarded.");
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(/will be discarded/)).toBeNull());
    expect(sw().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw());
    await screen.findByText(/will be discarded/);
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBe("0"));
    expect(sw().getAttribute("aria-checked")).toBe("false");
  });

  it("key section: hidden when off; when on it shows the key info and a rotate button that rotates", async () => {
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "0");
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().hasAttribute("disabled")).toBe(false));
    expect(screen.queryByTestId("offline-key-section")).toBeNull();
    fireEvent.click(sw());
    await screen.findByTestId("offline-key-section");
    expect(screen.getByTestId("offline-key-age").textContent).toMatch(/Created when you first save something offline|Created (today|\d+ days? ago)/);
    // No key exists yet: rotating is a harmless no-op that reports "not done".
    fireEvent.click(screen.getByTestId("offline-key-rotate"));
    await screen.findByTestId("offline-key-failed");
    // With a key on this device, the button rotates it (generation goes 1 -> 2) and says so.
    const { deviceKeys } = await import("@/lib/local-first/crypto/device-key-provider");
    await deviceKeys.getOrCreateDeviceKey("u1");
    fireEvent.click(screen.getByTestId("offline-key-rotate"));
    await screen.findByTestId("offline-key-ok");
    expect((await deviceKeys.getKeyMeta("u1"))?.generation).toBe(2);
  });
});
