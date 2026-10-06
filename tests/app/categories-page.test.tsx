/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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
  vi.unstubAllGlobals();
});

describe("CategoriesPage (real component)", () => {
  describe("flag OFF (unset)", () => {
    it("fetches overview data exactly once, no flag fetch", async () => {
      const originalEnv = process.env.FINLYNQ_CATEGORIES_MERGED;
      delete process.env.FINLYNQ_CATEGORIES_MERGED;

      try {
        const CategoriesPage = (await import("@/app/(app)/categories/page")).default;
        render(<CategoriesPage />);

        await waitFor(() => {
          expect(screen.getByText("Spending by category")).toBeTruthy();
        }, { timeout: 5000 });

        // Should fetch overview exactly once, no flag fetch
        const overviewCalls = fetchMock.mock.calls.filter((c) => c[0]?.includes("/api/reports/categories"));
        const flagCalls = fetchMock.mock.calls.filter((c) => c[0]?.includes("/api/flags"));

        expect(overviewCalls.length).toBe(1);
        expect(flagCalls.length).toBe(0);
      } finally {
        if (originalEnv !== undefined) {
          process.env.FINLYNQ_CATEGORIES_MERGED = originalEnv;
        }
      }
    });

    it("no tabs rendered when flag unset", async () => {
      delete process.env.FINLYNQ_CATEGORIES_MERGED;

      const CategoriesPage = (await import("@/app/(app)/categories/page")).default;
      render(<CategoriesPage />);

      await waitFor(() => {
        expect(screen.queryByRole("tab", { name: "Overview" })).toBeFalsy();
        expect(screen.queryByRole("tab", { name: "Manage" })).toBeFalsy();
      });
    });
  });

  describe("flag ON (set to 1)", () => {
    it("renders tabs when flag enabled", async () => {
      process.env.FINLYNQ_CATEGORIES_MERGED = "1";

      try {
        const CategoriesPage = (await import("@/app/(app)/categories/page")).default;
        render(<CategoriesPage />);

        await waitFor(() => {
          expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
          expect(screen.getByRole("tab", { name: "Manage" })).toBeTruthy();
        }, { timeout: 5000 });
      } finally {
        delete process.env.FINLYNQ_CATEGORIES_MERGED;
      }
    });
  });
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
