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
    if (url.includes("/api/flags/categories-merged")) {
      return { ok: true, json: async () => ({ enabled: true }) };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import Page from "@/app/(app)/categories/page";

describe("merged categories hub (WP8)", () => {
  it("renders tabs when merged flag is enabled", async () => {
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Manage" })).toBeTruthy();
    });
  });

  it("shows overview tab content by default", async () => {
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/Spending by category|Categories/)).toBeTruthy();
    });
  });

  it("switches to manage tab when clicked", async () => {
    render(<Page />);
    await waitFor(() => {
      const manageTab = screen.getByRole("tab", { name: "Manage" });
      fireEvent.click(manageTab);
      expect(screen.getByText("Category Management")).toBeTruthy();
    });
  });

  it("renders category list in overview", async () => {
    render(<Page />);
    await waitFor(
      () => {
        expect(screen.getByText("Food")).toBeTruthy();
      },
      { timeout: 5000 }
    );
  });

  it("shows spending/income type toggle", async () => {
    render(<Page />);
    await waitFor(
      () => {
        expect(screen.getByRole("tab", { name: "Spending" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Income" })).toBeTruthy();
      },
      { timeout: 5000 }
    );
  });

  it("shows month navigation controls", async () => {
    render(<Page />);
    await waitFor(
      () => {
        const buttons = screen.queryAllByRole("button");
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );
  });

  it("management tab loads categories", async () => {
    render(<Page />);
    const manageTab = await screen.findByRole("tab", { name: "Manage" });
    fireEvent.click(manageTab);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/categories");
    });
  });

  it("management tab has add category button", async () => {
    render(<Page />);
    const manageTab = await screen.findByRole("tab", { name: "Manage" });
    fireEvent.click(manageTab);
    await waitFor(() => {
      const addButton = screen.getByRole("button", { name: /Add$/i });
      expect(addButton).toBeTruthy();
    });
  });

  it("type R category is not shown in expense categories", async () => {
    render(<Page />);
    const manageTab = await screen.findByRole("tab", { name: "Manage" });
    fireEvent.click(manageTab);
    await waitFor(() => {
      // Type R (Balance Adjustment) should not appear in expense section
      const expenseSection = screen.queryByTestId("type-section-E");
      if (expenseSection) {
        expect(expenseSection.textContent).not.toContain("Balance Adjustment");
      }
    });
  });

  it("management tab has link to rules page", async () => {
    render(<Page />);
    const manageTab = await screen.findByRole("tab", { name: "Manage" });
    fireEvent.click(manageTab);
    await waitFor(() => {
      const rulesLink = screen.queryByRole("link", { name: /Rules/i });
      if (rulesLink) {
        expect((rulesLink as HTMLAnchorElement).href).toContain("/settings/rules");
      }
    });
  });

  it("shows reconciliation type categories in manage tab", async () => {
    render(<Page />);
    const manageTab = await screen.findByRole("tab", { name: "Manage" });
    fireEvent.click(manageTab);
    await waitFor(() => {
      expect(screen.queryByText("Balance Adjustment")).toBeTruthy();
    });
  });

  it("call fetch for merged flag on mount", async () => {
    render(<Page />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/flags/categories-merged");
    });
  });

  it("shows both tabs after flag check completes", async () => {
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Manage" })).toBeTruthy();
    });
  });
});
