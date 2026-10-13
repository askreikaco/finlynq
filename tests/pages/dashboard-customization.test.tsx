/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
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
vi.mock("@/components/subscriptions/due-card", () => ({
  DueCard: ({ returnTo }: { returnTo?: string }) => <div data-testid="card-due-subscriptions" data-return={returnTo} />,
}));
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
vi.mock("@/components/metric-card", async (orig) => {
  const m = await orig<typeof import("@/components/metric-card")>();
  // The three monthly summary cards become markers; every other card (net worth hero, tiles) stays real.
  return {
    ...m,
    MetricCard: (p: React.ComponentProps<typeof m.MetricCard>) =>
      ["Monthly Income", "Monthly Expenses", "Budgets"].includes(String(p.label)) ? (
        <div data-testid={`stat-${String(p.label)}`} data-badge={p.badgePct ?? ""} data-invert={p.invertTone ? "1" : ""}>{p.label}</div>
      ) : (
        <m.MetricCard {...p} />
      ),
  };
});

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

  it("default markup keeps the card rows: tiles share the metric grid, the row-3 and chart rows are unchanged, no accordion", async () => {
    await dashboard();
    const grid = (id: string) => screen.getByTestId(`card-${id}`).closest("div.grid") as HTMLElement;
    // Net worth hero is full width on its own; health + summary tiles + key metrics are ONE shared metric grid
    // (2 mobile, 3 tablet and desktop for the 6 tiles: 3 + 3, never 4 + 2)
    expect(grid("health-score").className).toBe("grid grid-cols-2 regular:grid-cols-3 gap-3 regular:gap-4");
    expect(screen.getByText("Total Net Worth").closest("div.grid")).not.toBe(grid("health-score"));
    expect(grid("key-metrics")).toBe(grid("health-score"));
    expect(screen.getByTestId("stat-Monthly Income").closest("div.grid")).toBe(grid("health-score"));
    // action center, weekly recap and quick import share the 3-up row
    expect(grid("action-center").className).toBe("grid grid-cols-1 regular:grid-cols-2 wide:grid-cols-3 gap-5");
    expect(grid("weekly-recap")).toBe(grid("action-center"));
    expect(grid("quick-import")).toBe(grid("action-center"));
    expect(grid("income-expense-chart").className).toBe("grid grid-cols-1 wide:grid-cols-2 gap-5");
    expect(grid("spending-category-chart")).toBe(grid("income-expense-chart"));
    expect(grid("available-to-spend").className).toBe("grid grid-cols-1 wide:grid-cols-3 gap-5");
    // no accordion any more
    expect(screen.queryByRole("button", { name: /More insights|Fewer insights/ })).toBeNull();
  });

  it("the Due card sits right after the tips, before the hero, and posts return to /dashboard", async () => {
    await dashboard();
    const ids = renderedIds();
    expect(ids.slice(0, 3)).toEqual(["onboarding-tips", "due-subscriptions", "net-worth"]);
    expect(screen.getByTestId("card-due-subscriptions").getAttribute("data-return")).toBe("/dashboard");
    // a plain full-width card: not in any grid
    expect(screen.getByTestId("card-due-subscriptions").closest("div.grid")).toBeNull();
  });

  it("a layout saved before the Due card existed shows it after the tips; the user's order and hidden cards are kept", async () => {
    const legacy = DEFAULT_CARD_ORDER.filter((i) => i !== "due-subscriptions");
    saved = { order: legacy, hidden: ["key-metrics"] };
    await dashboard();
    const ids = renderedIds();
    expect(ids.indexOf("due-subscriptions")).toBe(ids.indexOf("onboarding-tips") + 1);
    expect(ids).not.toContain("key-metrics");
  });

  it("the Due card can be hidden", async () => {
    saved = { order: [...DEFAULT_CARD_ORDER], hidden: ["due-subscriptions"] };
    await dashboard();
    expect(screen.queryByTestId("card-due-subscriptions")).toBeNull();
    expect(screen.getByTestId("card-health-score")).toBeTruthy();
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

  it("hiding some small tiles keeps the rest in one shared tile grid", async () => {
    saved = { order: [...DEFAULT_CARD_ORDER], hidden: ["health-score"] };
    await dashboard();
    const tiles = screen.getByTestId("stat-Monthly Income").closest("div.grid") as HTMLElement;
    expect(tiles.className).toContain("grid-cols-2");
    expect(tiles.contains(screen.getByTestId("card-key-metrics"))).toBe(true);
    expect(screen.queryByTestId("card-health-score")).toBeNull();
  });

  it("Monthly Income / Expenses carry a % change vs the previous month (expense inverted); none without a prior month", async () => {
    const rows = (months: [string, number, number][]) =>
      months.flatMap(([month, inc, exp]) => [
        { month, type: "I", total: inc },
        { month, type: "E", total: -exp },
      ]);
    const withRows = (r: unknown[]) => {
      const f = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation()! as (url: string, init?: RequestInit) => unknown;
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
        String(url).includes("/api/dashboard") && !String(url).includes("layout")
          ? { ok: true, json: async () => ({ balances: [], incomeVsExpenses: r, netWorthOverTime: [], spendingByCategory: [], displayCurrency: "VND" }) }
          : f(url, init)));
    };
    withRows(rows([["2020-01", 100, 50], ["2020-02", 150, 40]]));
    await dashboard();
    expect(screen.getByTestId("stat-Monthly Income").getAttribute("data-badge")).toBe("50");
    expect(screen.getByTestId("stat-Monthly Expenses").getAttribute("data-badge")).toBe("-20");
    expect(screen.getByTestId("stat-Monthly Expenses").getAttribute("data-invert")).toBe("1");
    expect(screen.getByTestId("stat-Monthly Income").getAttribute("data-invert")).toBe("");
    cleanup();
    withRows(rows([["2020-02", 150, 40]]));
    await dashboard();
    expect(screen.getByTestId("stat-Monthly Income").getAttribute("data-badge")).toBe("");
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

  it("one tree at every size: the Net Worth figure shows once, every secondary card renders inline (no disclosure)", async () => {
    await dashboard();
    // the hero is the single Net Worth block; the duplicate stat tile is gone at every size
    expect(screen.queryByTestId("stat-Net Worth")).toBeNull();
    expect(screen.getAllByText("Total Net Worth")).toHaveLength(1);
    expect(screen.getByTestId("stat-Monthly Income").parentElement!.className).not.toContain("hidden");
    // secondary cards are mounted once, always expanded (no region, no toggle)
    for (const id of ["weekly-recap", "quick-import", "income-expense-chart", "insights", "action-center"]) {
      expect(screen.getAllByTestId(`card-${id}`)).toHaveLength(1);
    }
    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("Customize flow", () => {
  const open = async () => {
    await dashboard();
    fireEvent.click(screen.getByRole("button", { name: /Customize/ }));
    return await screen.findByRole("dialog");
  };

  it("header: [More][Customize] in one group, the Add primary to the right; Customize is not in the More menu", async () => {
    await dashboard();
    const customize = screen.getByRole("button", { name: "Customize" });
    expect(customize.getAttribute("title")).toBe("Customize");
    const capsule = customize.closest('[data-slot="header-capsule"]') as HTMLElement;
    const more = capsule.querySelector('[data-slot="overflow-trigger"]') as HTMLElement;
    // More first, then Customize, in the same capsule
    expect(more.compareDocumentPosition(customize) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const add = screen.getByRole("link", { name: "Add transaction" });
    expect(capsule.contains(add)).toBe(false);
    expect(customize.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(more);
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByText("Customize")).toBeNull();
    expect(within(menu).getByText("General settings")).toBeTruthy();
  });

  it("the Customize sheet lists Due subscriptions as a switchable card", async () => {
    const dlg = await open();
    expect(within(dlg).getByRole("switch", { name: "Due subscriptions" })).toBeTruthy();
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
