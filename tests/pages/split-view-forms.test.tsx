/**
 * @vitest-environment jsdom
 */
// One form, two surfaces: for every migrated entity the route page and the split-view pane render the SAME shared
// form component (marker data-form="<entity>"). The pane is `embedded`: it never navigates, it calls back.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));
const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), search: "", id: "7" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: H.refresh }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.id }),
  usePathname: () => "/x",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: (c: string) => [c, "USD", "VND"] }));
vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ value, onValueChange, placeholder }: { value: string; onValueChange: (v: string) => void; placeholder?: string }) =>
    React.createElement("input", { "aria-label": placeholder ?? "combobox", value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value) }),
}));

import NewGoalRoute from "@/app/(app)/goals/new/page";
import EditGoalRoute from "@/app/(app)/goals/[id]/edit/page";
import { GoalFormPanel } from "@/app/(app)/goals/_components/goal-form-panel";
import NewLoanRoute from "@/app/(app)/loans/new/page";
import EditLoanRoute from "@/app/(app)/loans/[id]/edit/page";
import { LoanFormPanel } from "@/app/(app)/loans/_components/loan-form-panel";
import NewSubscriptionRoute from "@/app/(app)/subscriptions/new/page";
import EditSubscriptionRoute from "@/app/(app)/subscriptions/[id]/edit/page";
import { SubscriptionFormPanel } from "@/app/(app)/subscriptions/_components/subscription-form-panel";
import NewCategoryRoute from "@/app/(app)/categories/new/page";
import EditCategoryRoute from "@/app/(app)/categories/[id]/edit/page";
import { CategoryFormPanel } from "@/app/(app)/categories/_components/category-form-panel";
import NewAccountRoute from "@/app/(app)/accounts/new/page";
import EditAccountRoute from "@/app/(app)/accounts/[id]/edit/page";
import { AccountFormPanel } from "@/app/(app)/accounts/_components/account-form-panel";

const GOAL = { id: 7, name: "Trip", type: "savings", targetAmount: 1000, currentAmount: 250, currency: "USD", deadline: null, accountIds: [], accounts: [], accountName: null, priority: 2, status: "active", progress: 25, remaining: 750, monthlyNeeded: 0, note: "" };
const LOAN = {
  id: 7, name: "House", type: "mortgage", principal: 200000, annualRate: 4.5, termMonths: 240, startDate: "2026-01-01", paymentFrequency: "monthly",
  extraPayment: 0, paymentAmount: null, residualValue: null, monthlyPayment: 1000, paymentPerPeriod: 1000, monthlyEquivalentPayment: 1000, totalInterest: 0,
  payoffDate: "2046-01-01", remainingBalance: 190000, balanceSource: null, principalPaid: 10000, interestPaid: 0, periodsRemaining: 200, accountName: null,
  accountId: null, currency: "USD", displayCurrency: "USD", remainingBalanceDisplay: 190000, monthlyEquivalentPaymentDisplay: 1000,
};
const SUB = { id: 7, name: "Netflix", amount: 15, currency: "USD", frequency: "monthly", status: "active", nextDate: "2026-11-01", categoryId: null, categoryName: null, accountId: null, accountName: null, cancelReminderDate: null, notes: "", displayCurrency: "USD" };
const CATS = [{ id: 7, type: "E", group: "Food", name: "Groceries", note: "" }];
const ACCTS = [{ id: 7, name: "Wallet", alias: null, group: "Cash", type: "A", currency: "USD", note: "", archived: false, isInvestment: false }];
const BUDGET = { id: 7, categoryId: 7, categoryName: "Groceries", categoryGroup: "Food", month: "2026-10", amount: 300 };

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  H.search = "";
  H.id = "7";
  for (const m of [H.push, H.replace, H.refresh]) m.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/goals") return json([GOAL]);
      if (url === "/api/loans") return json([LOAN]);
      if (url === "/api/subscriptions") return json([SUB]);
      if (url === "/api/categories") return json(CATS);
      if (url.startsWith("/api/accounts")) return json(ACCTS);
      if (url === "/api/portfolio") return json([]);
      if (url.startsWith("/api/budgets")) return json([BUDGET]);
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Surface = { name: string; page: React.ReactElement; pane: React.ReactElement };
const noop = () => undefined;
const CASES: { entity: string; surfaces: Surface[] }[] = [
  {
    entity: "goal",
    surfaces: [
      { name: "create", page: <NewGoalRoute />, pane: <GoalFormPanel mode="create" embedded onSaved={noop} onCancel={noop} /> },
      { name: "edit", page: <EditGoalRoute />, pane: <GoalFormPanel mode="edit" id="7" embedded onSaved={noop} onCancel={noop} onDeleted={noop} /> },
    ],
  },
  {
    entity: "loan",
    surfaces: [
      { name: "create", page: <NewLoanRoute />, pane: <LoanFormPanel mode="create" embedded onSaved={noop} onCancel={noop} /> },
      { name: "edit", page: <EditLoanRoute />, pane: <LoanFormPanel mode="edit" id="7" embedded onSaved={noop} onCancel={noop} onDeleted={noop} /> },
    ],
  },
  {
    entity: "subscription",
    surfaces: [
      { name: "create", page: <NewSubscriptionRoute />, pane: <SubscriptionFormPanel mode="create" embedded onSaved={noop} onCancel={noop} /> },
      { name: "edit", page: <EditSubscriptionRoute />, pane: <SubscriptionFormPanel mode="edit" id="7" embedded onSaved={noop} onCancel={noop} onDeleted={noop} /> },
    ],
  },
  {
    entity: "category",
    surfaces: [
      { name: "create", page: <NewCategoryRoute />, pane: <CategoryFormPanel mode="create" embedded onSaved={noop} onCancel={noop} /> },
      { name: "rename", page: <EditCategoryRoute />, pane: <CategoryFormPanel mode="edit" id="7" embedded onSaved={noop} onCancel={noop} onDeleted={noop} /> },
    ],
  },
  {
    entity: "account",
    surfaces: [
      { name: "create", page: <NewAccountRoute />, pane: <AccountFormPanel mode="create" embedded onSaved={noop} onCancel={noop} /> },
      { name: "edit", page: <EditAccountRoute />, pane: <AccountFormPanel mode="edit" id="7" embedded onSaved={noop} onCancel={noop} onDeleted={noop} /> },
    ],
  },
];

