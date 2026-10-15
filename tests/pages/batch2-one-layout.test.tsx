/**
 * @vitest-environment jsdom
 */
// Batch 2 mobile-design pages (goals, accounts, account detail, category detail, account hub): one layout at
// every size. Each page renders the shared header (PageHeader, or SectionPage which owns it), inset ListRows, no
// <table>, and registers its cards with the Customize button (usePageCustomize) where the page has cards.
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { usePageCustomizeRegistration } from "@/components/mobile";

const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: { id: "1" } as Record<string, string>, search: "" }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => H.params,
  usePathname: () => "/",
}));
vi.mock("@/components/dev-mode-guard", () => ({ DevModeGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD", "VND"] }));
vi.mock("@/components/inbox/mode-picker", () => ({ ModePicker: () => null }));
vi.mock("@/components/inbox/import-prefs-picker", () => ({ ImportPrefsPicker: () => null }));
vi.mock("@/components/net-worth-history-chart", () => ({ NetWorthHistoryChart: () => null }));
vi.mock("@/app/(app)/transactions/_components/transactions-workspace", () => ({
  TransactionsWorkspace: () => <div>Transactions Workspace</div>,
}));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Wrap, LineChart: Wrap, AreaChart: Wrap, BarChart: Wrap, ComposedChart: Wrap,
    Line: Leaf, Area: Leaf, Bar: Leaf, Cell: Leaf, XAxis: Leaf, YAxis: Leaf, Tooltip: Leaf, Legend: Leaf,
    ReferenceLine: Leaf, CartesianGrid: Leaf,
  };
});

import GoalsPage from "@/app/(app)/goals/page";
import AccountsPage from "@/app/(app)/accounts/page";
import AccountDetailPage from "@/app/(app)/accounts/[id]/page";
import CategoryPage from "@/app/(app)/categories/[id]/page";
import AccountHubPage from "@/app/(app)/account/page";

const BUDGET = { id: 1, categoryId: 10, categoryName: "Groceries", categoryGroup: "Food", month: "2026-10", amount: 500, rolloverAmount: 0, currency: "USD" };
const GOAL = {
  id: 3, name: "Emergency fund", type: "emergency_fund", targetAmount: 1000, currentAmount: 250, currency: "USD",
  deadline: "2027-01-01", status: "active", progress: 25, remaining: 750, monthlyNeeded: 0, accountIds: [], accounts: [],
  accountName: null, priority: 0, note: "",
};
const ACCOUNT = {
  accountId: 1, accountName: "Techcombank", accountType: "A", accountGroup: "Banks", currency: "USD", balance: 1200,
  convertedBalance: 1200, archived: false, invisible: false, alias: "TC001", id: 1, name: "Techcombank", type: "A", group: "Banks",
  isInvestment: false, mode: "manual",
};
const CATEGORY = {
  category: { id: 10, name: "Groceries", type: "E", group: "Food" },
  windowMonths: 12,
  displayCurrency: "USD",
  payeesLocked: false,
  hasBudget: false,
  months: [
    { month: "2026-09", amount: 300, count: 4, budget: null, partial: false },
    { month: "2026-10", amount: 120, count: 2, budget: null, partial: true },
  ],
  stats: {
    thisMonth: 120, lastMonth: 300, sameMonthLastYear: 0, averageMonthly: 210, medianMonthly: 210,
    highestMonth: { month: "2026-09", amount: 300 }, total: 420, transactionCount: 6, averageTransaction: 70,
    shareOfType: 0.2,
  },
  topPayees: [{ payee: "Corner Store", amount: 300, count: 4, share: 0.71 }],
  recent: [{ id: 77, date: "2026-10-02", payee: "Corner Store", amount: -40, currency: "USD", accountName: "Techcombank" }],
};

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  H.push.mockReset();
  H.replace.mockReset();
  H.params = { id: "1" };
  H.search = "month=2026-10";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method && init.method !== "GET") return json({ ok: true });
      if (u.startsWith("/api/budgets")) return json([BUDGET]);
      if (u.startsWith("/api/dashboard")) return json({ balances: [ACCOUNT], spendingByCategory: [{ categoryId: 10, total: -120 }], incomeVsExpenses: [] });
      if (u.startsWith("/api/age-of-money")) return json({ error: "none" });
      if (u.startsWith("/api/budget-templates")) return json([]);
      if (u.startsWith("/api/goals")) return json([GOAL]);
      if (u.startsWith("/api/accounts")) return json([ACCOUNT]);
      if (u.startsWith("/api/reports/category")) return json({ data: CATEGORY });
      if (u.startsWith("/api/categories")) return json([]);
      if (u.startsWith("/api/transactions")) return json({ total: 0 });
      if (u.startsWith("/api/portfolio")) return json([]);
      if (u.startsWith("/api/settings/account-group-order")) return json({ order: { A: [], L: [] } });
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Reports the Customize registration the header would show (null = the page registered nothing). */
function CustomizeProbe() {
  const reg = usePageCustomizeRegistration();
  return <div data-testid="customize-probe">{reg ? reg.title : "none"}</div>;
}

