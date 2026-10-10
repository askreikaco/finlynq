/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { DEFAULT_CARD_ORDER } from "@/lib/dashboard-layout";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => "/dashboard" }));
const dev = vi.hoisted(() => ({ on: true }));
vi.mock("@/hooks/use-dev-mode", () => ({ useDevMode: () => dev.on }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND", isLoading: false }) }));
vi.mock("@/components/currency-audit-banner", () => ({ CurrencyAuditBanner: () => null }));
vi.mock("@/components/onboarding-wizard", () => ({ OnboardingWizard: () => null }));
vi.mock("@/components/sparkline", () => ({ Sparkline: () => null }));

const marker = vi.hoisted(() => (id: string) => function MockCard() { return <div data-testid={`card-${id}`} />; });
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: marker("onboarding-tips") }));
vi.mock("@/components/subscriptions/due-card", () => ({ DueCard: marker("due-subscriptions") }));
vi.mock("@/app/(app)/dashboard/_components/health-score-card", () => ({ HealthScoreCard: marker("health-score") }));
vi.mock("@/app/(app)/dashboard/_components/key-metrics", () => ({ KeyMetrics: marker("key-metrics") }));
vi.mock("@/components/net-worth-history-chart", () => ({ NetWorthHistoryChart: marker("net-worth-history") }));
vi.mock("@/app/(app)/dashboard/_components/action-center", () => ({ ActionCenter: marker("action-center") }));
vi.mock("@/app/(app)/dashboard/_components/weekly-recap", () => ({ WeeklyRecap: marker("weekly-recap") }));
vi.mock("@/app/(app)/dashboard/_components/quick-import", () => ({ QuickImport: marker("quick-import") }));
vi.mock("@/app/(app)/dashboard/_components/income-expense-chart", () => ({ IncomeExpenseChart: marker("income-expense-chart") }));
vi.mock("@/app/(app)/dashboard/_components/spending-category-chart", () => ({ SpendingCategoryChart: marker("spending-category-chart") }));
vi.mock("@/app/(app)/dashboard/_components/available-to-spend", () => ({ AvailableToSpend: marker("available-to-spend") }));
vi.mock("@/app/(app)/dashboard/_components/insights-section", () => ({ InsightsSection: marker("insights") }));
vi.mock("@/app/(app)/dashboard/_components/animated-number", () => ({
  AnimatedNumber: ({ value }: { value: number }) => <span>{value}</span>,
}));
vi.mock("@/app/(app)/dashboard/_components/stat-card", () => ({
  StatCard: ({ label }: { label: string }) => <div data-testid={`stat-${label}`}>{label}</div>,
}));

import DashboardPage from "@/app/(app)/dashboard/page";

let fetchCallCount: number;

beforeEach(() => {
  dev.on = true;
  fetchCallCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/settings/dashboard-layout")) {
        return { ok: true, json: async () => ({ order: [...DEFAULT_CARD_ORDER], hidden: [] }) };
      }
      if (u.includes("/api/dashboard")) {
        fetchCallCount++;
        // First call fails with non-OK response
        if (fetchCallCount === 1) {
          // Return {ok: false} with a json() method that returns null
          // This ensures swallowing the !r.ok check won't trigger error state
          return { ok: false, json: async () => null };
        }
        // Second call succeeds
        return { ok: true, json: async () => ({ balances: [], incomeVsExpenses: [], netWorthOverTime: [], spendingByCategory: [], displayCurrency: "VND" }) };
      }
      if (u.includes("/api/health-score")) return { ok: true, json: async () => ({}) };
      if (u.includes("/api/auth/session")) return { ok: true, json: async () => ({ authenticated: true, onboardingComplete: true }) };
      return { ok: true, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dashboard error state", () => {
  it("displays error state when /api/dashboard returns error", async () => {
    render(<DashboardPage />);
    const errorMsg = await screen.findByText("Something went wrong");
    expect(errorMsg).toBeTruthy();
  });

  it("retry button appears in error state", async () => {
    render(<DashboardPage />);
    await screen.findByText("Something went wrong");
    const retryButton = screen.getByText("Try again");
    expect(retryButton).toBeTruthy();
  });

  it("clicking retry fetches dashboard again and loads content on success", async () => {
    render(<DashboardPage />);
    await screen.findByText("Something went wrong");

    const retryButton = screen.getByText("Try again");
    fireEvent.click(retryButton);

    // After retry, should load the dashboard data and render the Net Worth card
    await waitFor(() => {
      expect(screen.queryByText("Something went wrong")).toBeNull();
    });
    await screen.findByText("Total Net Worth");
    expect(fetchCallCount).toBe(2);
  });
});
