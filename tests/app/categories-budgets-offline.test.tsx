/**
 * @vitest-environment jsdom
 */
// /categories budgets with the offline queue (local-first L3): a queued budget shows with "Waiting to sync"; a flag-off
// or empty queue renders the server rows only. (Budgets were merged into /categories; /budgets redirects.)
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({
  BUDGETS: [
    { id: 1, categoryId: 10, categoryName: "Food", categoryGroup: "", month: "2026-10", amount: 300, currency: "CAD", rolloverAmount: 0 },
  ] as unknown[],
  PEND: { creates: [], edits: {}, deletes: {} } as unknown,
  ACTIVE: false,
  // Ungrouped categories, so every row is visible without opening an accordion.
  REPORT: {
    month: "2026-10", partial: true, windowMonths: ["2026-09", "2026-10"], total: 80, averageTotal: null, displayCurrency: "CAD", type: "E",
    categories: [{ id: 10, name: "Food", group: "", amount: 80, share: 1, average: null, change: null, budget: 300, trend: [60, 80] }],
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("month=2026-10"),
  usePathname: () => "/categories",
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement("a", { href }, children) }));
vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => "regular",
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "budgets-test-user", ready: true }),
}));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return { PieChart: Wrap, Pie: Wrap, Cell: Leaf, ResponsiveContainer: Wrap, AreaChart: Wrap, Area: Leaf, Tooltip: Leaf, YAxis: Leaf };
});
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "CAD", isLoading: false }) }));
vi.mock("@/lib/data/use-cache-first", () => ({
  useCacheFirstJson: (url: string | null) => {
    if (!url) return { data: undefined, loading: false, error: false, reload: () => {} };
    if (url.startsWith("/api/reports/categories")) return { data: { data: H.REPORT }, loading: false, error: false, reload: () => {} };
    if (url.startsWith("/api/budgets")) return { data: H.BUDGETS, loading: false, error: false, reload: () => {} };
    return { data: undefined, loading: false, error: false, reload: () => {} };
  },
}));
vi.mock("@/lib/data/local-write-queue", () => ({
  usePendingBudgets: () => H.PEND,
  isLocalWriteQueueActive: () => H.ACTIVE,
  queueOfflineBudgetDelete: vi.fn(async () => false),
  discardQueuedCreate: vi.fn(async () => false),
}));

import { queueOfflineBudgetDelete } from "@/lib/data/local-write-queue";
import CategoriesPageContent from "@/app/(app)/categories/_page-content";

const BudgetsPage = () => <CategoriesPageContent />;

afterEach(() => {
  cleanup();
  H.BUDGETS = [{ id: 1, categoryId: 10, categoryName: "Food", categoryGroup: "", month: "2026-10", amount: 300, currency: "CAD", rolloverAmount: 0 }];
  H.PEND = { creates: [], edits: {}, deletes: {} };
});

describe("categories page budgets with the offline queue", () => {
  it("empty queue (flag off): server rows only, no sync badge", () => {
    render(<BudgetsPage />);
    expect(screen.getAllByText("Food").length).toBeGreaterThan(0);
    expect(screen.queryByText("Waiting to sync")).toBeNull();
  });

  it("a queued create shows as a row with the 'Waiting to sync' badge", () => {
    H.ACTIVE = true;
    H.PEND = {
      creates: [{ opId: "b-op1", status: "pending", failReason: null, fields: { categoryId: 12, month: "2026-10", amount: 500, currency: "CAD" }, ref: { categoryId: 12, month: "2026-10", categoryName: "Travel", categoryGroup: "" } }],
      edits: {},
      deletes: {},
    };
    render(<BudgetsPage />);
    expect(screen.getAllByText("Travel").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Waiting to sync").length).toBeGreaterThan(0);
    H.ACTIVE = false;
  });

  it("a failed queued delete keeps the row marked 'Sync failed'", () => {
    H.PEND = { creates: [], edits: {}, deletes: { 1: { opId: "d1", status: "failed", failReason: "Row changed on the server" } } };
    render(<BudgetsPage />);
    expect(screen.getAllByText("Sync failed").length).toBeGreaterThan(0);
  });

  it("a pending queued delete removes the budget; the category (it has spending) stays without one", () => {
    H.PEND = { creates: [], edits: {}, deletes: { 1: { opId: "d2", status: "pending", failReason: null } } };
    render(<BudgetsPage />);
    expect(screen.getAllByText("Food").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Delete budget: Food" })).toBeNull();
    expect(screen.getAllByText("No budget").length).toBeGreaterThan(0);
  });

  it("offline delete of a budget with a queued edit uses the SERVER row as the baseline (not the overlay)", async () => {
    H.ACTIVE = true;
    H.PEND = { creates: [], edits: { 1: { opId: "e9", status: "pending", failReason: null, fields: { amount: 450 }, ref: { categoryId: 10, month: "2026-10" } } }, deletes: {} };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    vi.mocked(queueOfflineBudgetDelete).mockResolvedValueOnce(true);
    render(<BudgetsPage />);
    // The row's delete action opens the confirm.
    fireEvent.click(await screen.findByRole("button", { name: "Delete budget: Food" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(queueOfflineBudgetDelete).toHaveBeenCalledTimes(1));
    expect(vi.mocked(queueOfflineBudgetDelete).mock.calls[0][0]).toMatchObject({ id: 1, amount: 300, currency: "CAD" });
    vi.unstubAllGlobals();
    H.ACTIVE = false;
  });
});
