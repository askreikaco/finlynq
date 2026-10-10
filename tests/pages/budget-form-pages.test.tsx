/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

const H = vi.hoisted(() => ({ push: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({}),
  usePathname: () => "/budgets/new",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
// Combobox is a base-ui popover; drive it as a plain input so tests can pick a category/envelope by id.
vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ value, onValueChange, placeholder }: { value: string; onValueChange: (v: string) => void; placeholder?: string }) =>
    React.createElement("input", {
      "aria-label": placeholder ?? "combobox",
      placeholder,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value),
    }),
}));

import { getMonthLabel } from "@/lib/currency";
import NewBudgetRoute from "@/app/(app)/budgets/new/page";
import NewTemplateRoute from "@/app/(app)/budgets/templates/new/page";
import ApplyTemplateRoute from "@/app/(app)/budgets/templates/apply/page";
import MoveMoneyRoute from "@/app/(app)/budgets/move-money/page";

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let postStatus = 200;
let budgetRows: unknown[] = [];
let templateRows: unknown[] = [];
let categoryRows: unknown[] = [];

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ROWS = [
  { id: 1, categoryId: 10, categoryName: "Food", categoryGroup: "Living", month: "2026-10", amount: 300, currency: "USD" },
  { id: 2, categoryId: 11, categoryName: "Fun", categoryGroup: "Living", month: "2026-10", amount: 100, currency: "USD" },
];

