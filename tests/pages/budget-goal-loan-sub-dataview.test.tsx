/**
 * @vitest-environment jsdom
 */
// G2-13 / batch 2: budgets, goals, loans and subscriptions on one layout at every size (inset ListRows, no table).
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SizeClass } from "@/components/ui/size-class";

const size: { current: SizeClass } = { current: "compact" };
const session: { userId: string | null; ready: boolean } = { userId: null, ready: true };
const H = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));

vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => size.current,
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: session.userId, ready: session.ready }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({}),
  usePathname: () => "/",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));
vi.mock("@/lib/utils/date", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/date")>()),
  localDateISO: () => "2026-10-09",
}));

import GoalsPage from "@/app/(app)/goals/page";
import LoansPage from "@/app/(app)/loans/page";
import { LoanDetail } from "@/app/(app)/loans/_components/loan-detail";
import SubscriptionsPage from "@/app/(app)/subscriptions/page";
import { loanNextDue } from "@/app/(app)/loans/_components/loan-next-due";

const ROOT = process.cwd();
const PAGES = {
  goals: "src/app/(app)/goals/page.tsx",
  loans: "src/app/(app)/loans/page.tsx",
  subscriptions: "src/app/(app)/subscriptions/page.tsx",
  calendar: "src/app/(app)/subscriptions/_components/subscriptions-calendar.tsx",
} as const;

const DATA: Record<string, unknown> = {};
function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const BUDGET = {
  id: 1, categoryId: 10, categoryName: "Groceries", categoryGroup: "Food",
  amount: 500, rolloverAmount: 0, currency: "VND",
};
const GOAL = {
  id: 3, name: "Emergency fund", type: "emergency_fund", targetAmount: 1000, currentAmount: 250,
  currency: "VND", deadline: "2027-01-01", status: "active", progress: 25, remaining: 750,
  monthlyNeeded: 0, accountIds: [], accounts: [], accountName: null, priority: 0, note: "",
};
const LOAN = {
  id: 5, name: "Car loan", type: "loan", principal: 10000, annualRate: 6, termMonths: 60,
  startDate: "2026-01-15", paymentFrequency: "monthly", extraPayment: 0, paymentAmount: null,
  residualValue: null, monthlyPayment: 193.33, paymentPerPeriod: 193.33, monthlyEquivalentPayment: 193.33,
  totalInterest: 1600, payoffDate: "2031-01-15", remainingBalance: 8000, balanceSource: null,
  principalPaid: 2000, interestPaid: 0, periodsRemaining: 50, accountName: null, accountId: null,
  currency: "VND", displayCurrency: "VND", remainingBalanceDisplay: 8000, monthlyEquivalentPaymentDisplay: 193.33,
};
const SUB = {
  id: 7, name: "Netflix", amount: 15, currency: "USD", frequency: "monthly", status: "active",
  nextDate: "2026-11-01", categoryId: null, categoryName: null, accountId: 3, accountName: "Bank",
  cancelReminderDate: null, notes: "", displayCurrency: "VND",
};

