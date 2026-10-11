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
beforeEach(() => { window.localStorage.clear(); h.trusted = "dev-1"; });
afterEach(() => { cleanup(); facade.stopLocalWriteQueue(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("OfflineModeCard", () => {
  it("renders label and help text; default off; no IndexedDB opened", async () => {
    const open = vi.spyOn(indexedDB, "open");
    render(<OfflineModeCard />);
    expect(screen.getByText("Offline mode (beta)", { selector: "[data-slot=card-title], h3, div" })).toBeTruthy();
    expect(screen.getByText(/Save new and edited transactions on this device when you are offline and sync them when you are back online\. Trusted devices only\./)).toBeTruthy();
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("false"));
    expect(open).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBeNull();
  });

  it("reflects the real flag", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
  });

  it("untrusted device: disabled with explanation, no toggle", async () => {
    h.trusted = null;
    render(<OfflineModeCard />);
    await screen.findByText("Only on trusted devices");
    expect(sw().hasAttribute("disabled") || sw().getAttribute("aria-disabled") === "true" || sw().hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(sw());
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBeNull();
  });

  it("ON calls the facade with user and device, sets both opt-ins and starts the queue", async () => {
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().hasAttribute("disabled")).toBe(false));
    fireEvent.click(sw());
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBe("1");
    expect(window.localStorage.getItem(LOCAL_READ_CACHE_KEY)).toBe("1");
    expect(facade.isLocalWriteQueueActive()).toBe(true);
  });

  it("OFF without pending entries: no confirm, flag cleared", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(sw());
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("false"));
    expect(screen.queryByText(/will be discarded/)).toBeNull();
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBeNull();
  });

  it("OFF with pending entries: confirm first; cancel keeps it on, confirm discards", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    vi.spyOn(facade, "countUnsyncedWrites").mockResolvedValue(2);
    render(<OfflineModeCard />);
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(sw());
    await screen.findByText("2 unsynced changes will be discarded.");
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(/will be discarded/)).toBeNull());
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBe("1");
    fireEvent.click(sw());
    await screen.findByText(/will be discarded/);
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBeNull());
    expect(sw().getAttribute("aria-checked")).toBe("false");
    expect(window.localStorage.getItem(LOCAL_WRITE_QUEUE_KEY)).toBeNull();
  });
});
