/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let mockSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(mockSearch),
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
import { CategoryManagement } from "@/app/(app)/categories/_components/category-management";

describe("merged categories (WP8)", () => {
  describe("flag OFF (merged=false)", () => {
    it("shows original title 'Spending by category' without tabs", async () => {
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

    it("loads overview data immediately (exactly once)", async () => {
      render(<CategoriesPageContent isMerged={false} />);
      await waitFor(
        () => {
          expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/reports/categories"));
        },
        { timeout: 5000 }
      );

      const overviewCalls = fetchMock.mock.calls.filter((c) => c[0]?.includes("/api/reports/categories"));
      expect(overviewCalls.length).toBe(1);
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
    it("opens the Manage tab when ?tab=manage is in the URL (return target of the create/rename pages)", async () => {
      mockSearch = "tab=manage";
      try {
        render(<CategoriesPageContent isMerged={true} />);
        await waitFor(() => {
          expect(screen.getByRole("tab", { name: "Manage" }).getAttribute("aria-selected")).toBe("true");
        });
      } finally {
        mockSearch = "";
      }
    });

    it("shows tabs", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Manage" })).toBeTruthy();
      });
    });

    it("merged h1 shows exact text 'Categories'", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      await waitFor(() => {
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1.textContent).toBe("Categories");
      });
    });

    it("overview tab shows original content", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      await waitFor(
        () => {
          // Embedded in the hub the overview has no own title; its Spending/Income switch is the original content.
          expect(screen.getByRole("tab", { name: "Spending" })).toBeTruthy();
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

    it("manage tab has an Add link to /categories/new that returns to the Manage tab", async () => {
      render(<CategoriesPageContent isMerged={true} />);
      const manageTab = await screen.findByRole("tab", { name: "Manage" });
      fireEvent.click(manageTab);
      await waitFor(() => {
        const addLink = screen.getByRole("link", { name: /Add$/i });
        expect(addLink.getAttribute("href")).toBe("/categories/new?returnTo=%2Fcategories%3Ftab%3Dmanage");
      });
    });
  });

  describe("CategoryManagement CRUD", () => {
    it("delete: sends DELETE with correct id in URL, reloads", async () => {
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const deleteButtons = screen.getAllByLabelText("Delete category");
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        const deleteCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "DELETE");
        expect(deleteCalls.length).toBeGreaterThan(0);

        const lastDeleteCall = deleteCalls[deleteCalls.length - 1];
        // Must have id in URL
        expect(lastDeleteCall[0]).toContain("id=1");
      });

      // Should reload
      await waitFor(() => {
        const categoryCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/categories" && !c[1]?.method);
        expect(categoryCalls.length).toBeGreaterThan(1);
      });
    });

    it("delete error: DELETE non-ok shows data.error message", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "DELETE") {
            return { ok: false, json: async () => ({ error: "Cannot delete" }) };
          }
          return { ok: true, json: async () => CATEGORIES_DATA };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const deleteButtons = screen.getAllByLabelText("Delete category");
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Cannot delete")).toBeTruthy();
      });
    });

    it("load error: GET ok:false shows 'No categories found'", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories") && !init?.method) {
          return { ok: false, json: async () => ({}) };
        }
        return { ok: true, json: async () => CATEGORIES_DATA };
      });

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
      }, { timeout: 5000 });
    });

    it("empty categories shows 'No categories found'", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories") && !init?.method) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => CATEGORIES_DATA };
      });

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
      });
    });

    it("groups categories by type E/I/R", async () => {
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByTestId("type-section-E")).toBeTruthy();
        expect(screen.getByTestId("type-section-I")).toBeTruthy();
        expect(screen.getByTestId("type-section-R")).toBeTruthy();
      });
    });

    it("type R category appears in reconciliation section", async () => {
      render(<CategoryManagement returnTo="/categories?tab=manage" />);
      await waitFor(() => {
        expect(screen.getByText("Balance Adjustment")).toBeTruthy();
      });
    });

    it("shows link to /settings/rules", async () => {
      render(<CategoryManagement returnTo="/categories?tab=manage" />);
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
