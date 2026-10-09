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

import RealizedGainsPage from "@/app/(app)/portfolio/realized-gains/page";

const ROWS = [
  {
    closureId: 1, closeDate: "2026-03-10", openDate: "2025-01-02", holdingId: 1, holdingName: "AAPL",
    accountId: 1, accountName: "IBKR", qtyClosed: 10, proceedsPerShare: 150, costPerShare: 100,
    realizedGain: 500, currency: "USD", daysHeld: 432, term: "long", closeKind: "sell",
    realizedGainInBase: 12500000, baseCurrency: "VND",
  },
  {
    closureId: 2, closeDate: "2026-02-01", openDate: "2025-12-01", holdingId: 2, holdingName: "VNM",
    accountId: 2, accountName: "TCBS", qtyClosed: 100, proceedsPerShare: 70, costPerShare: 90,
    realizedGain: -2000, currency: "VND", daysHeld: 62, term: "short", closeKind: "short_close",
    realizedGainInBase: -2000, baseCurrency: "VND",
  },
];

const OK = (rows: unknown[]) => ({
  success: true,
  data: {
    rows,
    totals: { realizedGain: 0, qtyClosed: 0, rowCount: rows.length, byCurrency: {} },
    totalRealizedGainInBase: rows.length ? 12498000 : undefined,
  },
});

let fetchUrls: string[];
let payload: unknown;

beforeEach(() => {
  fetchUrls = [];
  payload = OK(ROWS);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      fetchUrls.push(u);
      if (u.includes("/api/portfolio/realized-gains")) return { ok: true, status: 200, json: async () => payload };
      return { ok: false, status: 404, json: async () => null };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Realized gains page (report page, not a dialog)", () => {
  it("renders a PageHeader page with a back link to /portfolio and the period subtitle", async () => {
    render(<RealizedGainsPage />);
    await screen.findByRole("button", { name: "AAPL, closed 2026-03-10" });
    const title = document.querySelector("[data-slot=page-header-title]") as HTMLElement;
    expect(title.textContent).toBe("Realized gains");
    expect(document.querySelector("[data-slot=page-header-subtitle]")!.textContent).toContain("All terms");
    const back = document.querySelector("[data-slot=back-button]") as HTMLAnchorElement;
    expect(back.getAttribute("href")).toBe("/portfolio");
  });

  it("summary tiles: realized total in the display currency and the closed-lot count", async () => {
    render(<RealizedGainsPage />);
    await screen.findByRole("button", { name: "AAPL, closed 2026-03-10" });
    const grid = document.querySelector("[data-slot=metric-grid]") as HTMLElement;
    expect(within(grid).getByText("Closed lots")).toBeTruthy();
    expect(within(grid).getByText("2")).toBeTruthy();
    expect(within(grid).getByText(/Realized \(USD\)/)).toBeTruthy();
  });

  it("below md lots are ListRows grouped by close month with a signed percent in the gain tone", async () => {
    render(<RealizedGainsPage />);
    const aapl = await screen.findByRole("button", { name: "AAPL, closed 2026-03-10" });
    expect(aapl.getAttribute("data-slot")).toBe("list-row");
    expect(within(aapl).getByText(`+${formatCurrency(500, "USD")}`)).toBeTruthy();
    const pct = within(aapl).getByText("+50.00%");
    expect(pct.getAttribute("data-tone")).toBe("pos");
    const vnm = screen.getByRole("button", { name: "VNM, closed 2026-02-01" });
    expect(within(vnm).getByText("-22.22%").getAttribute("data-tone")).toBe("neg");
    // two month sections (March, February)
    const labels = document.querySelectorAll("[data-slot=section-label]");
    expect(labels.length).toBe(2);
  });

  it("tapping a lot opens a DetailSheet with every field the row leaves out", async () => {
    render(<RealizedGainsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "AAPL, closed 2026-03-10" }));
    const dlg = screen.getByRole("dialog");
    const dl = dlg.querySelector("[data-slot=detail-list]") as HTMLElement;
    const get = (label: string) => within(dl).getByText(label).parentElement!.querySelector("dd")!.textContent;
    expect(get("Opened")).toBe("2025-01-02");
    expect(get("Days held")).toBe("432");
    expect(get("Term")).toBe("Long-term");
    expect(get("Account")).toBe("IBKR");
    expect(get("Cost / share")).toBe(formatCurrency(100, "USD"));
    expect(get("Proceeds / share")).toBe(formatCurrency(150, "USD"));
    expect(get("Realized (VND)")).toContain("12,500,000");
  });

  it("filters open in a bottom sheet from the header Filters button (not an inline dialog)", async () => {
    render(<RealizedGainsPage />);
    await screen.findByRole("button", { name: "AAPL, closed 2026-03-10" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText("Filter realized gains")).toBeTruthy();
    expect(within(dlg).getByRole("group", { name: "Tax year" })).toBeTruthy();
  });

  it("a tax-year chip refetches with taxYear set (filters drive the same API call)", async () => {
    render(<RealizedGainsPage />);
    await screen.findByRole("button", { name: "AAPL, closed 2026-03-10" });
    const yearGroup = screen.getAllByRole("group", { name: "Tax year" })[0];
    fireEvent.click(within(yearGroup).getByRole("button", { name: "2025" }));
    await waitFor(() => expect(fetchUrls.some((u) => u.includes("taxYear=2025"))).toBe(true));
  });

  it("empty state explains the empty report and links to record a sale", async () => {
    payload = OK([]);
    render(<RealizedGainsPage />);
    await screen.findByText("No closed lots yet");
    expect(document.body.textContent).toContain("lot backfill admin script");
    const link = screen.getByRole("link", { name: "Record a sale" });
    expect(link.getAttribute("href")).toBe("/portfolio/new?op=sell");
  });

  it("md+ table has a sticky header inside its own scroll box", async () => {
    render(<RealizedGainsPage />);
    await screen.findByRole("button", { name: "AAPL, closed 2026-03-10" });
    const head = document.querySelector("thead") as HTMLElement;
    expect(head.className).toContain("sticky");
    expect(head.className).toContain("top-0");
    const container = head.closest("[data-slot=table-container]") as HTMLElement;
    expect(container.className).toContain("overflow-y-auto");
    expect(container.className).toMatch(/max-h-\[70dvh\]/);
  });
});
