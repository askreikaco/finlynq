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

vi.mock("@/components/sparkline", () => ({
  Sparkline: () => <div data-testid="sparkline" />,
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
      {
        id: 1,
        name: "Food",
        group: "Expenses",
        amount: 500,
        average: 450,
        budget: null,
        share: 0.333,
        trend: [400, 450, 500],
        change: 0.111,
        type: "E",
      },
    ],
  },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/api/reports/categories")) {
      return { ok: true, json: async () => OVERVIEW_DATA };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CategoriesPageContent with hub heading", () => {
  describe("merged mode (embedded=true)", () => {
    it("shows exactly one h1 'Categories' when merged", async () => {
      const CategoriesPageContent = (await import(
        "@/app/(app)/categories/_page-content"
      )).default;
      render(<CategoriesPageContent isMerged={true} />);

      await waitFor(() => {
        expect(screen.getByText("Categories")).toBeTruthy();
      }, { timeout: 5000 });

      // Check there is exactly one h1
      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0].textContent).toBe("Categories");

      // Ensure "Spending by category" text is not present
      expect(screen.queryByText("Spending by category")).toBeFalsy();
    });

    it("shows controls row (Spending/Income tabs and month stepper) when merged", async () => {
      const CategoriesPageContent = (await import(
        "@/app/(app)/categories/_page-content"
      )).default;
      render(<CategoriesPageContent isMerged={true} />);

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Spending" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Income" })).toBeTruthy();
      }, { timeout: 5000 });

      // Month stepper should be present
      expect(screen.getByLabelText("Previous month")).toBeTruthy();
      expect(screen.getByLabelText("Next month")).toBeTruthy();
    });

    it("shows Overview and Manage tabs when merged", async () => {
      const CategoriesPageContent = (await import(
        "@/app/(app)/categories/_page-content"
      )).default;
      render(<CategoriesPageContent isMerged={true} />);

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Manage" })).toBeTruthy();
      }, { timeout: 5000 });
    });
  });

  describe("non-merged mode (embedded=false)", () => {
    it("shows exactly one h1 'Spending by category' when not merged", async () => {
      const CategoriesPageContent = (await import(
        "@/app/(app)/categories/_page-content"
      )).default;
      render(<CategoriesPageContent isMerged={false} />);

      await waitFor(() => {
        expect(screen.getByText("Spending by category")).toBeTruthy();
      }, { timeout: 5000 });

      // Check there is exactly one h1
      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0].textContent).toBe("Spending by category");

      // Ensure "Categories" heading alone is not present
      // (it's in the subtitle "View spending patterns..." text, but not as h1)
      const categoryHeadings = screen.queryAllByRole("heading", { level: 1 }).filter(
        (h) => h.textContent === "Categories"
      );
      expect(categoryHeadings).toHaveLength(0);
    });

    it("shows controls row when not merged", async () => {
      const CategoriesPageContent = (await import(
        "@/app/(app)/categories/_page-content"
      )).default;
      render(<CategoriesPageContent isMerged={false} />);

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Spending" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Income" })).toBeTruthy();
      }, { timeout: 5000 });

      // Month stepper should be present
      expect(screen.getByLabelText("Previous month")).toBeTruthy();
      expect(screen.getByLabelText("Next month")).toBeTruthy();
    });

    it("does not show hub tabs when not merged", async () => {
      const CategoriesPageContent = (await import(
        "@/app/(app)/categories/_page-content"
      )).default;
      render(<CategoriesPageContent isMerged={false} />);

      await waitFor(() => {
        expect(screen.queryByRole("tab", { name: "Overview" })).toBeFalsy();
        expect(screen.queryByRole("tab", { name: "Manage" })).toBeFalsy();
      }, { timeout: 5000 });
    });
  });
});
