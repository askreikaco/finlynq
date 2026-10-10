/**
 * @vitest-environment jsdom
 * Multi-account B2 client hardening: per-user namespaced localStorage (chat,
 * spotlight, tx-prefs legacy drop), hardReload wiring (logout/login), and the
 * hardReload helper itself.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetSessionUserIdCache } from "@/lib/client/user-storage";
import React from "react";
import { render, screen, waitFor, fireEvent, cleanup, renderHook } from "@testing-library/react";

const hardReload = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("framer-motion", () => {
  const cache: Record<string, React.FC<React.PropsWithChildren<Record<string, unknown>>>> = {};
  return {
    // stable component per tag (a fresh one per access would remount on every render)
    motion: new Proxy({}, { get: (_t, tag: string) => (cache[tag] ??= (p) => React.createElement("div", null, p.children)) }),
    AnimatePresence: ({ children }: React.PropsWithChildren) => children,
  };
});
vi.mock("next/link", () => ({
  default: ({ children, href }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href }, children),
}));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/FinlynqLogo", () => ({ FinlynqLogo: () => null }));
vi.mock("@/components/feedback-dialog", () => ({ FeedbackDialog: () => null }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dev-mode-guard", () => ({ DevModeGuard: ({ children }: React.PropsWithChildren) => children }));
vi.mock("@/lib/client/hard-reload", async (orig) => {
  const real = await orig<typeof import("@/lib/client/hard-reload")>();
  return { ...real, hardReload: (...a: unknown[]) => hardReload(...a) };
});

import { ManageAccounts } from "@/components/manage-accounts";
import ChatPage from "@/app/(app)/chat/page";
import { ActionCenter } from "@/app/(app)/dashboard/_components/action-center";
import {
  userStorageKey, readUserItem, writeUserItem, removeUserItem, dropLegacyUnscopedKeys,
  PER_USER_STORAGE_KEYS,
} from "@/lib/client/user-storage";

let sessionUserId: string | null = "user-1";
let fetchLog: string[];
let gate: Promise<void> | null;

beforeEach(() => {
  resetSessionUserIdCache();
  cleanup();
  localStorage.clear();
  hardReload.mockClear();
  sessionUserId = "user-1";
  gate = null;
  fetchLog = [];
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    fetchLog.push(`${init?.method ?? "GET"} ${url}`);
    const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
    if (url.startsWith("/api/auth/session")) {
      if (gate) await gate;
      return json({ authenticated: !!sessionUserId, userId: sessionUserId, isAdmin: false });
    }
    if (url === "/api/auth/accounts") return json([
      { userId: "user-1", email: "me@example.com", displayName: "Me", active: true, status: "active" },
    ]);
    if (url.startsWith("/api/spotlight")) return json({ items: [
      { id: "s1", type: "t", severity: "info", title: "Item one", description: "d", actionUrl: "/x" },
      { id: "s2", type: "t", severity: "info", title: "Item two", description: "d", actionUrl: "/y" },
    ] });
    return json([]);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("user-storage helpers", () => {
  it("keys are `${base}:${userId}`; null userId reads and writes nothing (no un-namespaced alias)", () => {
    expect(userStorageKey("pf-chat-history", "u1")).toBe("pf-chat-history:u1");
    expect(writeUserItem("pf-chat-history", null, "x")).toBe(false);
    expect(readUserItem("pf-chat-history", null)).toBeNull();
    expect(localStorage.length).toBe(0);
    writeUserItem("pf-chat-history", "u1", "A");
    writeUserItem("pf-chat-history", "u2", "B");
    expect(readUserItem("pf-chat-history", "u1")).toBe("A");
    expect(readUserItem("pf-chat-history", "u2")).toBe("B");
    removeUserItem("pf-chat-history", "u1");
    expect(readUserItem("pf-chat-history", "u1")).toBeNull();
    expect(readUserItem("pf-chat-history", "u2")).toBe("B");
  });
  it("dropLegacyUnscopedKeys removes bare per-user keys only", () => {
    for (const k of [...PER_USER_STORAGE_KEYS, "pf-tx-cols-v1", "pf-font", "pf-sidebar-collapsed"]) localStorage.setItem(k, "1");
    localStorage.setItem("pf-chat-history:u1", "keep");
    dropLegacyUnscopedKeys();
    for (const k of [...PER_USER_STORAGE_KEYS, "pf-tx-cols-v1"]) expect(localStorage.getItem(k)).toBeNull();
    expect(localStorage.getItem("pf-chat-history:u1")).toBe("keep");
    expect(localStorage.getItem("pf-font")).toBe("1");
    expect(localStorage.getItem("pf-sidebar-collapsed")).toBe("1");
  });
});

describe("hardReload is used for sign-out", () => {
  it("Remove from this device (active account) POSTs /api/auth/logout then hardReload('/') (no router push/refresh)", async () => {
    render(<ManageAccounts />);
    fireEvent.click(await screen.findByRole("button", { name: /remove me@example.com from this device/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/"));
    expect(fetchLog).toContain("POST /api/auth/logout");
  });
});

describe("chat history is per-user", () => {
  const msg = (content: string) => JSON.stringify([{ id: "1", role: "user", text: content, timestamp: 1 }]);

  it("shows only the active user's history; legacy bare key is dropped, not shown", async () => {
    localStorage.setItem("pf-chat-history:user-A", msg("A secret question"));
    localStorage.setItem("pf-chat-history:user-1", msg("my own question"));
    localStorage.setItem("pf-chat-history", msg("legacy bare question"));
    render(<ChatPage />);
    expect(await screen.findByText("my own question")).toBeInTheDocument();
    expect(screen.queryByText("A secret question")).toBeNull();
    expect(screen.queryByText("legacy bare question")).toBeNull();
    expect(localStorage.getItem("pf-chat-history")).toBeNull();
    expect(localStorage.getItem("pf-chat-history:user-A")).toBe(msg("A secret question")); // A's data untouched
  });

  it("renders nothing from storage before the userId is known (no flash of the previous user's data)", async () => {
    localStorage.setItem("pf-chat-history:user-1", msg("my own question"));
    let release!: () => void;
    gate = new Promise<void>((r) => { release = r; });
    render(<ChatPage />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("my own question")).toBeNull();
    release();
    expect(await screen.findByText("my own question")).toBeInTheDocument();
  });

  it("signed out (userId null): nothing is read", async () => {
    sessionUserId = null;
    localStorage.setItem("pf-chat-history:user-A", msg("A secret question"));
    localStorage.setItem("pf-chat-history", msg("legacy bare question"));
    render(<ChatPage />);
    await waitFor(() => expect(fetchLog).toContain("GET /api/auth/session"));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("A secret question")).toBeNull();
    expect(screen.queryByText("legacy bare question")).toBeNull();
  });
});

describe("spotlight dismissals are per-user", () => {
  it("B does not inherit A's dismissed items; dismissing writes only B's key", async () => {
    localStorage.setItem("pf-spotlight-dismissed:user-A", JSON.stringify(["s1", "s2"]));
    localStorage.setItem("pf-spotlight-dismissed", JSON.stringify(["s1", "s2"])); // legacy
    sessionUserId = "user-B";
    render(<ActionCenter />);
    expect(await screen.findByText("Item one")).toBeInTheDocument();
    expect(screen.getByText("Item two")).toBeInTheDocument();
    expect(localStorage.getItem("pf-spotlight-dismissed")).toBeNull();
    const dismissBtn = screen.getAllByRole("button")[0];
    fireEvent.click(dismissBtn);
    await waitFor(() => expect(localStorage.getItem("pf-spotlight-dismissed:user-B")).not.toBeNull());
    expect(JSON.parse(localStorage.getItem("pf-spotlight-dismissed:user-A")!)).toEqual(["s1", "s2"]);
    expect(localStorage.getItem("pf-spotlight-dismissed")).toBeNull();
  });

  it("nothing is rendered until the userId is known", async () => {
    let release!: () => void;
    gate = new Promise<void>((r) => { release = r; });
    render(<ActionCenter />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Item one")).toBeNull();
    release();
    expect(await screen.findByText("Item one")).toBeInTheDocument();
  });
});

describe("transactions column prefs: legacy blob dropped, never migrated", () => {
  it("removes bare pf-tx-cols-v1 and does not PUT it to the server", async () => {
    vi.resetModules();
    vi.doMock("swr", () => ({
      default: (key: string) => key.includes("tx-columns") ? { data: { columns: [] }, error: undefined } : { data: undefined, error: undefined },
    }));
    const { useTxColumnPrefs } = await import("@/app/(app)/transactions/_hooks/use-tx-prefs");
    localStorage.setItem("pf-tx-cols-v1", JSON.stringify({ portfolio: true }));
    renderHook(() => useTxColumnPrefs());
    await waitFor(() => expect(localStorage.getItem("pf-tx-cols-v1")).toBeNull());
    await new Promise((r) => setTimeout(r, 500));
    // the only PUT allowed is the debounced echo of DEFAULT prefs, never a "portfolio visible" legacy value
    const puts = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.filter((c) => c[1]?.method === "PUT");
    for (const [, init] of puts) {
      const cols = JSON.parse(String(init.body)).columns as { id: string; visible: boolean }[];
      expect(cols.find((c) => c.id === "portfolio")?.visible).not.toBe(true);
    }
    vi.doUnmock("swr");
  });
});
