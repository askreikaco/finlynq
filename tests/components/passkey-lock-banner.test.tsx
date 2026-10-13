/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  state: { enabled: false, locked: false, userId: "u1", unlock: vi.fn(async () => ({ ok: true }) as { ok: boolean; code?: string }) },
  pending: { items: [] as unknown[], enabled: true, locked: false },
}));

vi.mock("@/lib/data/passkey-unlock", () => ({ usePasskeyLock: () => h.state }));
vi.mock("@/lib/data/local-write-queue", () => ({
  usePendingSync: () => h.pending,
  discardPendingSync: vi.fn(),
  retryPendingSync: vi.fn(),
}));

import { PasskeyLockBanner } from "@/components/passkey-lock-banner";
import { PendingSyncCard } from "@/components/settings/sections/pending-sync-card";

beforeEach(() => {
  h.state = { enabled: false, locked: false, userId: "u1", unlock: vi.fn(async () => ({ ok: true })) };
  h.pending = { items: [], enabled: true, locked: false };
});
afterEach(() => {
  cleanup();
});

describe("PasskeyLockBanner", () => {
  it("is shown only when a passkey is enrolled AND this page is locked", () => {
    h.state = { ...h.state, enabled: false, locked: false };
    const { container, rerender } = render(<PasskeyLockBanner />);
    expect(container.innerHTML).toBe("");

    h.state = { ...h.state, enabled: true, locked: false }; // enrolled and unlocked
    rerender(<PasskeyLockBanner />);
    expect(screen.queryByTestId("passkey-lock-banner")).toBeNull();

    h.state = { ...h.state, enabled: false, locked: true }; // locked without a record cannot happen, but must not show
    rerender(<PasskeyLockBanner />);
    expect(screen.queryByTestId("passkey-lock-banner")).toBeNull();

    h.state = { ...h.state, enabled: true, locked: true };
    rerender(<PasskeyLockBanner />);
    expect(screen.getByTestId("passkey-lock-banner").textContent).toContain("Offline data locked: use your passkey");
  });

  it("the unlock button runs the passkey ceremony from the click and hides once unlocked", async () => {
    h.state = { ...h.state, enabled: true, locked: true };
    const { rerender } = render(<PasskeyLockBanner />);
    fireEvent.click(screen.getByTestId("passkey-lock-unlock"));
    await waitFor(() => expect(h.state.unlock).toHaveBeenCalledTimes(1));
    h.state = { ...h.state, locked: false };
    rerender(<PasskeyLockBanner />);
    expect(screen.queryByTestId("passkey-lock-banner")).toBeNull();
  });

  it("a cancelled ceremony keeps the banner and says so", async () => {
    h.state = { ...h.state, enabled: true, locked: true, unlock: vi.fn(async () => ({ ok: false, code: "cancelled" })) };
    render(<PasskeyLockBanner />);
    fireEvent.click(screen.getByTestId("passkey-lock-unlock"));
    expect(await screen.findByText("Cancelled.")).toBeTruthy();
    expect(screen.getByTestId("passkey-lock-banner")).toBeTruthy();
  });
});

describe("PendingSyncCard locked state", () => {
  it("shows 'Locked: unlock with passkey' while locked, and nothing when the queue has no entries", () => {
    h.pending = { items: [], enabled: true, locked: true };
    render(<PendingSyncCard />);
    expect(screen.getByTestId("pending-sync-locked").textContent).toContain("Locked: unlock with passkey");
  });

  it("renders nothing when unlocked with an empty queue", () => {
    h.pending = { items: [], enabled: true, locked: false };
    const { container } = render(<PendingSyncCard />);
    expect(container.innerHTML).toBe("");
  });
});
