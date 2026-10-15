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
  SIZE: { v: "regular" as string },
  SELECT: undefined as unknown as ReturnType<typeof import("vitest").vi.fn>,
  FETCHED: [] as string[],
  INCOME: {
    month: "2026-10", partial: true, windowMonths: ["2026-08", "2026-09", "2026-10"], total: 900, averageTotal: null, displayCurrency: "USD", type: "I",
    categories: [{ id: 7, name: "Salary", group: "", amount: 900, share: 1, average: null, change: null, budget: null, trend: [900, 900, 900] }],
  } as unknown,
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
  useAppSizeClass: () => H.SIZE.v,
}));
vi.mock("@/components/mobile/list-detail-layout", async (orig) => ({
  ...(await orig<typeof import("@/components/mobile/list-detail-layout")>()),
  useListDetail: () => ({
    split: H.SIZE.v === "wide", sel: { kind: "none" }, selectedId: null, isNew: false,
    select: H.SELECT, selectNew: vi.fn(), clear: vi.fn(), replaceWith: vi.fn(),
  }),
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
    H.FETCHED.push(url);
    if (url.startsWith("/api/reports/categories")) return url.includes("type=I") ? { data: { data: H.INCOME }, loading: false, error: false, reload: () => {} } : { data: { data: H.REPORT }, loading: false, error: false, reload: () => {} };
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

H.SELECT = vi.fn();
afterEach(() => { cleanup(); H.SIZE.v = "regular"; H.FETCHED.length = 0; H.SELECT.mockClear(); });

describe("shared CategoryRow", () => {
  it("source: group header and category both render through CategoryRow; the old bespoke row/header are gone", () => {
    const src = read(PAGE);
    expect(src).toContain('import { CategoryRow, type CategoryRowProps } from "./_components/category-row"');
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
    // single rows reserve the chevron slot where the group trigger has its accordion chevron, so the value columns line up
    expect(src).toContain('chevron: "reserve"');
    expect(src).toContain("embedded: true"); // the group row sits inside the accordion trigger
    expect(read("src/components/mobile/list-row.tsx")).toContain('indent && "pl-5"');
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
    // Filter first, then the budget tools, then Customize cards.
    expect(items).toEqual(["Filter", "Copy last month", "Save template", "Apply template", "Rules", "Move money", "Customize cards"]);
    const menu = await screen.findAllByRole("menuitem");
    const href = (label: string) => menu.find((i) => i.textContent?.trim() === label)?.closest("a")?.getAttribute("href");
    expect(href("Save template")).toContain("/budgets/templates/new?month=2026-10");
    expect(href("Apply template")).toContain("/budgets/templates/apply?month=2026-10");
    expect(href("Rules")).toBe("/settings/rules");
    expect(href("Move money")).toContain("/budgets/move-money?month=2026-10");
    // the small buttons row under the metric cards is gone
    expect(document.querySelector('[data-slot="budget-tools"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy last month" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Move money" })).toBeNull();
    // the cached cards have an icon-only Refresh in the page toolbar
    expect(within(screen.getByTestId("page-toolbar")).getByRole("button", { name: "Refresh" })).toBeTruthy();
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

describe("budget tools in More", () => {
  it("Copy last month is a More item that runs the copy; Save template and Move money need budgets", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<CategoriesPageContent />);
    const bar = document.querySelector('[data-slot="page-header"]')!;
    fireEvent.click(within(bar as HTMLElement).getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Copy last month/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/budgets?month=2026-09"));
    await waitFor(() => expect(screen.getByText("No budgets last month.")).toBeTruthy());
    vi.unstubAllGlobals();
  });

  it("source: the tools row under the cards is deleted; the page hands the items to PageHeader overflow", () => {
    const src = read(PAGE);
    expect(src).not.toContain("budget-tools");
    expect(src).not.toContain("{budgetTools}");
    expect(src).toContain("overflow={isIncome && !twoCol ? undefined : overflow}");
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

describe("Spending + Income in two columns (regular+), tabs on phones", () => {
  it("regular: Spending left and Income right, each with its heading, pie card and list; no Spending / Income toggle", () => {
    render(<CategoriesPageContent />);
    const cols = Array.from(document.querySelectorAll('[data-slot="categories-column"]'));
    expect(cols.map((c) => c.getAttribute("data-type"))).toEqual(["E", "I"]);
    const [sp, inc] = cols;
    expect(within(sp as HTMLElement).getByText("Spending")).toBeTruthy();
    expect(sp.querySelector('[data-slot="categories-column-label"]')!.textContent).toContain("$530.00");
    expect(inc.querySelector('[data-slot="categories-column-label"]')!.textContent).toContain("Income");
    expect(inc.querySelector('[data-slot="categories-column-label"]')!.textContent).toContain("$900.00");
    expect(within(sp as HTMLElement).getByText("Coffee")).toBeTruthy();
    expect(within(inc as HTMLElement).getByText("Salary")).toBeTruthy();
    expect(within(inc as HTMLElement).queryByText("Coffee")).toBeNull();
    expect(sp.querySelectorAll('[data-slot="section-card"]')).toHaveLength(2); // share + categories
    expect(inc.querySelectorAll('[data-slot="section-card"]')).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: "Spending" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Income" })).toBeNull();
    // metric cards stay the three spending cards, full width above the columns
    expect(Array.from(document.querySelectorAll('[data-testid^="metric-"]'))).toHaveLength(3);
    expect(document.querySelector('[data-slot="categories-columns"]')!.className).toContain("grid-cols-2");
  });

  it("both types are fetched through the cache-first hook at once (no extra fetch on switching)", () => {
    render(<CategoriesPageContent />);
    expect(H.FETCHED.some((u) => u.includes("/api/reports/categories") && u.includes("type=E"))).toBe(true);
    expect(H.FETCHED.some((u) => u.includes("/api/reports/categories") && u.includes("type=I"))).toBe(true);
  });

  it("compact (phone): the Spending / Income tabs stay and ONE list shows; both types are still loaded", () => {
    H.SIZE.v = "compact";
    render(<CategoriesPageContent />);
    expect(screen.getByRole("tab", { name: "Spending" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Income" })).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="categories-column"]')).toHaveLength(0);
    expect(screen.getAllByText("Coffee").length).toBeGreaterThan(0);
    expect(screen.queryByText("Salary")).toBeNull();
    expect(H.FETCHED.some((u) => u.includes("type=I"))).toBe(true);
  });

  it("wide: the split pane is a third column; a row tap selects into it (no navigation) and ?edit= is not a sheet", () => {
    H.SIZE.v = "wide";
    render(<CategoriesPageContent />);
    expect(document.querySelector('[data-slot="list-detail"]')).toBeTruthy();
    expect(screen.getByTestId("list-detail-pane")).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="categories-column"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole("link", { name: /Coffee/ }));
    expect(H.SELECT).toHaveBeenCalledWith(3);
    expect(screen.getByRole("link", { name: "Add" })).toBeTruthy();
  });

  it("source: pane wiring is one block (paneBody) using the shared CategoryBudgetForm", () => {
    const src = read(PAGE);
    expect(src).toContain("ListDetailLayout");
    expect(src.match(/pane=\{paneBody\}/g)).toHaveLength(1);
    expect(src.match(/<CategoryBudgetForm\b/g)).toHaveLength(2); // pane + below-wide sheet
  });
});
