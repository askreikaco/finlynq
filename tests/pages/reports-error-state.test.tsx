/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/hooks/use-dev-mode", () => ({ useDevMode: () => false }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND", isLoading: false }) }));
vi.mock("@/app/(app)/reports/_components/account-filter", () => ({ AccountFilter: () => null }));
vi.mock("@/components/sankey-chart", () => ({ SankeyChart: () => null }));
vi.mock("@/components/reports/income-expense-trend-card", () => ({ IncomeExpenseTrendCard: () => null }));

import ReportsPage from "@/app/(app)/reports/page";

const TRENDS_OK = {
  period: "monthly",
  groupBy: "category",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  timeseries: [],
  income: [],
  expenses: [],
  totalIncome: 0,
  totalExpenses: 0,
  netSavings: 0,
  savingsRate: 0,
};

let trendsCalls: number;

beforeEach(() => {
  trendsCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/reports/trends")) {
        trendsCalls++;
        if (trendsCalls === 1) return { ok: false, status: 500, json: async () => null };
        return { ok: true, status: 200, json: async () => TRENDS_OK };
      }
      // Secondary fetches fail softly: the page must not show the primary error state for them.
      return { ok: false, status: 404, json: async () => null };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Reports page error state", () => {
  it("shows the ErrorState alert when the primary trends fetch fails", async () => {
    render(<ReportsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load reports");
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("retry refetches trends and clears the alert on success", async () => {
    render(<ReportsPage />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(trendsCalls).toBe(2);
  });
});
