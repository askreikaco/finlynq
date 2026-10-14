/**
 * @vitest-environment jsdom
 */
// Budgets merged into /categories: ONE row component for a group header and a category (rollup for the group), exactly
// the three budget metric cards (no Age of Money / Available to Budget / rollover), and /budgets redirects.
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const H = vi.hoisted(() => ({
  REPORT: {
    month: "2026-10", partial: true, windowMonths: ["2026-08", "2026-09", "2026-10"], total: 530, averageTotal: null, displayCurrency: "USD", type: "E",
    categories: [
      { id: 1, name: "Housing - Rent", group: "Housing", amount: 300, share: 0.566, average: null, change: null, budget: 400, trend: [250, 250, 300] },
      { id: 2, name: "Housing - Power", group: "Housing", amount: 100, share: 0.189, average: null, change: null, budget: 100, trend: [80, 100, 100] },
      { id: 3, name: "Coffee", group: "", amount: 130, share: 0.245, average: null, change: null, budget: null, trend: [100, 100, 130] },
    ],
  } as unknown,
  BUDGETS: [
    { id: 11, categoryId: 1, categoryName: "Housing - Rent", categoryGroup: "Housing", month: "2026-10", amount: 400, currency: "USD", rolloverAmount: 50 },
    { id: 12, categoryId: 2, categoryName: "Housing - Power", categoryGroup: "Housing", month: "2026-10", amount: 100, currency: "USD" },
  ] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("month=2026-10"),
  usePathname: () => "/categories",
}));
vi.mock("next/link", () => ({ default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children) }));
vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => "regular",
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "merge-test-user", ready: true }),
}));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return { PieChart: Wrap, Pie: Wrap, Cell: Leaf, ResponsiveContainer: Wrap, AreaChart: Wrap, Area: Leaf, Tooltip: Leaf, YAxis: Leaf };
});
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/lib/utils/date", async (orig) => ({ ...(await orig<typeof import("@/lib/utils/date")>()), localDateISO: () => "2026-10-14" }));
vi.mock("@/lib/data/use-cache-first", () => ({
  useCacheFirstJson: (url: string | null) => {
    if (!url) return { data: undefined, loading: false, error: false, reload: () => {} };
    if (url.startsWith("/api/reports/categories")) return { data: { data: H.REPORT }, loading: false, error: false, reload: () => {} };
    if (url.startsWith("/api/budgets/series")) {
      return { data: { series: [{ month: "2026-09", budget: 450, spent: 330 }, { month: "2026-10", budget: 500, spent: 400 }] }, loading: false, error: false, reload: () => {} };
    }
    if (url.startsWith("/api/budgets")) return { data: H.BUDGETS, loading: false, error: false, reload: () => {} };
    return { data: undefined, loading: false, error: false, reload: () => {} };
  },
}));
vi.mock("@/lib/data/local-write-queue", () => ({
  usePendingBudgets: () => ({ creates: [], edits: {}, deletes: {} }),
  isLocalWriteQueueActive: () => false,
  queueOfflineBudgetDelete: vi.fn(async () => false),
  discardQueuedCreate: vi.fn(async () => false),
}));

import CategoriesPageContent from "@/app/(app)/categories/_page-content";
import { REDIRECTS, NAV_REGISTRY } from "@/lib/nav-config";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");
const PAGE = "src/app/(app)/categories/_page-content.tsx";

afterEach(() => cleanup());

