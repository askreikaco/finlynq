/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { HEADER_SECONDARY } from "@/components/mobile";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { DASHBOARD_CARDS, DEFAULT_CARD_ORDER } from "@/lib/dashboard-layout";

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

// Each card becomes a marker so DOM order == render order.
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

type Saved = { order: string[]; hidden: string[] } | null;
let saved: Saved;
let puts: { order: string[]; hidden: string[] }[];

beforeEach(() => {
  dev.on = true;
  saved = null;
  puts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/settings/dashboard-layout")) {
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body));
          puts.push(body);
          return { ok: true, json: async () => body };
        }
        return { ok: true, json: async () => saved ?? { order: [...DEFAULT_CARD_ORDER], hidden: [] } };
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

// Render order of the cards, as the ids the page used (document order). The hero and the
// stat-tile grid have no marker mock, so they are recognised by their text.
function renderedIds(): string[] {
  const out: string[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const t = el.getAttribute("data-testid");
    if (t?.startsWith("card-")) out.push(t.slice(5));
    else if (t === "stat-Monthly Income") out.push("summary-stats");
    else if (el.tagName === "P" && el.textContent === "Total Net Worth") out.push("net-worth");
  }
  return out;
}

const dashboard = async () => {
  render(<DashboardPage />);
  await screen.findByText("Total Net Worth");
};

