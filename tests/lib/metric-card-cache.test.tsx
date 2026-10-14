/**
 * @vitest-environment jsdom
 */
import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { Wallet } from "lucide-react";

vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/hooks/use-animations", () => ({ useAnimations: () => false }));
vi.mock("@/components/ui/lazy-view", () => ({ LazyView: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { MetricCard } from "@/components/metric-card";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { createPersistentCache } from "@/lib/data/persistent-cache";
import { loadPersisted, savePersisted, wipeUser } from "@/lib/data/persist";
import { isSafeToPersist } from "@/lib/data/persist-policy";
import { withPrivateSwr } from "@/lib/http/private-swr";
import { fetchInitAfterWrite, noteWrite, resetWriteClock, FRESH_WINDOW_MS } from "@/lib/swr/http-freshness";
import { jsonFetcher } from "@/lib/swr/fetcher";

type Series = { series: Array<{ month: string; spent: number }> };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function Card({ range }: { range: string }) {
  const res = useCacheFirstJson<Series>(`/api/budgets/series?range=${range}`);
  const last = res.data?.series.at(-1);
  return (
    <MetricCard
      label="Spent"
      icon={Wallet}
      loading={res.loading}
      value={last ? last.spent : 0}
      currency="USD"
      sparkData={res.data?.series.map((p) => p.spent)}
    />
  );
}
const shimmer = () => document.querySelector(".animate-shimmer");

function wrap(cache: Map<string, unknown>, ui: React.ReactNode) {
  return (
    <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>
      {ui}
    </SWRConfig>
  );
}
const entry = (data: unknown) => ({ data });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  resetWriteClock();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MetricCard painted from the cache", () => {
  it("cold: shows the shimmer until data arrives", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(wrap(new Map(), <Card range="m" />));
    expect(shimmer()).not.toBeNull();
  });

  it("cache hit: first render has the value, no shimmer", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const cache = new Map<string, unknown>([["/api/budgets/series?range=m", entry({ series: [{ month: "2026-09", spent: 100 }, { month: "2026-10", spent: 250 }] })]]);
    const { container } = render(wrap(cache, <Card range="m" />));
    expect(shimmer()).toBeNull();
    expect(container.textContent).toContain("250");
  });

  it("revalidates in the background and updates in place", async () => {
    fetchMock.mockResolvedValue(ok({ series: [{ month: "2026-10", spent: 999 }] }));
    const cache = new Map<string, unknown>([["/api/budgets/series?range=m", entry({ series: [{ month: "2026-10", spent: 250 }] })]]);
    const { container } = render(wrap(cache, <Card range="m" />));
    expect(container.textContent).toContain("250");
    expect(shimmer()).toBeNull();
    await waitFor(() => expect(container.textContent).toContain("999"));
    expect(shimmer()).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("the key includes the range: another range is a cold miss", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const cache = new Map<string, unknown>([["/api/budgets/series?range=m", entry({ series: [{ month: "2026-10", spent: 250 }] })]]);
    const { rerender, container } = render(wrap(cache, <Card range="m" />));
    expect(shimmer()).toBeNull();
    rerender(wrap(cache, <Card range="y" />));
    expect(shimmer()).not.toBeNull();
    expect(container.textContent).not.toContain("250");
  });
});

describe("on-device persistence: per user, wiped on lock/logout", () => {
  const K1 = "/api/budgets/series?from=2026-01&to=2026-10&currency=USD";
  const K2 = "/api/budgets/series?from=2025-01&to=2025-12&currency=USD";

  it("metric series keys (range in the query) are persistable, auth is not", () => {
    for (const k of [K1, K2, "/api/goals/series?from=2026-01&to=2026-10", "/api/health-score?currency=USD&history=12", "/api/net-worth-history?period=all", "/api/portfolio/realized-gains?term=all", "/api/reports/trends?startDate=2026-01-01"]) {
      expect(isSafeToPersist(k)).toBe(true);
    }
    expect(isSafeToPersist("/api/auth/session")).toBe(false);
  });

  it("one range's entry never answers another range's key", async () => {
    await savePersisted("range-user", "b1", new Map([[K1, { series: [1] }]]));
    const loaded = await loadPersisted("range-user", "b1");
    expect(loaded.get(K1)).toBeDefined();
    expect(loaded.get(K2)).toBeUndefined();
    await wipeUser("range-user");
  });

  it("user B never sees user A's persisted cards", async () => {
    await savePersisted("user-a", "b1", new Map([[K1, { series: [{ month: "2026-10", spent: 1 }] }]]));
    const b = await loadPersisted("user-b", "b1");
    expect(b.size).toBe(0);
    const a = await loadPersisted("user-a", "b1");
    expect(a.size).toBe(1);
    await wipeUser("user-a");
  });

  it("wipeUser (lock / logout path) removes the persisted metric entries", async () => {
    await savePersisted("user-w", "b1", new Map([[K1, { series: [] }]]));
    expect((await loadPersisted("user-w", "b1")).size).toBe(1);
    await wipeUser("user-w");
    expect((await loadPersisted("user-w", "b1")).size).toBe(0);
  });

  it("a persistent cache pre-filled for the user paints a card instantly", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const cache = createPersistentCache({
      userId: "u1", build: "b1", enabled: () => true,
      initial: new Map([["/api/budgets/series?range=m", { series: [{ month: "2026-10", spent: 77 }] }]]),
    });
    const { container } = render(wrap(cache as unknown as Map<string, unknown>, <Card range="m" />));
    expect(shimmer()).toBeNull();
    expect(container.textContent).toContain("77");
  });
});

describe("HTTP caching of series endpoints", () => {
  it("private + short max-age + stale-while-revalidate + Vary: Cookie on 2xx", async () => {
    const { NextResponse } = await import("next/server");
    const res = withPrivateSwr(NextResponse.json({ series: [] }));
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=10, stale-while-revalidate=50");
    expect(res.headers.get("Vary")).toContain("Cookie");
  });

  it("errors are never cached", async () => {
    const { NextResponse } = await import("next/server");
    const res = withPrivateSwr(NextResponse.json({ error: "x" }, { status: 400 }));
    expect(res.headers.get("Cache-Control")).toBeNull();
  });

  it("a write makes the next fetches bypass the HTTP cache for a short window only", async () => {
    expect(fetchInitAfterWrite()).toBeUndefined();
    noteWrite(1_000);
    expect(fetchInitAfterWrite(1_000 + FRESH_WINDOW_MS - 1)).toEqual({ cache: "no-cache" });
    expect(fetchInitAfterWrite(1_000 + FRESH_WINDOW_MS)).toBeUndefined();
    fetchMock.mockResolvedValue(ok({}));
    noteWrite();
    await jsonFetcher("/api/goals/series?from=2026-01&to=2026-10");
    expect(fetchMock).toHaveBeenCalledWith("/api/goals/series?from=2026-01&to=2026-10", { cache: "no-cache" });
  });
});

describe("write invalidation", () => {
  it("scheduleRevalidation marks the write clock", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mutate = vi.fn();
    vi.doMock("swr", () => ({ mutate }));
    const wr = await import("@/lib/data/write-revalidation");
    const hf = await import("@/lib/swr/http-freshness");
    hf.resetWriteClock();
    wr.scheduleRevalidation(10);
    expect(hf.fetchInitAfterWrite()).toEqual({ cache: "no-cache" });
    vi.advanceTimersByTime(20);
    expect(mutate).toHaveBeenCalled();
    vi.useRealTimers();
    vi.doUnmock("swr");
  });
});
