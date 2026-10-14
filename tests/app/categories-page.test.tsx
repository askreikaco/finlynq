/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/categories",
}));

const OVERVIEW_DATA = {
  data: {
    total: 1500,
    averageTotal: 1200,
    partial: false,
    displayCurrency: "USD",
    type: "E",
    windowMonths: ["2026-01", "2026-02", "2026-03"],
    categories: [
      { id: 1, name: "Food", group: "Expenses", amount: 500, average: 450, budget: null, share: 0.333, trend: [400, 450, 500], change: 0.111, type: "E" },
    ],
  },
};

const CATEGORIES_DATA = [
  { id: 1, type: "E", group: "Expenses", name: "Food", note: "" },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/reports/categories")) {
      return { ok: true, json: async () => OVERVIEW_DATA };
    }
    if (url.includes("/api/categories")) {
      if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => CATEGORIES_DATA };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CategoriesPage (real component)", () => {
  // The Manage tab is gone (everything lives on this page); the merged flag no longer changes the page.
  it.each([undefined, "1"])("one page, no tabs, overview fetched once (FINLYNQ_CATEGORIES_MERGED=%s)", async (flag) => {
    if (flag === undefined) delete process.env.FINLYNQ_CATEGORIES_MERGED;
    else process.env.FINLYNQ_CATEGORIES_MERGED = flag;
    try {
      const CategoriesPage = (await import("@/app/(app)/categories/page")).default;
      render(<CategoriesPage />);
      await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Categories" })).toBeTruthy(), { timeout: 15000 });
      expect(screen.queryByRole("tab", { name: "Overview" })).toBeNull();
      expect(screen.queryByRole("tab", { name: "Manage" })).toBeNull();
      expect(screen.getByRole("link", { name: "Add" }).getAttribute("href")).toBe("/categories?edit=new");
      expect(fetchMock.mock.calls.filter((c) => c[0]?.includes("/api/reports/categories")).length).toBe(1);
    } finally {
      delete process.env.FINLYNQ_CATEGORIES_MERGED;
    }
  }, 30000);
});

describe("isCategoriesMergedEnabled default env", () => {
  it("uses process.env by default", async () => {
    const { isCategoriesMergedEnabled } = await import("@/lib/categories/flag");

    process.env.FINLYNQ_CATEGORIES_MERGED = "1";
    expect(isCategoriesMergedEnabled()).toBe(true);

    process.env.FINLYNQ_CATEGORIES_MERGED = "0";
    expect(isCategoriesMergedEnabled()).toBe(false);

    delete process.env.FINLYNQ_CATEGORIES_MERGED;
    expect(isCategoriesMergedEnabled()).toBe(false);
  });
});