/** The batch-2 contract: no table, the shared header with one h1 (PageHeader or SectionPage), and inset ListRows. */
function expectOneLayout(container: HTMLElement, title: string, rowSlot = "list-row") {
  expect(container.querySelector("table")).toBeNull();
  const header = container.querySelector('[data-slot="page-header"]');
  expect(header).toBeTruthy();
  expect(header!.querySelector("h1")?.textContent?.trim()).toBe(title);
  expect(container.querySelectorAll(`[data-slot="${rowSlot}"]`).length).toBeGreaterThan(0);
}

describe("Goals: one layout at every size", () => {
  it("shared header with Add Goal, goals as shared ProgressRows, no table, Customize registered", async () => {
    const { container } = render(<><GoalsPage /><CustomizeProbe /></>);
    await screen.findByRole("button", { name: /Emergency fund/ });
    expectOneLayout(container, "Goals", "goal-row");
    expect(screen.getByRole("link", { name: "Add Goal" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("customize-probe").textContent).toBe("Customize"));
  });

  it("a row opens the detail sheet with Edit, mark complete and Delete", async () => {
    render(<GoalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Emergency fund/ }));
    expect((await screen.findByRole("link", { name: "Edit goal Emergency fund" })).getAttribute("href")).toBe("/goals/3/edit");
    expect(screen.getByRole("button", { name: "Mark goal Emergency fund complete" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete goal Emergency fund" })).toBeTruthy();
  });
});

describe("Accounts: one layout at every size", () => {
  it("shared header with Add account, accounts as ListRows, no table, Customize registered", async () => {
    const { container } = render(<><AccountsPage /><CustomizeProbe /></>);
    await screen.findByRole("link", { name: /Techcombank/ });
    expectOneLayout(container, "Accounts");
    expect(screen.getByRole("link", { name: "Create Account" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("customize-probe").textContent).toBe("Customize"));
  });

  it("the account rows link to the account detail page", async () => {
    render(<AccountsPage />);
    const row = (await screen.findByRole("link", { name: /Techcombank/ })) as HTMLAnchorElement;
    expect(row.getAttribute("href")).toBe("/accounts/1");
    expect(row.getAttribute("data-slot")).toBe("list-row");
  });
});

describe("Account detail: one layout at every size", () => {
  it("shared header, the card sections as Cards / ListRows, no table, Customize registered", async () => {
    const { container } = render(<><AccountDetailPage /><CustomizeProbe /></>);
    await screen.findByText("Account number");
    expectOneLayout(container, "Techcombank");
    expect(screen.getByText("Information")).toBeTruthy();
    expect(screen.getByText("Account number").closest('[data-slot="list-row"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit account" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("customize-probe").textContent).toBe("Customize"));
  });

  it("the embedded transactions workspace is still mounted in the full-width column", async () => {
    const { container } = render(<AccountDetailPage />);
    await screen.findByText("Transactions Workspace");
    expect(container.querySelector(".max-w-report")).toBeNull();
    expect(container.querySelector(".w-full.space-y-6")).toBeTruthy();
  });
});

describe("Category detail: one layout at every size", () => {
  it("shared header, the summary as the shared metric grid, the payees and recent transactions as ListRows, no table, Customize registered", async () => {
    H.params = { id: "10" };
    const { container } = render(<><CategoryPage /><CustomizeProbe /></>);
    await screen.findByText("Top payees");
    expectOneLayout(container, "Groceries");
    expect(container.querySelector('[data-slot="metric-grid"]')).toBeTruthy();
    expect(screen.getAllByText("Corner Store")[0].closest('[data-slot="list-row"]')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("customize-probe").textContent).toBe("Customize"));
  });

  it("the time range is the shared toolbar control (no 6M/12M/24M tabs), visible at every width", async () => {
    H.params = { id: "10" };
    render(<CategoryPage />);
    await screen.findByText("Top payees");
    expect(screen.queryByRole("tab", { name: "12M" })).toBeNull();
    expect(screen.getByLabelText("Time range").closest(".hidden")).toBeNull();
  });
});

describe("Account hub: one layout at every size", () => {
  it("the account sections are Cards of ListRows, no table", () => {
    const { container } = render(<AccountHubPage />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll(`[data-slot="list-row"]`).length).toBeGreaterThan(0);
  });
});
