/**
 * @vitest-environment jsdom
 */
// Budgets list with the offline queue (local-first L3): a queued budget shows with "Waiting to sync"; a flag-off or
// empty queue renders the server rows only.
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({
  BUDGETS: [
    { id: 1, categoryId: 10, categoryName: "Food", categoryGroup: "Living", month: "2026-10", amount: 300, currency: "CAD", rolloverAmount: 0 },
  ] as unknown[],
  PEND: { creates: [], edits: {}, deletes: {} } as unknown,
  ACTIVE: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("month=2026-10"),
  usePathname: () => "/budgets",
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
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "CAD", isLoading: false }) }));
vi.mock("@/lib/data/use-cache-first", () => ({
  useCacheFirstJson: (url: string | null) => {
    if (!url) return { data: undefined, loading: false, error: false, reload: () => {} };
    if (url.startsWith("/api/budgets")) return { data: H.BUDGETS, loading: false, error: false, reload: () => {} };
    if (url.startsWith("/api/dashboard")) return { data: { spendingByCategory: [], incomeVsExpenses: [] }, loading: false, error: false, reload: () => {} };
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
import BudgetsPage from "@/app/(app)/budgets/page";

afterEach(() => {
  cleanup();
  H.BUDGETS = [{ id: 1, categoryId: 10, categoryName: "Food", categoryGroup: "Living", month: "2026-10", amount: 300, currency: "CAD", rolloverAmount: 0 }];
  H.PEND = { creates: [], edits: {}, deletes: {} };
});

describe("budgets page with the offline queue", () => {
  it("empty queue (flag off): server rows only, no sync badge", () => {
    render(<BudgetsPage />);
    expect(screen.getAllByText("Food").length).toBeGreaterThan(0);
    expect(screen.queryByText("Waiting to sync")).toBeNull();
  });

  it("a queued create shows as a row with the 'Waiting to sync' badge", () => {
    H.ACTIVE = true;
    H.PEND = {
      creates: [{ opId: "b-op1", status: "pending", failReason: null, fields: { categoryId: 12, month: "2026-10", amount: 500, currency: "CAD" }, ref: { categoryId: 12, month: "2026-10", categoryName: "Travel", categoryGroup: "Life" } }],
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

  it("a pending queued delete hides the row", () => {
    H.PEND = { creates: [], edits: {}, deletes: { 1: { opId: "d2", status: "pending", failReason: null } } };
    render(<BudgetsPage />);
    expect(screen.queryAllByText("Food")).toHaveLength(0);
  });

  it("offline delete of a budget with a queued edit uses the SERVER row as the baseline (not the overlay)", async () => {
    H.ACTIVE = true;
    H.PEND = { creates: [], edits: { 1: { opId: "e9", status: "pending", failReason: null, fields: { amount: 450 }, ref: { categoryId: 10, month: "2026-10" } } }, deletes: {} };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    vi.mocked(queueOfflineBudgetDelete).mockResolvedValueOnce(true);
    render(<BudgetsPage />);
    fireEvent.click(screen.getAllByLabelText("Delete budget for Food")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Delete budget" }));
    await waitFor(() => expect(queueOfflineBudgetDelete).toHaveBeenCalledTimes(1));
    expect(vi.mocked(queueOfflineBudgetDelete).mock.calls[0][0]).toMatchObject({ id: 1, amount: 300, currency: "CAD" });
    vi.unstubAllGlobals();
    H.ACTIVE = false;
  });
});