const marker = (entity: string) => `[data-form="${entity}"]`;

describe.each(CASES)("$entity: the route page and the split pane render the same form", ({ entity, surfaces }) => {
  for (const s of surfaces) {
    it(`${s.name}: page and pane both carry data-form="${entity}"; only the pane is embedded`, async () => {
      const page = render(s.page);
      await waitFor(() => expect(page.container.querySelector(marker(entity))).toBeTruthy());
      expect(page.container.querySelector(`${marker(entity)}[data-embedded="true"]`)).toBeNull();
      expect(page.container.querySelector('[data-slot="form-pane-header"]')).toBeNull();
      page.unmount();

      const pane = render(s.pane);
      await waitFor(() => expect(pane.container.querySelector(marker(entity))).toBeTruthy());
      // The pane never renders the page bar; it has its own compact header, or none (the form carries its own title).
      expect(pane.container.querySelector('[data-slot="page-header"]')).toBeNull();
      expect(H.push).not.toHaveBeenCalled();
      expect(H.replace).not.toHaveBeenCalled();
    });
  }
});

describe("embedded pane: callbacks replace navigation", () => {
  it("goal edit: Cancel calls onCancel, never router.push", async () => {
    const onCancel = vi.fn();
    render(<GoalFormPanel mode="edit" id="7" embedded onCancel={onCancel} />);
    await screen.findByDisplayValue("Trip");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(H.push).not.toHaveBeenCalled();
  });

  it("goal edit: Save PUTs and calls onSaved, never router.push", async () => {
    const onSaved = vi.fn();
    const { container } = render(<GoalFormPanel mode="edit" id="7" embedded onSaved={onSaved} />);
    await screen.findByDisplayValue("Trip");
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(H.push).not.toHaveBeenCalled();
  });

  it("goal edit: Delete (in the pane header) asks first, then DELETEs and calls onDeleted", async () => {
    const onDeleted = vi.fn();
    render(<GoalFormPanel mode="edit" id="7" embedded onDeleted={onDeleted} />);
    await screen.findByDisplayValue("Trip");
    fireEvent.click(screen.getByRole("button", { name: /^Delete/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).startsWith("/api/goals?id=7") && c[1]?.method === "DELETE")).toBe(true);
    expect(H.push).not.toHaveBeenCalled();
  });

  it("the pane header has a Close button that calls onCancel", async () => {
    const onCancel = vi.fn();
    render(<LoanFormPanel mode="edit" id="7" embedded onCancel={onCancel} />);
    await screen.findByDisplayValue("House");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("loan edit pane: an unknown id shows the not-found state inside the pane, no navigation", async () => {
    render(<LoanFormPanel mode="edit" id="999" embedded />);
    expect(await screen.findByText("Loan not found")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("account create pane: onSaved receives the new id so the pane can stay on it", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/accounts" && init?.method === "POST") return json({ id: 42, name: "New", type: "A", group: "Cash", currency: "USD" }, 201);
      if (url.startsWith("/api/accounts")) return json(ACCTS);
      return json({}, 404);
    });
    const onSaved = vi.fn();
    const { container } = render(<AccountFormPanel mode="create" embedded onSaved={onSaved} />);
    await waitFor(() => expect(container.querySelector("form")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Account Name"), { target: { value: "New" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(42));
    expect(H.push).not.toHaveBeenCalled();
  });
});