beforeEach(() => {
  localStorage.clear();
  size.current = "compact";
  session.userId = `dv-page-${Math.random().toString(36).slice(2)}`;
  session.ready = true;
  H.search = "";
  H.push.mockReset();
  H.replace.mockReset();
  DATA.budgets = [BUDGET];
  DATA.goals = [GOAL];
  DATA.loans = [LOAN];
  DATA.subs = [SUB];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/budgets")) return json(DATA.budgets);
      if (url.startsWith("/api/dashboard")) {
        return json({ spendingByCategory: [{ categoryId: 10, total: -120 }], incomeVsExpenses: [] });
      }
      if (url.startsWith("/api/budget-templates")) return json([]);
      if (url.startsWith("/api/age-of-money")) return json({ error: "none" });
      if (url.startsWith("/api/goals")) return json(DATA.goals);
      if (url.startsWith("/api/loans")) return json(DATA.loans);
      if (url.startsWith("/api/subscriptions")) return json(DATA.subs);
      if (url.startsWith("/api/recurring")) return json({ recurring: [] });
      return json([]);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Budgets and goals: one inset ListRow layout at every size (no Cards / List toggle, no table).
describe("goals: one ListRow layout at every size", () => {
  it("goals renders its rows as ListRows and no table or data view", async () => {
    const { container } = render(<GoalsPage />);
    const name = await screen.findByText("Emergency fund");
    expect(name.closest("[data-slot=goal-row]")).toBeTruthy();
    expect(container.querySelector("[data-view]")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("a goal row links to the goal detail page (no sheet)", async () => {
    render(<GoalsPage />);
    const row = (await screen.findByRole("link", { name: /Emergency fund/ })) as HTMLAnchorElement;
    expect(row.getAttribute("href")).toBe("/goals/3");
  });
});

// Loans and subscriptions have one inset-list layout at every size: no DataView, no table.
describe("loans and subscriptions: one ListRow layout at every size", () => {
  it("loans renders its rows as ListRows and no table or data view", async () => {
    const { container } = render(<LoansPage />);
    const name = await screen.findByText("Car loan");
    expect(name.closest("[data-slot=loan-row]")).toBeTruthy();
    expect(container.querySelector("[data-view]")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("subscriptions renders its rows as ListRows and no table or data view", async () => {
    const { container } = render(<SubscriptionsPage />);
    const name = await screen.findByText("Netflix");
    expect(name.closest("[data-slot=list-row]")).toBeTruthy();
    expect(container.querySelector("[data-view]")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("G2-13: loan detail shows the estimated next due date", () => {
  it("the Car loan detail shows 2026-10-15 (start 2026-01-15, monthly, today 2026-10-09)", async () => {
    render(<LoanDetail id={(DATA.loans as Array<{ id: number }>)[0].id} />);
    expect(await screen.findByText("2026-10-15")).toBeTruthy();
  });
});

describe("G2-13: no size-class wrapper components in the migrated pages", () => {
  it.each(Object.entries(PAGES))("%s has no CompactOnly / FromMd wrapper", (_name, rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    expect(src).not.toMatch(/<CompactOnly\b/);
    expect(src).not.toMatch(/<FromMd\b/);
  });
});

describe("G2-13: loanNextDue estimate", () => {
  it("is the first payment on or after today, one period after the start date", () => {
    expect(loanNextDue({ startDate: "2026-01-15", paymentFrequency: "monthly" }, false, "2026-10-09")).toBe("2026-10-15");
  });

  it("skips the start date itself (payment 0 is not a payment)", () => {
    expect(loanNextDue({ startDate: "2026-12-01", paymentFrequency: "monthly" }, false, "2026-10-09")).toBe("2027-01-01");
  });

  it("is null for paid-off loans and for semi_monthly (no cadence)", () => {
    expect(loanNextDue({ startDate: "2026-01-15", paymentFrequency: "monthly" }, true, "2026-10-09")).toBeNull();
    expect(loanNextDue({ startDate: "2026-01-15", paymentFrequency: "semi_monthly" }, false, "2026-10-09")).toBeNull();
  });
});

describe("Repeat + Installment phase 2a: Subscriptions page Post now / Skip", () => {
  const DUE = { ...SUB, id: 9, name: "Gym", nextDate: "2026-10-01", postable: true, dueCount: 2, overdue: ["2026-10-01", "2026-11-01"] };

  it("a due subscription shows a due badge, Post now and Skip; a not-due one shows neither", async () => {
    DATA.subs = [DUE, SUB];
    render(<SubscriptionsPage />);
    await screen.findByTestId("sub-post-9");
    expect(screen.getByTestId("sub-due-badge-9").textContent).toBe("2 due");
    expect(screen.getByTestId("sub-post-9")).toBeTruthy();
    expect(screen.getByTestId("sub-skip-9")).toBeTruthy();
    expect(screen.queryByTestId("sub-post-7")).toBeNull();
    expect(screen.queryByTestId("sub-skip-7")).toBeNull();
  });

  it("Post now opens the entry screen for the oldest unposted occurrence and returns here", async () => {
    DATA.subs = [DUE];
    render(<SubscriptionsPage />);
    fireEvent.click(await screen.findByTestId("sub-post-9"));
    expect(H.push).toHaveBeenCalledWith("/transactions/new?subscription=9&occurrence=2026-10-01&return=%2Fsubscriptions");
  });

  it("Skip posts the skip action for next_date and reloads the list", async () => {
    DATA.subs = [DUE];
    render(<SubscriptionsPage />);
    await screen.findByTestId("sub-skip-9");
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const before = fetchMock.mock.calls.filter((c) => c[0] === "/api/subscriptions").length;
    fireEvent.click(screen.getByTestId("sub-skip-9"));
    await waitFor(() => {
      const skip = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
      expect(skip).toBeTruthy();
      expect(JSON.parse(skip![1].body)).toEqual({ action: "skip", id: 9, occurrenceDate: "2026-10-01" });
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/subscriptions").length).toBeGreaterThan(before + 1),
    );
  });

  it("an ended subscription stays in its frequency group (Monthly) with an Ended badge", async () => {
    DATA.subs = [{ ...SUB, id: 11, name: "Old plan", status: "ended", dueCount: 0, overdue: [] }];
    render(<SubscriptionsPage />);
    expect(await screen.findByText(/^Monthly \(1\)/)).toBeTruthy();
    expect(screen.queryByText(/^Ended \(/)).toBeNull();
    expect(screen.getByText("Ended", { selector: "[data-slot=badge], span, div" })).toBeTruthy();
  });
});
