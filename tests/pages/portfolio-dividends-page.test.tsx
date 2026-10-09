/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND", isLoading: false }) }));

import DividendsPage from "@/app/(app)/portfolio/dividends/page";

const GROUP = {
  bucket: "2026", label: "2026", amount: 1500000, currency: "VND", rowCount: 3, reinvestedCount: 1, withholdingCount: 1,
  byCurrency: { VND: { amount: 1500000, rowCount: 3, reinvestedCount: 1, withholdingCount: 1 } },
};
const OK = (groups: unknown[]) => ({
  success: true,
  data: {
    groups,
    totals: { amount: 1500000, rowCount: 3, byCurrency: { VND: 1500000 } },
    mode: "native",
    reportingCurrency: "VND",
  },
});

let urls: string[];
let payload: unknown;

beforeEach(() => {
  urls = [];
  payload = OK([GROUP]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      urls.push(u);
      if (u.includes("/api/portfolio/dividends")) return { ok: true, status: 200, json: async () => payload };
      return { ok: false, status: 404, json: async () => null };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dividend income page (report page, not a dialog)", () => {
  it("renders a PageHeader page with a back link to /portfolio", async () => {
    render(<DividendsPage />);
    await screen.findByRole("button", { name: "2026, 3 dividend rows" });
    const title = document.querySelector("[data-slot=page-header-title]") as HTMLElement;
    expect(title.textContent).toBe("Dividend income");
    expect((document.querySelector("[data-slot=back-button]") as HTMLAnchorElement).getAttribute("href")).toBe("/portfolio");
  });

  it("summary tile shows the native total and the dividend row count", async () => {
    render(<DividendsPage />);
    await screen.findByRole("button", { name: "2026, 3 dividend rows" });
    const grid = document.querySelector("[data-slot=metric-grid]") as HTMLElement;
    expect(within(grid).getByText("Total (VND)")).toBeTruthy();
    expect(within(grid).getByText("Dividend rows")).toBeTruthy();
    expect(within(grid).getByText("3")).toBeTruthy();
  });

  it("below md each group is a ListRow with counts as the subtitle and the amount on the right", async () => {
    render(<DividendsPage />);
    const row = await screen.findByRole("button", { name: "2026, 3 dividend rows" });
    expect(row.getAttribute("data-slot")).toBe("list-row");
    expect(within(row).getByText("3 rows · 1 reinvested · 1 withholding")).toBeTruthy();
    expect(within(row).getByText(`+${formatCurrency(1500000, "VND")}`)).toBeTruthy();
  });

  it("tapping a group opens a DetailSheet with the counts and per-currency totals", async () => {
    render(<DividendsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "2026, 3 dividend rows" }));
    const dlg = screen.getByRole("dialog");
    const dl = dlg.querySelector("[data-slot=detail-list]") as HTMLElement;
    const get = (label: string) => within(dl).getByText(label).parentElement!.querySelector("dd")!.textContent;
    expect(get("Dividend rows")).toBe("3");
    expect(get("Reinvested")).toBe("1");
    expect(get("Withholding")).toBe("1");
    expect(get("Total (VND)")).toContain("1,500,000");
  });

  it("filters open in a bottom sheet from the header Filters button", async () => {
    render(<DividendsPage />);
    await screen.findByRole("button", { name: "2026, 3 dividend rows" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText("Filter dividends")).toBeTruthy();
    expect(within(dlg).getByLabelText("Tax year")).toBeTruthy();
  });

  it("a group-by chip refetches with the new groupBy and keeps the native pivot", async () => {
    render(<DividendsPage />);
    await screen.findByRole("button", { name: "2026, 3 dividend rows" });
    const groupBy = screen.getAllByRole("group", { name: "Group by" })[0];
    fireEvent.click(within(groupBy).getByRole("button", { name: "Holding" }));
    await waitFor(() => expect(urls.some((u) => u.includes("groupBy=holding") && u.includes("pivot=1"))).toBe(true));
  });

  it("empty state explains the category rule and links to record a dividend", async () => {
    payload = OK([]);
    render(<DividendsPage />);
    await screen.findByText("No dividend income yet");
    expect(document.body.textContent).toContain("category named");
    expect(screen.getByRole("link", { name: "Record a dividend" }).getAttribute("href")).toBe("/portfolio/new?op=income-expense");
  });

  it("md+ table keeps a sticky header in a scroll box", async () => {
    render(<DividendsPage />);
    await screen.findByRole("button", { name: "2026, 3 dividend rows" });
    const head = document.querySelector("thead") as HTMLElement;
    expect(head.className).toContain("sticky");
    const container = head.closest("[data-slot=table-container]") as HTMLElement;
    expect(container.className).toMatch(/max-h-\[70dvh\]/);
    expect(container.className).toContain("overflow-y-auto");
  });
});
