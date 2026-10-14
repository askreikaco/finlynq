/**
 * @vitest-environment jsdom
 */
// Icon-only Refresh button (PageToolbar trailing slot): revalidates every mounted API key of the page, bypassing the
// browser HTTP cache, and spins ONLY while a request is in flight.
import "fake-indexeddb/auto";
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";

vi.mock("next/link", () => ({ default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children) }));
vi.mock("@/components/metric-range-select", () => ({ MetricRangeSelect: () => <div data-testid="range" /> }));

import { RefreshButton } from "@/components/refresh-button";
import { PageToolbar } from "@/components/page-toolbar";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useApi } from "@/lib/data/use-api";
import { resetFetchActivity, mountedApiKeys } from "@/lib/data/fetch-activity";
import { resetWriteClock } from "@/lib/swr/http-freshness";

type Deferred = { url: string; init?: RequestInit; resolve: (body: unknown) => void };
let calls: Deferred[];

beforeEach(() => {
  calls = [];
  resetFetchActivity();
  resetWriteClock();
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => new Promise((resolve) => {
      calls.push({ url: String(url), init, resolve: (body) => resolve({ ok: true, status: 200, json: async () => body } as Response) });
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe({ url }: { url: string }) {
  const r = useCacheFirstJson<{ n: number }>(url);
  return <span data-testid={`v-${url}`}>{r.data ? r.data.n : "loading"}</span>;
}
function App({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>{children}</SWRConfig>;
}
const button = () => screen.getByRole("button", { name: "Refresh" });
const spinning = () => button().querySelector("svg")!.getAttribute("class")!.includes("animate-spin");
const settle = async (c: Deferred, body: unknown) => { await act(async () => { c.resolve(body); }); };

describe("RefreshButton", () => {
  it("is icon only: aria-label Refresh, no visible text, idle = no spin", () => {
    render(<App><RefreshButton /></App>);
    expect(button().textContent).toBe("");
    expect(button().getAttribute("data-slot")).toBe("refresh-button");
    expect(button().querySelector("svg")).toBeTruthy();
    expect(spinning()).toBe(false);
    expect(button().getAttribute("data-fetching")).toBe("false");
  });

  it("click revalidates every mounted key (and only those), spins while fetching, stops when done", async () => {
    render(<App><Probe url="/api/a" /><Probe url="/api/b" /><RefreshButton /></App>);
    await waitFor(() => expect(calls).toHaveLength(2));
    await waitFor(() => expect(spinning()).toBe(true)); // the first load is fetching too
    await settle(calls[0], { n: 1 });
    expect(spinning()).toBe(true); // /api/b is still in flight
    await settle(calls[1], { n: 2 });
    await waitFor(() => expect(spinning()).toBe(false));
    expect(button().getAttribute("data-fetching")).toBe("false");
    expect(button().getAttribute("aria-busy")).toBe("false");

    fireEvent.click(button());
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(calls.slice(2).map((c) => c.url).sort()).toEqual(["/api/a", "/api/b"]);
    // the browser HTTP cache must not answer a manual refresh
    expect(calls.slice(2).every((c) => (c.init as RequestInit | undefined)?.cache === "no-cache")).toBe(true);
    await waitFor(() => expect(spinning()).toBe(true));
    expect(button().getAttribute("aria-busy")).toBe("true");
    await settle(calls[2], { n: 10 });
    await settle(calls[3], { n: 20 });
    await waitFor(() => expect(spinning()).toBe(false));
    expect(screen.getByTestId("v-/api/a").textContent).toBe("10");
    expect(screen.getByTestId("v-/api/b").textContent).toBe("20");
  });

  it("does not refetch keys that are no longer mounted (another page)", async () => {
    const { rerender } = render(<App><Probe url="/api/a" /><RefreshButton /></App>);
    await waitFor(() => expect(calls).toHaveLength(1));
    await settle(calls[0], { n: 1 });
    rerender(<App><RefreshButton /></App>);
    await waitFor(() => expect(mountedApiKeys()).toEqual([]));
    fireEvent.click(button());
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
  });

  it("works for plain useApi keys too", async () => {
    function Api() { const r = useApi<{ n: number }>("/api/c"); return <span data-testid="c">{r.data?.n ?? "loading"}</span>; }
    render(<App><Api /><RefreshButton /></App>);
    await waitFor(() => expect(calls).toHaveLength(1));
    await settle(calls[0], { n: 5 });
    fireEvent.click(button());
    await waitFor(() => expect(calls).toHaveLength(2));
    await settle(calls[1], { n: 6 });
    await waitFor(() => expect(screen.getByTestId("c").textContent).toBe("6"));
  });
});

describe("RefreshButton with the local read cache switched off (plain fetch readers)", () => {
  it("still refetches the page and spins while the plain fetch is in flight", async () => {
    window.localStorage.setItem("finlynq.lf.read", "0");
    render(<App><Probe url="/api/legacy" /><RefreshButton /></App>);
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(spinning()).toBe(true));
    await settle(calls[0], { n: 1 });
    await waitFor(() => expect(spinning()).toBe(false));
    expect(screen.getByTestId("v-/api/legacy").textContent).toBe("1");
    fireEvent.click(button());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(screen.getByTestId("v-/api/legacy").textContent).toBe("1"); // data stays while refreshing
    await waitFor(() => expect(spinning()).toBe(true));
    await settle(calls[1], { n: 2 });
    await waitFor(() => expect(screen.getByTestId("v-/api/legacy").textContent).toBe("2"));
    await waitFor(() => expect(spinning()).toBe(false));
  });
});

describe("PageToolbar trailing slot", () => {
  const range = { selection: { range: "this_month" as const }, onChange: () => {} };
  it("refresh renders the Refresh button after Filter, in the trailing slot; absent by default", () => {
    const { rerender } = render(<App><PageToolbar range={range} filter={{ href: "/filter/x" }} /></App>);
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    rerender(<App><PageToolbar range={range} filter={{ href: "/filter/x" }} refresh /></App>);
    const trailing = document.querySelector('[data-slot="toolbar-trailing"]')!;
    expect(trailing.querySelector('[aria-label="Refresh"]')).toBeTruthy();
    const filter = document.querySelector('[data-slot="filter-button"]')!;
    expect(filter.compareDocumentPosition(trailing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a refresh-only toolbar still renders (right aligned), and a custom trailing node sits after Refresh", () => {
    render(<App><PageToolbar refresh trailing={<i data-testid="extra" />} /></App>);
    const trailing = document.querySelector('[data-slot="toolbar-trailing"]')!;
    expect(trailing.className).toContain("ml-auto");
    expect(Array.from(trailing.children).map((c) => c.getAttribute("data-testid") ?? c.getAttribute("aria-label"))).toEqual(["Refresh", "extra"]);
  });

  it("the existing slots keep their order and markup (range, search, filter) with refresh added", () => {
    render(<App><PageToolbar range={range} search={{ value: "", onChange: () => {} }} filter={{ href: "/f" }} refresh /></App>);
    const slots = Array.from(document.querySelector('[data-slot="page-toolbar"]')!.children).map((c) => c.getAttribute("data-slot") ?? c.firstElementChild?.getAttribute("data-slot"));
    expect(slots).toEqual(["range-month", "search-toggle", "filter-button", "toolbar-trailing"]);
  });
});

describe("wiring: every page with cached cards / charts mounts the Refresh button", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const PAGES = [
    "dashboard/page.tsx", "accounts/page.tsx", "accounts/[id]/page.tsx", "categories/_page-content.tsx", "categories/[id]/page.tsx",
    "goals/page.tsx", "loans/page.tsx", "subscriptions/page.tsx", "reports/page.tsx", "portfolio/page.tsx",
    "portfolio/dividends/page.tsx", "portfolio/realized-gains/page.tsx",
  ];
  it.each(PAGES)("%s", (rel) => {
    const src = fs.readFileSync(path.join(ROOT, "src/app/(app)", rel), "utf-8");
    expect(src).toMatch(/<PageToolbar\s+refresh\b/);
  });
});
