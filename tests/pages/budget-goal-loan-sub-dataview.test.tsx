/**
 * @vitest-environment jsdom
 */
// G2-13: budgets, goals, loans and subscriptions on one adaptive UI.
// Each list page mounts exactly ONE DataView: Cards (the phone layout) or List (table rows).
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
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
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));
vi.mock("@/lib/utils/date", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/date")>()),
  localDateISO: () => "2026-10-09",
}));

import BudgetsPage from "@/app/(app)/budgets/page";
import GoalsPage from "@/app/(app)/goals/page";
import LoansPage from "@/app/(app)/loans/page";
import SubscriptionsPage from "@/app/(app)/subscriptions/page";
import { loanNextDue } from "@/app/(app)/loans/_components/loan-next-due";

const ROOT = process.cwd();
const PAGES = {
  budgets: "src/app/(app)/budgets/page.tsx",
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

function dataViews(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-view]"));
}

/** Waits for the page to finish loading, then returns the single mounted data view. */
async function loadedView(container: HTMLElement) {
  await waitFor(() => expect(dataViews(container).length).toBe(1));
  return dataViews(container)[0] as HTMLElement;
}

describe("G2-13: one DataView per list page (cards by default at compact)", () => {
  it("budgets mounts exactly one data view, defaulting to cards", async () => {
    H.search = "month=2026-10";
    const { container } = render(<BudgetsPage />);
    const view = await loadedView(container);
    expect(view.getAttribute("data-view")).toBe("cards");
    expect(screen.getByText("Groceries")).toBeTruthy();
  });

  it("goals mounts exactly one data view, defaulting to cards", async () => {
    const { container } = render(<GoalsPage />);
    const view = await loadedView(container);
    expect(view.getAttribute("data-view")).toBe("cards");
  });

  it("loans mounts exactly one data view, defaulting to cards", async () => {
    const { container } = render(<LoansPage />);
    const view = await loadedView(container);
    expect(view.getAttribute("data-view")).toBe("cards");
  });

  it("subscriptions (list mode) mounts exactly one data view, defaulting to cards", async () => {
    const { container } = render(<SubscriptionsPage />);
    const view = await loadedView(container);
    expect(view.getAttribute("data-view")).toBe("cards");
  });
});

describe("G2-13: List view columns and rows", () => {
  const cases: Array<{
    name: string;
    Page: () => React.JSX.Element;
    search?: string;
    headers: string[];
    row: { text: string; href: RegExp };
  }> = [
    {
      name: "budgets",
      Page: BudgetsPage,
      search: "month=2026-10",
      headers: ["Category", "Budgeted", "Spent", "Remaining", "Progress"],
      row: { text: "Groceries", href: /^\/budgets\/new\?month=2026-10/ },
    },
    {
      name: "goals",
      Page: GoalsPage,
      headers: ["Goal", "Target", "Saved", "Progress", "Deadline"],
      row: { text: "Emergency fund", href: /^\/goals\/3\/edit$/ },
    },
    {
      name: "loans",
      Page: LoansPage,
      headers: ["Loan", "Principal", "Rate", "Payment", "Next due (estimated)"],
      row: { text: "Car loan", href: /^\/loans\/5\/edit$/ },
    },
    {
      name: "subscriptions",
      Page: SubscriptionsPage,
      headers: ["Name", "Amount", "Frequency", "Next date", "Status"],
      row: { text: "Netflix", href: /^\/subscriptions\/7\/edit\?returnTo=/ },
    },
  ];

  it.each(cases)("$name: List shows the table headers and rows that navigate to the edit page", async ({ Page, search, headers, row }) => {
    H.search = search ?? "";
    const { container } = render(<Page />);
    await loadedView(container);

    fireEvent.click(screen.getByRole("radio", { name: "List" }));

    const view = await loadedView(container);
    expect(view.getAttribute("data-view")).toBe("list");
    const table = within(view).getByRole("table");
    for (const h of headers) {
      expect(within(table).getByRole("columnheader", { name: h })).toBeTruthy();
    }
    const link = within(table).getByRole("link", { name: row.text });
    expect(link.getAttribute("href")).toMatch(row.href);
  });
});

describe("G2-13: loans List shows the estimated next due date", () => {
  it("the Car loan row shows 2026-10-15 (start 2026-01-15, monthly, today 2026-10-09)", async () => {
    const { container } = render(<LoansPage />);
    await loadedView(container);
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    const view = await loadedView(container);
    const row = within(view).getByRole("link", { name: "Car loan" }).closest("tr") as HTMLElement;
    expect(within(row).getByText("2026-10-15")).toBeTruthy();
  });
});

describe("G2-13: per size class persistence", () => {
  it("a List choice at regular does not change compact, and comes back at regular", async () => {
    size.current = "regular";
    const { container, rerender } = render(<GoalsPage />);
    await loadedView(container);
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect((await loadedView(container)).getAttribute("data-view")).toBe("list");

    size.current = "compact";
    rerender(<GoalsPage />);
    expect((await loadedView(container)).getAttribute("data-view")).toBe("cards");

    size.current = "regular";
    rerender(<GoalsPage />);
    expect((await loadedView(container)).getAttribute("data-view")).toBe("list");
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
