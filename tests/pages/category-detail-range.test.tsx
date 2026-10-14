/**
 * @vitest-environment jsdom
 */
// /categories/[id]: no 6M/12M/24M controls; the toolbar range drives the report query; the type label is in the top bar.
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({ search: "", id: "10" }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.id }),
  usePathname: () => "/categories/10",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "cr-user", ready: true }),
}));
vi.mock("@/lib/utils/date", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/date")>()),
  localDateISO: () => "2026-10-09",
  todayISO: () => "2026-10-09",
}));

const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
const data = (type: "E" | "I", group = "Food") => ({
  category: { id: 10, name: type === "E" ? "Groceries" : "Salary", type, group }, windowMonths: 12, displayCurrency: "USD", payeesLocked: false,
  months: [{ month: "2026-09", amount: 90, count: 2, budget: null, partial: false }, { month: "2026-10", amount: 100, count: 2, budget: null, partial: true }],
  hasBudget: false, topPayees: [], recent: [],
  stats: { thisMonth: 100, lastMonth: 90, sameMonthLastYear: 50, averageMonthly: 90, medianMonthly: 90, highestMonth: null, total: 190, transactionCount: 4, averageTransaction: 47, shareOfType: 0.2 },
});
let fetchMock: ReturnType<typeof vi.fn>;
async function renderPage(type: "E" | "I" = "E") {
  fetchMock = vi.fn(async (url: string) => (String(url).startsWith("/api/reports/category") ? json({ data: data(type) }) : json([])));
  vi.stubGlobal("fetch", fetchMock);
  const { default: Page } = await import("@/app/(app)/categories/[id]/page");
  render(<Page />);
  await screen.findByText("Monthly average");
}
const reportUrl = () => String(fetchMock.mock.calls.map((c) => c[0]).filter((u) => String(u).startsWith("/api/reports/category")).at(-1));

beforeEach(() => { H.search = ""; H.id = "10"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

vi.setConfig({ testTimeout: 30000 });
describe("category detail: toolbar range", () => {
  it("has no 6M / 12M / 24M controls, no 'Show N months' items, and keeps the time range control", { timeout: 30000 }, async () => {
    await renderPage();
    for (const l of ["6M", "12M", "24M"]) expect(screen.queryByText(l)).toBeNull();
    expect(screen.queryByText(/Show \d+ months/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/last \d+ months/i);
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });

  it.each([
    ["", "from=2026-10-01&to=2026-10-31"],
    ["range=this_quarter", "from=2026-10-01&to=2026-12-31"],
    ["range=this_year", "from=2026-01-01&to=2026-12-31"],
    ["range=custom&from=2026-03-05&to=2026-04-20", "from=2026-03-05&to=2026-04-20"],
    ["month=2026-08", "from=2026-08-01&to=2026-08-31"],
  ])("?%s queries %s (never months=)", async (search, expected) => {
    H.search = search;
    await renderPage();
    expect(reportUrl()).toBe(`/api/reports/category?categoryId=10&${expected}`);
  });

  it("?months= is ignored by the page", async () => {
    H.search = "months=24";
    await renderPage();
    expect(reportUrl()).not.toContain("months=");
  });
});

describe("category detail: type label in the top bar", () => {
  it.each([["E", "Expense"], ["I", "Income"]] as const)("%s shows '%s' once, in the header chip", async (t, label) => {
    await renderPage(t);
    const chip = await screen.findByTestId("category-type-chip");
    expect(chip.textContent).toContain(label);
    expect(chip.closest("header, [data-slot='page-header']") ?? chip.parentElement).toBeTruthy();
    expect(screen.getAllByText(label, { selector: "span, div" }).filter((e) => e.closest('[data-slot="category-detail-cards"]')).length).toBe(0);
    expect(document.querySelectorAll('[data-testid="category-type-chip"]').length).toBe(1);
  });
});
