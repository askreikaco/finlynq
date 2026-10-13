/**
 * @vitest-environment jsdom
 */
// Batch 1 mobile-design pages (loans, subscriptions, scenarios, fire, tax): one layout at every size.
// Each page renders the shared PageHeader and inset ListRows, and has no <table> in the DOM.
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
  usePathname: () => "/",
}));
vi.mock("@/components/dev-mode-guard", () => ({ DevModeGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Wrap, LineChart: Wrap, AreaChart: Wrap, BarChart: Wrap,
    Line: Leaf, Area: Leaf, Bar: Leaf, XAxis: Leaf, YAxis: Leaf, Tooltip: Leaf, Legend: Leaf, ReferenceLine: Leaf,
  };
});

import LoansPage from "@/app/(app)/loans/page";
import SubscriptionsPage from "@/app/(app)/subscriptions/page";
import ScenariosPage from "@/app/(app)/scenarios/page";
import FirePage from "@/app/(app)/fire/page";
import TaxPage from "@/app/(app)/tax/page";

const LOAN = {
  id: 5, name: "Car loan", type: "loan", principal: 10000, annualRate: 6, termMonths: 60,
  startDate: "2026-01-15", paymentFrequency: "monthly", extraPayment: 0, paymentAmount: null,
  residualValue: null, monthlyPayment: 193.33, paymentPerPeriod: 193.33, monthlyEquivalentPayment: 193.33,
  totalInterest: 1600, payoffDate: "2031-01-15", remainingBalance: 8000, balanceSource: null,
  principalPaid: 2000, interestPaid: 0, periodsRemaining: 50, accountName: null, accountId: null,
  currency: "USD", displayCurrency: "USD", remainingBalanceDisplay: 8000, monthlyEquivalentPaymentDisplay: 193.33,
};
const SUB = {
  id: 7, name: "Netflix", amount: 15, currency: "USD", frequency: "monthly", status: "active",
  nextDate: "2026-11-01", categoryId: null, categoryName: null, accountId: 3, accountName: "Bank",
  cancelReminderDate: null, notes: "", displayCurrency: "USD",
};
const TAX = {
  tfsa: { totalRoom: 100000, used: 20000, remaining: 80000, currentYearLimit: 7000 },
  rrsp: { contributions: [] },
  resp: { contributions: [], grantExample: 500 },
  assetLocationAdvice: [{ holding: "VTI", symbol: "VTI", currentAccount: "Taxable", recommendedAccountType: "RRSP", reason: "Dividends are taxed less in the TFSA." }],
  marginalRates: { at100k: { federal: 20, provincial: 10, combined: 30 } },
};
const FIRE = {
  fireNumber: 1200000, yearsToFire: 20, fireAge: 50, fireDate: "2046-01-01", coastFireNumber: 300000, coastFireAge: 40,
  currentInvestments: 50000, monthlySavings: 1500,
  projections: [{ age: 30, year: 2026, netWorth: 50000, fireNumber: 1200000 }],
  sensitivityTable: [5, 6, 7, 8, 9].map((r) => ({ returnRate: r, savings: 1500, yearsToFire: 30 - r })),
};

const DATA: Record<string, unknown> = {};
function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  H.push.mockReset();
  H.replace.mockReset();
  DATA.loans = [LOAN];
  DATA.subs = [SUB];
  DATA.tax = TAX;
  DATA.fire = FIRE;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("/api/loans") && (!init?.method || init.method === "GET")) return json(DATA.loans);
      if (u.startsWith("/api/subscriptions")) return json(DATA.subs);
      if (u.startsWith("/api/recurring")) return json({ recurring: [] });
      if (u.startsWith("/api/tax")) return json(DATA.tax);
      if (u.startsWith("/api/fire") && init?.method === "POST") return json(DATA.fire);
      if (u.startsWith("/api/dashboard")) return json({});
      return json({});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Asserts the batch-1 contract: no table, the shared PageHeader with one h1, and at least one inset ListRow. */
function expectOneLayout(container: HTMLElement, title: string, { rows = true } = {}) {
  expect(container.querySelector("table")).toBeNull();
  const header = container.querySelector('[data-slot="page-header"]');
  expect(header).toBeTruthy();
  expect(header!.querySelector("h1")?.textContent?.trim()).toBe(title);
  if (rows) expect(container.querySelectorAll('[data-slot="list-row"]').length).toBeGreaterThan(0);
}

describe("Loans: one layout at every size", () => {
  it("shared header with Add Loan, loans as ListRow buttons, no table", async () => {
    const { container } = render(<LoansPage />);
    await screen.findByRole("button", { name: /Car loan/ });
    expectOneLayout(container, "Loans & Debt");
    expect(screen.getByRole("button", { name: /Add Loan/ })).toBeTruthy();
  });

  it("a row opens the detail sheet with the next due date and the edit action", async () => {
    render(<LoansPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Car loan/ }));
    expect(await screen.findByText("Next due (est.)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(H.push).toHaveBeenCalledWith("/loans/5/edit");
  });
});

describe("Subscriptions: one layout at every size", () => {
  it("shared header with Add subscription, the tracked list as ListRows, no table", async () => {
    const { container } = render(<SubscriptionsPage />);
    await screen.findByRole("button", { name: /Netflix/ });
    expectOneLayout(container, "Subscriptions");
    expect(screen.getByRole("button", { name: /Add subscription/ })).toBeTruthy();
  });

  it("a row opens the detail sheet with its actions", async () => {
    render(<SubscriptionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Netflix/ }));
    expect(await screen.findByRole("button", { name: /Pause/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeTruthy();
  });
});

describe("Scenarios: one layout at every size", () => {
  it("shared header and the four calculator tabs, no table; debt list is ListRows", async () => {
    const { container } = render(<ScenariosPage />);
    await screen.findByText("Purchase details");
    // The first tab is a form and its result; its ListRows are on the debt tab (tested below).
    expectOneLayout(container, "Scenarios", { rows: false });
    expect(screen.getByRole("tab", { name: "Home Purchase" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Calculate/ })).toBeTruthy();
  });

  it("the debt payoff tab lists the loans as ListRows, not a table", async () => {
    const { container } = render(<ScenariosPage />);
    await screen.findByText("Purchase details");
    fireEvent.click(screen.getByRole("tab", { name: "Debt Payoff" }));
    // Debt rows are read-only ListRows (no onPress): a div with data-slot=list-row.
    const row = (await screen.findByText("Car loan")).closest('[data-slot="list-row"]');
    expect(row).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("FIRE: one layout at every size", () => {
  it("shared header, the form, and after Calculate the results and the sensitivity list as ListRows", async () => {
    const { container } = render(<FirePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Calculate FIRE/ }));
    await screen.findByText("FIRE Number");
    expectOneLayout(container, "FIRE Calculator");
    expect(screen.getByText("5% annual return").closest('[data-slot="list-row"]')).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("Tax: one layout at every size", () => {
  it("shared header; marginal rates and asset advice as ListRows; no table", async () => {
    const { container } = render(<TaxPage />);
    await screen.findByText("Marginal Tax Rates (Ontario)");
    expectOneLayout(container, "Tax");
    expect(screen.getByRole("button", { name: /Compare/ })).toBeTruthy();
    expect(within(container).getByText("$100,000")).toBeTruthy();
  });

  it("tapping a holding opens its reason in the detail sheet", async () => {
    render(<TaxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /VTI/ }));
    expect(await screen.findByText("Dividends are taxed less in the TFSA.")).toBeTruthy();
  });
});