describe("Dashboard card layout", () => {
  it("default layout renders every card in today's order", async () => {
    await dashboard();
    expect(renderedIds()).toEqual([...DEFAULT_CARD_ORDER]);
  });

  it("default markup keeps the card rows (one tree; desktop grid shape unchanged)", async () => {
    await dashboard();
    const grid = (id: string) => screen.getByTestId(`card-${id}`).closest("div.grid") as HTMLElement;
    expect(grid("health-score").className).toBe("grid grid-cols-1 wide:grid-cols-3 gap-4");
    expect(screen.getByText("Total Net Worth").closest("div.grid")).toBe(grid("health-score"));
    expect(screen.getByText("Total Net Worth").closest("div.wide\\:col-span-2")).not.toBeNull();
    expect(grid("action-center").className).toBe("grid grid-cols-1 wide:grid-cols-3 gap-5");
    // the secondary cards sit in the More insights disclosure, which shares the action-center row
    const toggle = screen.getByRole("button", { name: "More insights" });
    expect(toggle.closest("div.grid")).toBe(grid("action-center"));
    expect(grid("weekly-recap").className).toBe("grid grid-cols-1 wide:grid-cols-2 gap-5");
    expect(grid("weekly-recap").closest('[role="region"]')).toBe(document.getElementById(toggle.getAttribute("aria-controls")!));
    expect(grid("income-expense-chart").className).toContain("grid grid-cols-1 wide:grid-cols-2 gap-5");
    expect(grid("spending-category-chart")).toBe(grid("income-expense-chart"));
    expect(grid("available-to-spend").className).toContain("grid grid-cols-1 wide:grid-cols-3 gap-5");
    // stat tiles grid: three tiles (the Net Worth tile is the hero above)
    expect(screen.getByTestId("stat-Monthly Income").closest("div.grid")!.className).toBe("grid grid-cols-1 regular:grid-cols-3 gap-4");
  });

  it("a hidden card is not rendered", async () => {
    saved = { order: [...DEFAULT_CARD_ORDER], hidden: ["key-metrics", "weekly-recap", "net-worth"] };
    await dashboard().catch(() => {});
    await screen.findByTestId("card-health-score");
    expect(screen.queryByTestId("card-key-metrics")).toBeNull();
    expect(screen.queryByTestId("card-weekly-recap")).toBeNull();
    expect(screen.queryByText("Total Net Worth")).toBeNull();
    expect(screen.getByTestId("card-action-center")).toBeTruthy();
    expect(screen.getByTestId("card-quick-import")).toBeTruthy();
  });

  it("the saved order is applied", async () => {
    const order = [...DEFAULT_CARD_ORDER].reverse();
    saved = { order, hidden: [] };
    await dashboard();
    expect(renderedIds()).toEqual(order);
  });

  it("dev-only cards stay out when dev mode is off, whatever the layout says", async () => {
    dev.on = false;
    await dashboard();
    const ids = renderedIds();
    for (const c of DASHBOARD_CARDS.filter((c) => c.devOnly)) expect(ids).not.toContain(c.id);
    expect(ids).toContain("action-center");
  });

  it("hero goes full width when it no longer shares a row with the health card", async () => {
    saved = { order: [...DEFAULT_CARD_ORDER], hidden: ["health-score"] };
    await dashboard();
    expect(screen.getByText("Total Net Worth").closest("div.lg\\:col-span-2")).toBeNull();
  });

  it("one tree at every size: the Net Worth figure shows once, secondary cards sit once inside More insights", async () => {
    await dashboard();
    // the hero is the single Net Worth block; the duplicate stat tile is gone at every size
    expect(screen.queryByTestId("stat-Net Worth")).toBeNull();
    expect(screen.getAllByText("Total Net Worth")).toHaveLength(1);
    expect(screen.getByTestId("stat-Monthly Income").parentElement!.className).not.toContain("hidden");

    // core cards are never inside the disclosure
    const toggle = screen.getByRole("button", { name: "More insights" });
    const region = document.getElementById(toggle.getAttribute("aria-controls")!) as HTMLElement;
    expect(region.getAttribute("role")).toBe("region");
    expect(region.contains(screen.getByTestId("card-action-center"))).toBe(false);
    // secondary cards are mounted once, inside the region
    for (const id of ["weekly-recap", "quick-import", "income-expense-chart", "insights"]) {
      expect(region.contains(screen.getByTestId(`card-${id}`))).toBe(true);
    }

    // collapsed by default (no size provider = compact), and the toggle opens it
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(region.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(region.hidden).toBe(false);
    expect(screen.getByRole("button", { name: "Fewer insights" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Customize flow", () => {
  const open = async () => {
    await dashboard();
    fireEvent.click(screen.getByRole("button", { name: /Customize/ }));
    return await screen.findByRole("dialog");
  };

  it("header has a Customize action (desktop button + mobile overflow entry)", async () => {
    await dashboard();
    expect(screen.getByRole("button", { name: /Customize/ }).className).toContain(HEADER_SECONDARY);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Customize")).toBeTruthy();
  });

  it("hide + reorder in the sheet, Save PUTs the layout and the dashboard re-renders immediately", async () => {
    const dlg = await open();
    fireEvent.click(within(dlg).getByRole("switch", { name: "Key metrics" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Move Quick import up" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].hidden).toEqual(["key-metrics"]);
    expect(puts[0].order.indexOf("quick-import")).toBeLessThan(puts[0].order.indexOf("weekly-recap"));
    await waitFor(() => expect(screen.queryByTestId("card-key-metrics")).toBeNull());
    const ids = renderedIds();
    expect(ids.indexOf("quick-import")).toBeLessThan(ids.indexOf("weekly-recap"));
  });

  it("Reset to default PUTs the default layout and restores every card", async () => {
    saved = { order: [...DEFAULT_CARD_ORDER].reverse(), hidden: ["key-metrics", "insights"] };
    const dlg = await open();
    expect(screen.queryByTestId("card-key-metrics")).toBeNull();
    fireEvent.click(within(dlg).getByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ order: [...DEFAULT_CARD_ORDER], hidden: [] });
    await waitFor(() => expect(renderedIds()).toEqual([...DEFAULT_CARD_ORDER]));
  });

  it("dev-only cards aren't offered in the sheet when dev mode is off", async () => {
    dev.on = false;
    const dlg = await open();
    expect(within(dlg).queryByRole("switch", { name: "Insights" })).toBeNull();
    expect(within(dlg).getByRole("switch", { name: "Action center" })).toBeTruthy();
  });
});
