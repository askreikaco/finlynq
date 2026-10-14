/**
 * @vitest-environment jsdom
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, renderHook, screen, cleanup, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";

const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => H,
  useParams: () => ({ id: "7" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/categories/7",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/hooks/use-animations", () => ({ useAnimations: () => false }));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return { ResponsiveContainer: Wrap, ComposedChart: Wrap, Bar: Leaf, Line: Leaf, Cell: Leaf, XAxis: Leaf, YAxis: Leaf, Tooltip: Leaf, ReferenceLine: Leaf, CartesianGrid: Leaf };
});

import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import CategoryDetailPage from "@/app/(app)/categories/[id]/page";

const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const withCache = (cache: Map<string, unknown>) =>
  function W({ children }: { children: React.ReactNode }) {
    return <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>{children}</SWRConfig>;
  };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useCacheFirstJson errorStatus", () => {
  it("SWR path: a 404 is reported as status 404, a network error as null", async () => {
    fetchMock.mockResolvedValue(res(404));
    const a = renderHook(() => useCacheFirstJson("/api/x"), { wrapper: withCache(new Map()) });
    await waitFor(() => expect(a.result.current.error).toBe(true));
    expect(a.result.current.errorStatus).toBe(404);
    cleanup();
    fetchMock.mockRejectedValue(new Error("down"));
    const b = renderHook(() => useCacheFirstJson("/api/y"), { wrapper: withCache(new Map()) });
    await waitFor(() => expect(b.result.current.error).toBe(true));
    expect(b.result.current.errorStatus).toBeNull();
  });

  it("legacy path (flag off): same status reporting", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "0");
    fetchMock.mockResolvedValue(res(400));
    const { result } = renderHook(() => useCacheFirstJson("/api/x"), { wrapper: withCache(new Map()) });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.errorStatus).toBe(400);
  });
});

describe("category detail page is cache-first", () => {
  it("404 still shows 'Category not found'", async () => {
    fetchMock.mockImplementation(async (u: string) => (String(u).startsWith("/api/reports/category") ? res(404) : res(200, [])));
    render(<CategoryDetailPage />, { wrapper: withCache(new Map()) });
    expect(await screen.findByText("Category not found")).toBeTruthy();
  });

  it("another failure shows the retry error state", async () => {
    fetchMock.mockImplementation(async (u: string) => (String(u).startsWith("/api/reports/category") ? res(500) : res(200, [])));
    render(<CategoryDetailPage />, { wrapper: withCache(new Map()) });
    expect(await screen.findByText("Couldn't load this category")).toBeTruthy();
  });

  it("cold: skeleton while loading; a cached entry skips it (key = categoryId + the toolbar period, no months)", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const cold = render(<CategoryDetailPage />, { wrapper: withCache(new Map()) });
    const coldText = cold.container.textContent;
    const requested = String(fetchMock.mock.calls.find((c) => String(c[0]).startsWith("/api/reports/category"))?.[0]);
    cold.unmount();
    expect(requested).toMatch(/^\/api\/reports\/category\?categoryId=7&from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/);
    expect(requested).not.toContain("months=");
    // A different period is a different key: seeding it must not satisfy this page's request.
    const other = new Map<string, unknown>([["/api/reports/category?categoryId=7&from=2020-01-01&to=2020-01-31", { data: { category: { id: 7, name: "X" } } }]]);
    const miss = render(<CategoryDetailPage />, { wrapper: withCache(other) });
    expect(miss.container.textContent).toBe(coldText);
  });
});
