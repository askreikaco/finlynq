/**
 * @vitest-environment jsdom
 * Trusted devices: "Sign out other devices" revokes every device except the
 * current one, one DELETE per id (never ?all=1, which would revoke this one).
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TrustedDevices } from "@/app/(app)/settings/account/_components/trusted-devices";

let calls: { method: string; url: string }[];
let devices: Array<Record<string, unknown>>;
let currentId: string | null;
let failIds: Set<string>;

const dev = (id: string, label: string) => ({ id, label, createdAt: "2026-09-01T10:00:00.000Z", lastUsedAt: null, expiresAt: "2026-12-01T00:00:00.000Z" });

beforeEach(() => {
  calls = [];
  failIds = new Set();
  currentId = "d1";
  devices = [dev("d1", "Chrome"), dev("d2", "Safari"), dev("d3", "Firefox")];
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (url === "/api/settings/sign-in-methods") return { ok: true, status: 200, json: async () => ({ devices }) } as Response;
      if (url === "/api/auth/device-current") return { ok: true, status: 200, json: async () => ({ id: currentId }) } as Response;
      if (method === "DELETE") {
        const id = new URL(url, "http://x").searchParams.get("id") ?? "";
        const ok = !failIds.has(id);
        return { ok, status: ok ? 200 : 500, json: async () => ({}) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const deletes = () => calls.filter((c) => c.method === "DELETE").map((c) => c.url);

describe("Sign out other devices", () => {
  it("revokes every non-current device by id, keeps the current one, never uses ?all=1", async () => {
    const user = userEvent.setup();
    render(<TrustedDevices />);
    await screen.findByText("Chrome");
    await user.click(screen.getByRole("button", { name: /sign out other devices/i }));
    await waitFor(() => expect(deletes()).toHaveLength(2));
    expect(deletes().sort()).toEqual(["/api/settings/devices?id=d2", "/api/settings/devices?id=d3"]);
    expect(deletes().some((u) => u.includes("all=1"))).toBe(false);
    expect(await screen.findByText(/other devices signed out/i)).toBeInTheDocument();
    expect(screen.getByText("Chrome")).toBeInTheDocument();
    expect(screen.queryByText("Safari")).toBeNull();
    expect(screen.queryByText("Firefox")).toBeNull();
    expect(screen.queryByRole("button", { name: /sign out other devices/i })).toBeNull();
  });

  it("is hidden when this is the only device; asks for confirmation (cancel = no calls)", async () => {
    devices = [dev("d1", "Chrome")];
    render(<TrustedDevices />);
    await screen.findByText("Chrome");
    expect(screen.queryByRole("button", { name: /sign out other devices/i })).toBeNull();
    cleanup();
    devices = [dev("d1", "Chrome"), dev("d2", "Safari")];
    (window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const user = userEvent.setup();
    render(<TrustedDevices />);
    await screen.findByText("Chrome");
    await user.click(screen.getByRole("button", { name: /sign out other devices/i }));
    expect(deletes()).toHaveLength(0);
  });

  it("a failed revoke keeps that device listed and reports an error", async () => {
    failIds = new Set(["d3"]);
    const user = userEvent.setup();
    render(<TrustedDevices />);
    await screen.findByText("Chrome");
    await user.click(screen.getByRole("button", { name: /sign out other devices/i }));
    expect(await screen.findByText(/an error occurred/i)).toBeInTheDocument();
    expect(screen.queryByText("Safari")).toBeNull();
    expect(screen.getByText("Firefox")).toBeInTheDocument();
  });
});
