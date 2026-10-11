/**
 * @vitest-environment jsdom
 * Editing a queued (not yet synced) create from the entry screen: prefilled from the outbox, saved back into it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const Q = vi.hoisted(() => ({
  on: true,
  fields: { date: "2026-02-01", accountId: 2, categoryId: 10, enteredCurrency: "USD", enteredAmount: -150, payee: "ACME", note: "keep me" } as Record<string, unknown> | null,
  get: vi.fn(),
  save: vi.fn(async (_id: string, _f: unknown) => true),
  push: vi.fn(),
}));
vi.mock("@/lib/data/local-write-queue", () => ({
  isLocalWriteQueueActive: () => Q.on,
  isLocalWriteQueueOn: () => Q.on,
  queueOfflineCreate: vi.fn(async () => true),
  queueOfflineEdit: vi.fn(async () => true),
  getQueuedCreate: (id: string) => Q.get(id),
  saveQueuedCreate: (id: string, f: unknown) => Q.save(id, f),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: Q.push, back: vi.fn() }),
  usePathname: () => "/transactions/new",
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts") return { isLoading: false, data: [{ id: 2, name: "Savings", currency: "USD", archived: false }] };
    if (url === "/api/categories") return { isLoading: false, data: [{ id: 10, name: "Food", type: "E" }] };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import Page from "@/app/(app)/transactions/new/page";

beforeEach(() => {
  Q.on = true; Q.push.mockClear(); Q.save.mockClear();
  Q.get.mockReset(); Q.get.mockImplementation(async () => Q.fields);
  sessionStorage.clear(); localStorage.clear();
  window.history.replaceState({}, "", "/transactions/new?queued=op1");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("edit of a queued create", () => {
  it("loads the outbox values, saves back into the queued entry, sends no request", async () => {
    render(<Page />);
    await waitFor(() => expect(Q.get).toHaveBeenCalledWith("op1"));
    await screen.findByDisplayValue("ACME");
    fireEvent.change(screen.getByDisplayValue("ACME"), { target: { value: "ACME 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved on this device — will sync when online");
    expect(Q.save).toHaveBeenCalledTimes(1);
    expect(Q.save.mock.calls[0][0]).toBe("op1");
    expect(Q.save.mock.calls[0][1]).toMatchObject({ date: "2026-02-01", accountId: 2, categoryId: 10, enteredCurrency: "USD", enteredAmount: -150, payee: "ACME 2", note: "keep me", tags: null });
    expect((fetch as any).mock.calls.some((c: any[]) => (c[1] as any)?.method === "POST")).toBe(false);
    await waitFor(() => expect(Q.push).toHaveBeenCalledWith("/transactions"), { timeout: 3000 });
  });

  it("an entry that already synced shows a calm notice", async () => {
    Q.fields = null;
    try {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      render(<Page />);
      await vi.advanceTimersByTimeAsync(6000);
      await screen.findByText(/no longer waiting on this device/);
    } finally {
      vi.useRealTimers();
      Q.fields = { date: "2026-02-01", accountId: 2, categoryId: 10, enteredCurrency: "USD", enteredAmount: -150, payee: "ACME", note: "keep me" };
    }
  });

  it("flag off: ?queued= is ignored (blank form, queue never read)", async () => {
    Q.on = false;
    render(<Page />);
    await new Promise((r) => setTimeout(r, 50));
    expect(Q.get).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("ACME")).toBeNull();
  });
});