describe("shared CategoryRow", () => {
  it("source: group header and category both render through CategoryRow; the old bespoke row/header are gone", () => {
    const src = read(PAGE);
    expect(src).toContain('import { CategoryRow } from "./_components/category-row"');
    expect(src.match(/<CategoryRow\b/g)).toHaveLength(1); // one component, fed by rowFor for both kinds
    expect(src).toContain("rowFor({");
    expect(src).toMatch(/const groupRow[\s\S]*rowFor\(/);
    expect(src).toMatch(/const categoryRow[\s\S]*rowFor\(/);
    expect(src).not.toMatch(/function RowBody|function groupHeader/);
  });

  it("a group row and a category row both show dot, label, amount, change vs last month, chart and budget progress", () => {
    render(<CategoriesPageContent />);
    const list = document.querySelector('[data-slot="category-list"], [data-slot="section-card-body"] [data-slot="category-group"]')!.closest("section")!;
    // closed group (Housing) + ungrouped (Coffee) = 2 rows; open the group for its 2 children
    expect(within(list).getAllByText("Housing").length).toBeGreaterThan(0);
    fireEvent.click(within(list).getByText("Housing"));
    const rows = Array.from(list.querySelectorAll('[data-slot="category-row"]'));
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      for (const slot of ["category-dot", "category-label", "category-amount", "category-chart", "category-budget"]) {
        expect(r.querySelector(`[data-slot="${slot}"]`), slot).toBeTruthy();
      }
      expect(r.querySelector('[data-slot="category-delta"]')).toBeTruthy();
      expect(r.querySelector('[role="progressbar"]')).toBeTruthy();
    }
    // Name A-Z is the default sort: Coffee, then the Housing group, whose children are Power, Rent
    const [coffee, group, power, rent] = rows;
    // group = rollup of its children: 300 + 100 spent, 400 + 100 budget -> $100 left, +$50 (last month 350)
    expect(group.textContent).toContain("Housing");
    expect(group.querySelector('[data-slot="category-amount"]')!.textContent).toBe("$400.00");
    expect(group.querySelector('[data-slot="category-delta"]')!.textContent).toContain("+$50.00 (+14%)");
    expect(group.querySelector('[data-slot="category-budget"]')!.textContent).toContain("Left $100.00");
    expect(rent.textContent).toContain("Rent");
    expect(rent.querySelector('[data-slot="category-budget"]')!.textContent).toContain("Left $100.00");
    expect(power.querySelector('[data-slot="category-budget"]')!.textContent).toContain("Left $0.00");
    expect(coffee.querySelector('[data-slot="category-budget"]')!.textContent).toContain("No budget");
  });
});

describe("Edit mode and column alignment", () => {
  it("no row has an edit icon; the topbar Edit toggle makes category rows open the shared form (?edit=<id>)", () => {
    render(<CategoriesPageContent />);
    expect(screen.queryAllByRole("button", { name: /^Edit: / })).toHaveLength(0);
    expect(document.querySelectorAll("svg.lucide-pencil").length).toBe(0); // no pencil anywhere
    const toggle = screen.getByRole("button", { name: "Edit list" }); // the shared PageHeader bulkEdit button
    expect(toggle.closest('[data-slot="header-capsule"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add" }).getAttribute("href")).toBe("/categories?edit=new");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    const coffee = screen.getByRole("button", { name: "Edit: Coffee" });
    expect(coffee.hasAttribute("data-edit-row")).toBe(true);
    expect(screen.queryByRole("link", { name: /Coffee/ })).toBeNull();
  });

  it("child rows indent the name only: group and category rows share the right-hand value columns", () => {
    const src = read(PAGE);
    expect(src).toContain('py-3 pl-4 pr-11'); // = group trigger px-4 + chevron slot
    expect(src).not.toMatch(/ROW_LINK\} pl-8/);
    expect(read("src/app/(app)/categories/_components/category-row.tsx")).toContain('indent ? " pl-5"');
  });
});

describe("toolbar wiring", () => {
  it("range + month are ONE PageToolbar row with search; More (Filter inside) + Edit list + yellow Add are in the top bar", async () => {
    render(<CategoriesPageContent />);
    const bar = document.querySelector('[data-slot="page-header"]')!;
    // Order: [More][Edit list][yellow Add]; Filter is INSIDE More (bulk edit wins the slot), with Customize cards.
    expect(bar.querySelector('[aria-label="Filter"]')).toBeNull();
    expect(screen.getByRole("button", { name: /Edit list/i })).toBeTruthy();
    fireEvent.click(within(bar as HTMLElement).getByRole("button", { name: "More actions" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent?.trim());
    expect(items[0]).toBe("Filter");
    expect(items).toContain("Customize cards");
    expect(screen.getByLabelText("Time range")).toBeTruthy();
    expect(screen.getByTestId("month-label")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    // the page's own range / month row is gone: the old toolbar's month buttons do not exist
    expect(screen.queryByRole("button", { name: "Previous month" })).toBeTruthy(); // PageToolbar's MonthSwitcher
  });

  it("search narrows the list (the pie and totals stay the whole month)", async () => {
    render(<CategoriesPageContent />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "coff" } });
    await waitFor(() => expect(screen.queryByText("Housing")).toBeNull());
    expect(screen.getAllByText("Coffee").length).toBeGreaterThan(0);
    expect(screen.getByTestId("metric-total-budget").textContent).toContain("$500.00");
  });

  it("the categories filter config: Name (default A-Z) and Amount sorts, budget status filter", async () => {
    const { FILTER_CONFIGS, CATEGORY_SORTS, CATEGORY_FILTER_KEYS } = await import("@/lib/toolbar/list-configs");
    expect(CATEGORY_SORTS.map((o) => o.key)).toEqual(["name", "amount"]);
    expect(CATEGORY_FILTER_KEYS).toEqual(["budget"]);
    const f = FILTER_CONFIGS.categories.fields[0];
    expect(f.kind === "segment" && f.options.map((o) => o.value)).toEqual(["", "with", "none", "over"]);
    expect(FILTER_CONFIGS.categories.fallbackReturnTo).toBe("/categories");
  });
});

describe("metric cards", () => {
  it("are exactly Total Budget, Total Spent and Remaining; no Age of Money, Available to Budget or rollover anywhere", () => {
    render(<CategoriesPageContent />);
    const ids = Array.from(document.querySelectorAll('[data-testid^="metric-"]')).map((e) => e.getAttribute("data-testid"));
    expect(ids).toEqual(["metric-total-budget", "metric-total-spent", "metric-remaining"]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Total Budget");
    expect(text).toContain("Total Spent");
    expect(text).toContain("Remaining");
    expect(text).not.toMatch(/Age of Money|Available to Budget|rolled over|rollover/i);
    // totals come from the budgeted categories: 500 budget, 400 spent, 100 left
    expect(screen.getByTestId("metric-total-budget").textContent).toContain("$500.00");
    expect(screen.getByTestId("metric-total-spent").textContent).toContain("$400.00");
    expect(screen.getByTestId("metric-remaining").textContent).toContain("$100.00");
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });

  it("source: no Age of Money / Available to Budget / rollover / envelope in the page", () => {
    expect(read(PAGE)).not.toMatch(/Age of Money|age-of-money|Available to Budget|availableToBudget|rollover|Rolled over|envelope/i);
  });

  it("the card grid is the shared MetricGrid, 3 columns max", () => {
    expect(read(PAGE)).toContain("<MetricGrid metrics={metrics} columns={3} />");
  });
});

describe("/budgets is merged into /categories", () => {
  it("/budgets redirects to /categories (the redirect keeps the query string) and there is no budgets list page", () => {
    expect(REDIRECTS).toContainEqual({ source: "/budgets", destination: "/categories", permanent: false });
    expect(fs.existsSync(path.join(ROOT, "src/app/(app)/budgets/page.tsx"))).toBe(false);
  });

  it("the template and move-money form pages stay (their own forms); the budget form is the shared category form", () => {
    for (const p of ["templates/new", "templates/apply", "move-money"]) {
      expect(fs.existsSync(path.join(ROOT, `src/app/(app)/budgets/${p}/page.tsx`)), p).toBe(true);
    }
  });

  it("no nav surface (sidebar, More, tab bar, rail) lists Budgets", () => {
    const budgets = NAV_REGISTRY.filter((e) => e.path === "/budgets");
    expect(budgets.every((e) => e.surfaces.length === 0 && !e.rail)).toBe(true);
    expect(NAV_REGISTRY.filter((e) => e.surfaces.length > 0).map((e) => e.label)).not.toContain("Budgets");
  });
});
