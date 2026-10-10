/**
 * @vitest-environment jsdom
 */
// One tree at every size (G2-12): each dashboard block mounts exactly once, the three target
// files carry no viewport tokens, and the secondary cards sit inside the single More insights
// disclosure. Static token checks read the source; the rest mounts the page with marker cards.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
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

beforeEach(() => {
  dev.on = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/settings/dashboard-layout")) {
        if (init?.method === "PUT") return { ok: true, json: async () => JSON.parse(String(init.body)) };
        return { ok: true, json: async () => ({ order: [...DEFAULT_CARD_ORDER], hidden: [] }) };
      }
      if (u.includes("/api/dashboard")) return { ok: true, json: async () => ({ balances: [], incomeVsExpenses: [], netWorthOverTime: [], spendingByCategory: [], displayCurrency: "VND" }) };
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

const TARGET_FILES = [
  "src/app/(app)/dashboard/page.tsx",
  "src/components/onboarding-tips.tsx",
  "src/components/metric-card.tsx",
];
// Viewport tokens: md:/lg:/max-md:/max-lg:/sm:/xl:/2xl:. Container prefixes (@sm:) are not matched by this.
const VIEWPORT_TOKEN = /(?<![\w-])(max-)?(sm|md|lg|xl|2xl):/;

describe("dashboard one tree: source", () => {
  it.each(TARGET_FILES)("%s has no viewport breakpoint tokens or viewport-split classes", (file) => {
    const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(src.match(new RegExp(VIEWPORT_TOKEN.source, "g")) ?? []).toEqual([]);
    expect(src).not.toMatch(/md:hidden|hidden\s+md:|hidden\s+max-md:|max-md:hidden/);
  });
});

describe("dashboard one tree: mount", () => {
  const dashboard = async () => {
    render(<DashboardPage />);
    await screen.findByText("Total Net Worth");
  };

  it("every block is mounted exactly once", async () => {
    await dashboard();
    // net-worth and summary-stats have no marker mock: checked by their own text below
    for (const id of DEFAULT_CARD_ORDER.filter((id) => id !== "net-worth" && id !== "summary-stats")) {
      expect(screen.getAllByTestId(`card-${id}`), id).toHaveLength(1);
    }
    expect(screen.getAllByText("Total Net Worth")).toHaveLength(1);
    expect(screen.getAllByTestId("stat-Monthly Income")).toHaveLength(1);
  });

  it("the secondary cards sit inside the one More insights disclosure, and no other card does", async () => {
    await dashboard();
    const extras = ["weekly-recap", "quick-import", "income-expense-chart", "spending-category-chart", "available-to-spend", "insights"];
    const toggles = screen.getAllByRole("button", { name: /More insights|Fewer insights/ });
    expect(toggles).toHaveLength(1);
    const region = document.getElementById(toggles[0].getAttribute("aria-controls")!)!;
    expect(region.getAttribute("role")).toBe("region");
    for (const id of extras) expect(region.contains(screen.getByTestId(`card-${id}`)), id).toBe(true);
    for (const id of ["action-center", "net-worth-history", "key-metrics", "health-score", "onboarding-tips"]) {
      expect(region.contains(screen.getByTestId(`card-${id}`)), id).toBe(false);
    }
  });

  it("dev mode off: no secondary chart cards, the disclosure still holds the weekly recap and quick import", async () => {
    dev.on = false;
    await dashboard();
    expect(screen.queryByTestId("card-income-expense-chart")).toBeNull();
    const toggle = screen.getByRole("button", { name: "More insights" });
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region.contains(screen.getByTestId("card-weekly-recap"))).toBe(true);
    expect(region.contains(screen.getByTestId("card-quick-import"))).toBe(true);
  });

  it("the disclosure is collapsed by default (compact) and the core cards stay visible", async () => {
    await dashboard();
    const toggle = screen.getByRole("button", { name: "More insights" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region.hidden).toBe(true);
    expect(screen.getByTestId("card-action-center")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("card-key-metrics")).toBeTruthy());
  });
});
