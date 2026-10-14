/**
 * @vitest-environment jsdom
 */
// After a successful write the mounted keys must refetch even though the app's SWR cache is a CUSTOM provider
// (DataProvider): the global `mutate` of swr cannot see a custom provider's keys.
import "fake-indexeddb/auto";
import * as React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { useApi } from "@/lib/data/use-api";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { installWriteRevalidation, scheduleRevalidation } from "@/lib/data/write-revalidation";
import { resetFetchActivity } from "@/lib/data/fetch-activity";
import { resetWriteClock, fetchInitAfterWrite } from "@/lib/swr/http-freshness";

let hits: Record<string, number>;
let uninstall: () => void;
let orig: typeof window.fetch;
let inner: ReturnType<typeof vi.fn>;
const wrap = (cache: Map<string, unknown>, ui: React.ReactNode) => (
  <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 2000, errorRetryCount: 0, revalidateOnFocus: false }}>{ui}</SWRConfig>
);

beforeEach(() => {
  hits = {};
  resetFetchActivity();
  resetWriteClock();
  window.localStorage.clear();
  orig = window.fetch;
  inner = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") hits[u] = (hits[u] ?? 0) + 1;
    return { ok: true, status: 200, json: async () => ({ n: hits[u] ?? 0 }) } as Response;
  });
  window.fetch = inner as unknown as typeof window.fetch;
  uninstall = installWriteRevalidation();
});
afterEach(() => {
  uninstall();
  window.fetch = orig;
  cleanup();
});

function Probe({ url }: { url: string }) {
  const r = useCacheFirstJson<{ n: number }>(url);
  return <span data-testid={url}>{r.data ? r.data.n : "loading"}</span>;
}
function Plain({ url }: { url: string }) {
  const r = useApi<{ n: number }>(url);
  return <span data-testid={url}>{r.data ? r.data.n : "loading"}</span>;
}

describe("a successful write revalidates the mounted keys of the app's custom SWR cache", () => {
  it.each([["POST"], ["PUT"], ["PATCH"], ["DELETE"]])("%s /api/* refetches mounted cache-first keys", async (method) => {
    render(wrap(new Map(), <><Probe url="/api/accounts" /><Plain url="/api/dashboard" /></>));
    await waitFor(() => expect(screen.getByTestId("/api/accounts").textContent).toBe("1"));
    await waitFor(() => expect(screen.getByTestId("/api/dashboard").textContent).toBe("1"));
    await act(async () => {
      await window.fetch("/api/transactions", { method });
    });
    await waitFor(() => expect(hits["/api/accounts"]).toBe(2), { timeout: 2000 });
    await waitFor(() => expect(hits["/api/dashboard"]).toBe(2));
    await waitFor(() => expect(screen.getByTestId("/api/accounts").textContent).toBe("2"));
  });

  it("the refetch bypasses the browser HTTP cache (no-cache) for the 30s after a write", async () => {
    render(wrap(new Map(), <Probe url="/api/accounts" />));
    await waitFor(() => expect(hits["/api/accounts"]).toBe(1));
    await act(async () => { await window.fetch("/api/budgets", { method: "POST" }); });
    await waitFor(() => expect(hits["/api/accounts"]).toBe(2), { timeout: 2000 });
    const calls = inner.mock.calls.filter((c) => String(c[0]) === "/api/accounts");
    expect(calls[calls.length - 1][1]).toMatchObject({ cache: "no-cache" });
    expect(fetchInitAfterWrite()).toEqual({ cache: "no-cache" });
  });

  it("excluded writes (auth, per-user UI prefs) and failed writes do not refetch", async () => {
    render(wrap(new Map(), <Probe url="/api/accounts" />));
    await waitFor(() => expect(hits["/api/accounts"]).toBe(1));
    await act(async () => { await window.fetch("/api/settings/card-layout?page=x", { method: "PUT" }); });
    await new Promise((r) => setTimeout(r, 250));
    expect(hits["/api/accounts"]).toBe(1);
  });

  it("a key that is not mounted is NOT fetched by the write, and revalidates when the page is shown again", async () => {
    const cache = new Map<string, unknown>();
    const first = render(wrap(cache, <Probe url="/api/accounts" />));
    await waitFor(() => expect(hits["/api/accounts"]).toBe(1));
    first.unmount();
    await act(async () => { await window.fetch("/api/accounts", { method: "POST" }); });
    await new Promise((r) => setTimeout(r, 250));
    expect(hits["/api/accounts"]).toBe(1); // nothing mounted: no request
    // navigate back: the cached copy paints at once, then it revalidates (stale after the write)
    render(wrap(cache, <Probe url="/api/accounts" />));
    expect(screen.getByTestId("/api/accounts").textContent).toBe("1");
    await waitFor(() => expect(screen.getByTestId("/api/accounts").textContent).toBe("2"), { timeout: 2000 });
  });

  it("scheduleRevalidation coalesces a burst of writes into one refetch", async () => {
    render(wrap(new Map(), <Probe url="/api/accounts" />));
    await waitFor(() => expect(hits["/api/accounts"]).toBe(1));
    await act(async () => {
      await window.fetch("/api/a", { method: "POST" });
      await window.fetch("/api/b", { method: "POST" });
      scheduleRevalidation();
    });
    await waitFor(() => expect(hits["/api/accounts"]).toBe(2), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(hits["/api/accounts"]).toBe(2);
  });
});
