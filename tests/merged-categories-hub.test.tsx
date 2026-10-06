/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

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
      { id: 2, name: "Transport", group: "Expenses", amount: 400, average: 400, budget: null, share: 0.267, trend: [400, 400, 400], change: 0, type: "E" },
      { id: 3, name: "Rent", group: "Housing", amount: 600, average: 600, budget: null, share: 0.4, trend: [600, 600, 600], change: 0, type: "E" },
    ],
  },
};

const CATEGORIES_DATA = [
  { id: 1, type: "E", group: "Expenses", name: "Food", note: "" },
  { id: 2, type: "E", group: "Expenses", name: "Transport", note: "" },
  { id: 3, type: "E", group: "Housing", name: "Rent", note: "" },
  { id: 4, type: "I", group: "Income", name: "Salary", note: "" },
  { id: 5, type: "R", group: "Reconciliation", name: "Balance Adjustment", note: "" },
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

import CategoriesPageContent from "@/app/(app)/categories/_page-content";

describe("merged categories (WP8)", () => {
  describe("flag OFF (merged=false)", () => {
    it("shows original title without tabs", async () => {
      render(<CategoriesPageContent isMerged={false} />);
      await waitFor(
        () => {
          expect(screen.getByText("Spending by category")).toBeTruthy();
          expect(screen.queryByRole("tab", { name: "Overview" })).toBeFalsy();
          expect(screen.queryByRole("tab", { name: "Manage" })).toBeFalsy();
        },
        { timeout: 5000 }
      );
    });

    it("loads overview data immediately", async () => {
      render(<CategoriesPageContent isMerged={false} />);
      await waitFor(
        () => {
          expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/reports/categories"));
        },
        { timeout: 5000 }
      );
    });

    it("shows category list", async () => {
      render(<CategoriesPageContent isMerged={false} />);
      await waitFor(
        () => {
          expect(screen.getByText("Food")).toBeTruthy();
          expect(screen.getByText("Transport")).toBeTruthy();
        },
        { timeout: 5000 }
      );
    });
  });

  describe("flag ON (merged=true)", () => {
    it("shows tabs", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Manage" })).toBeTruthy();
      });
    });

    it("overview tab shows original content", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      await waitFor(
        () => {
          expect(screen.getByText("Spending by category")).toBeTruthy();
        },
        { timeout: 5000 }
      );
    });

    it("manage tab loads categories", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      const manageTab = await screen.findByRole("tab", { name: "Manage" });
      fireEvent.click(manageTab);
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/categories");
      });
    });

    it("manage tab has add button", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      const manageTab = await screen.findByRole("tab", { name: "Manage" });
      fireEvent.click(manageTab);
      await waitFor(() => {
        const addButton = screen.getByRole("button", { name: /Add$/i });
        expect(addButton).toBeTruthy();
      });
    });
  });

  describe("category management", () => {
    it("groups categories by type", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      const manageTab = await screen.findByRole("tab", { name: "Manage" });
      fireEvent.click(manageTab);
      await waitFor(() => {
        expect(screen.getByTestId("type-section-E")).toBeTruthy();
        expect(screen.getByTestId("type-section-I")).toBeTruthy();
        expect(screen.getByTestId("type-section-R")).toBeTruthy();
      });
    });

    it("type R category appears in reconciliation section", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      const manageTab = await screen.findByRole("tab", { name: "Manage" });
      fireEvent.click(manageTab);
      await waitFor(() => {
        expect(screen.getByText("Balance Adjustment")).toBeTruthy();
      });
    });

    it("shows link to rules", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      const manageTab = await screen.findByRole("tab", { name: "Manage" });
      fireEvent.click(manageTab);
      await waitFor(() => {
        const rulesLink = screen.getByRole("link", { name: /Rules/i }) as HTMLAnchorElement;
        expect(rulesLink.href).toContain("/settings/rules");
      });
    });
  });

  describe("income/expense toggle", () => {
    it("shows spending and income tabs in overview", async () => {
      render(<CategoriesPageContent isMerged={false} />);
      await waitFor(
        () => {
          expect(screen.getByRole("tab", { name: "Spending" })).toBeTruthy();
          expect(screen.getByRole("tab", { name: "Income" })).toBeTruthy();
        },
        { timeout: 5000 }
      );
    });
  });
});