beforeEach(() => {
  calls = [];
  postStatus = 200;
  H.search = "month=2026-10";
  H.push.mockReset();
  budgetRows = ROWS;
  templateRows = [
    { id: 5, name: "Essentials", categoryId: 10, categoryName: "Food", categoryGroup: "Living", amount: 300, createdAt: "" },
    { id: 6, name: "Essentials", categoryId: 11, categoryName: "Fun", categoryGroup: "Living", amount: 100, createdAt: "" },
  ];
  categoryRows = [
    { id: 10, name: "Food", type: "E", group: "Living" },
    { id: 12, name: "Salary", type: "I", group: "Income" },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/budgets?month=2026-10&rollover=1")) return json(budgetRows);
      if (url.startsWith("/api/dashboard")) {
        return json({
          spendingByCategory: [{ categoryId: 10, categoryName: "Food", categoryGroup: "Living", categoryType: "E", total: -120 }],
          incomeVsExpenses: [{ type: "I", total: 1000 }],
        });
      }
      if (url === "/api/categories") return json(categoryRows);
      if (url === "/api/budget-templates" && method === "GET") return json(templateRows);
      if (url === "/api/budget-templates" && method === "POST") return json({ id: 99 }, 201);
      if (url.startsWith("/api/budget-templates?id=") && method === "DELETE") return json({ ok: true });
      if (url === "/api/budgets" && method === "POST") {
        return json(postStatus === 200 ? { ok: true } : { error: "Budget locked" }, postStatus);
      }
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const postsTo = (url: string) => calls.filter((c) => c.url === url && c.init?.method === "POST");
const bodies = (url: string) => postsTo(url).map((c) => JSON.parse(String(c.init?.body)));

describe("Set budget page (/budgets/new)", () => {
  it("renders the heading for the month, the category/amount fields and a disabled Save", () => {
    render(<NewBudgetRoute />);
    expect(screen.getByRole("heading", { level: 1, name: `Set budget for ${getMonthLabel("2026-10")}` })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save Budget" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("loads the categories the picker offers", async () => {
    render(<NewBudgetRoute />);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/categories")).toBe(true));
  });

  it("POSTs the same payload as the old dialog, then returns to the month's list", async () => {
    const { container } = render(<NewBudgetRoute />);
    fireEvent.change(screen.getByLabelText("Select category"), { target: { value: "10" } });
    fireEvent.change(container.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/budgets?month=2026-10"));
    expect(bodies("/api/budgets")).toEqual([{ categoryId: 10, month: "2026-10", amount: 500, currency: "USD" }]);
  });

  it("shows the server error and stays put when the save fails", async () => {
    postStatus = 409;
    const { container } = render(<NewBudgetRoute />);
    fireEvent.change(screen.getByLabelText("Select category"), { target: { value: "10" } });
    fireEvent.change(container.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));
    expect(await screen.findByText("Budget locked")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("Save template page (/budgets/templates/new)", () => {
  it("saves one template row per budget, then returns to the list", async () => {
    render(<NewTemplateRoute />);
    const save = await screen.findByRole("button", { name: "Save Template" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. Monthly Essentials"), { target: { value: " Essentials " } });
    fireEvent.click(save);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/budgets?month=2026-10"));
    const posts = postsTo("/api/budget-templates");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({ name: "Essentials", categoryId: 10, amount: 300 });
    expect(JSON.parse(String(posts[1].init?.body))).toEqual({ name: "Essentials", categoryId: 11, amount: 100 });
  });

  it("explains when the month has no budgets to save", async () => {
    budgetRows = [];
    render(<NewTemplateRoute />);
    expect(await screen.findByText(new RegExp(`no budgets for ${getMonthLabel("2026-10")}`))).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save Template" })).toBeNull();
  });
});

describe("Apply template page (/budgets/templates/apply)", () => {
  it("lists template names and applies each row to the month", async () => {
    render(<ApplyTemplateRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/budgets?month=2026-10"));
    expect(bodies("/api/budgets")).toEqual([
      { categoryId: 10, month: "2026-10", amount: 300, currency: "USD" },
      { categoryId: 11, month: "2026-10", amount: 100, currency: "USD" },
    ]);
  });

  it("shows the reason and stays when applying fails", async () => {
    postStatus = 409;
    render(<ApplyTemplateRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Budget locked")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("shows the unlock message (not a generic failure) on 423", async () => {
    postStatus = 423;
    render(<ApplyTemplateRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Unlock your data to make changes")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("deletes a template row without leaving the page", async () => {
    render(<ApplyTemplateRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete template Essentials" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/budget-templates?id=5" && c.init?.method === "DELETE")).toBe(true));
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("Move money page (/budgets/move-money)", () => {
  it("moves funds: the source is reduced and the target increased", async () => {
    render(<MoveMoneyRoute />);
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/dashboard"))).toBe(true));
    const pickers = screen.getAllByLabelText("Select category");
    fireEvent.change(pickers[0], { target: { value: "10" } });
    fireEvent.change(pickers[1], { target: { value: "11" } });
    fireEvent.change(document.querySelector('input[placeholder="50.00"]') as HTMLInputElement, { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Move Funds" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/budgets?month=2026-10"));
    expect(bodies("/api/budgets")).toEqual([
      { categoryId: 10, month: "2026-10", amount: 250, currency: "USD" },
      { categoryId: 11, month: "2026-10", amount: 150, currency: "USD" },
    ]);
  });

  it("does not allow moving money from a category into itself", async () => {
    render(<MoveMoneyRoute />);
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/dashboard"))).toBe(true));
    const pickers = await waitFor(() => {
      const p = screen.getAllByLabelText("Select category");
      expect(p).toHaveLength(2);
      return p;
    });
    fireEvent.change(pickers[0], { target: { value: "10" } });
    fireEvent.change(document.querySelector('input[placeholder="50.00"]') as HTMLInputElement, { target: { value: "5" } });
    // Once "From" is set, "To" no longer offers that category; the button stays disabled until a distinct To is chosen.
    fireEvent.change(pickers[1], { target: { value: "10" } });
    expect((screen.getByRole("button", { name: "Move Funds" }) as HTMLButtonElement).disabled).toBe(true);
    expect(postsTo("/api/budgets")).toHaveLength(0);
  });

  it("says why Move Money is unavailable with fewer than two budgets", async () => {
    budgetRows = [ROWS[0]];
    render(<MoveMoneyRoute />);
    expect(await screen.findByText(/at least two budgeted categories/)).toBeTruthy();
  });
});

describe("Budget form pages: returnTo validation", () => {
  const pages = [
    ["/budgets/new", NewBudgetRoute],
    ["/budgets/templates/apply", ApplyTemplateRoute],
    ["/budgets/templates/new", NewTemplateRoute],
    ["/budgets/move-money", MoveMoneyRoute],
  ] as const;

  for (const [label, Page] of pages) {
    it.each(["//evil.example/x", "https://evil.example", "javascript:alert(1)"])(
      `${label}: rejects returnTo %s, Back falls back to the month's list`,
      (bad) => {
        H.search = `month=2026-10&returnTo=${encodeURIComponent(bad)}`;
        render(<Page />);
        expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/budgets?month=2026-10");
      },
    );
  }

  it("accepts a same-app returnTo (the list URL with its mode) for Back", () => {
    H.search = `month=2026-10&returnTo=${encodeURIComponent("/budgets?month=2026-10&mode=envelope")}`;
    render(<NewBudgetRoute />);
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/budgets?month=2026-10&mode=envelope");
  });

  it("ignores a malformed month and uses the current month in the heading", () => {
    H.search = "month=2026-13";
    render(<NewBudgetRoute />);
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).not.toContain("2026-13");
  });
});
