/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";

const push = vi.fn();
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/portfolio/new",
}));

const INVESTMENT = [
  { id: 1, name: "Broker", currency: "USD", isInvestment: true },
  { id: 2, name: "Broker 2", currency: "USD", isInvestment: true },
];
const BANK = [{ id: 3, name: "Chequing", currency: "USD", isInvestment: false }];
const HOLDINGS = [
  { id: 10, accountId: 1, name: "VTI", symbol: "VTI", currency: "USD", isCash: false, currentShares: 5 },
  { id: 11, accountId: 1, name: "Cash USD", symbol: null, currency: "USD", isCash: true },
  { id: 12, accountId: 2, name: "Cash USD", symbol: null, currency: "USD", isCash: true },
];
vi.mock("@/lib/hooks/usePortfolioFormData", () => ({
  usePortfolioFormData: () => ({
    accounts: [...INVESTMENT, ...BANK],
    holdings: HOLDINGS,
    categories: [],
    loading: false,
    loadError: null,
    editData: null,
  }),
}));

import PortfolioNewPage from "@/app/(app)/portfolio/new/page";
import * as OpRouteModule from "@/app/(app)/portfolio/new/[op]/page";
import { OpRoute } from "@/components/portfolio/forms/op-route";

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  search = "";
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("level 1: /portfolio/new operation list", () => {
  it("renders three grouped inset lists with a header each", () => {
    const { container } = render(<PortfolioNewPage />);
    const headers = [...container.querySelectorAll("[data-slot='section-label']")].map((n) => n.textContent);
    expect(headers).toEqual(["Trades", "Transfers", "Income and other"]);
    const groups = container.querySelectorAll("div.divide-y");
    expect(groups.length).toBe(3);
  });

  it("lists all eight operations as links to their level-2 pages", () => {
    const { container } = render(<PortfolioNewPage />);
    const hrefs = [...container.querySelectorAll("section a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/portfolio/new/buy",
      "/portfolio/new/sell",
      "/portfolio/new/swap",
      "/portfolio/new/in-kind-transfer",
      "/portfolio/new/deposit",
      "/portfolio/new/withdrawal",
      "/portfolio/new/income-expense",
      "/portfolio/new/fx-conversion",
    ]);
  });

  it("uses one chevron per row, no card grid and no 'Open' text", () => {
    const { container } = render(<PortfolioNewPage />);
    const rows = container.querySelectorAll("section a");
    expect(rows.length).toBe(8);
    for (const row of rows) {
      expect(row.querySelectorAll("svg").length).toBe(2); // leading icon + chevron
      expect(row.className).toMatch(/min-h-14/);
    }
    expect(container.querySelector(".grid")).toBeNull();
    expect(container.querySelector("[data-slot='card']")).toBeNull();
    expect(screen.queryByText(/Open/)).toBeNull();
  });

  it("redirects a legacy ?op= link to the level-2 page and keeps the other params", async () => {
    search = "op=transfer&editId=42&account=3";
    render(<PortfolioNewPage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/portfolio/new/in-kind-transfer?editId=42&account=3"),
    );
  });

  it("does not redirect an unknown ?op= value", () => {
    search = "op=nope";
    render(<PortfolioNewPage />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("Buy")).toBeTruthy();
  });
});

describe("level 2: each operation page renders its form", () => {
  const cases: [string, string][] = [
    ["buy", "Buy"],
    ["sell", "Sell"],
    ["swap", "Swap"],
    ["in-kind-transfer", "In-kind transfer"],
    ["income-expense", "Income / expense"],
    ["fx-conversion", "FX conversion"],
    ["deposit", "Brokerage deposit"],
    ["withdrawal", "Brokerage withdrawal"],
  ];

  it("[op] route has one static param per operation slug and rejects other slugs", () => {
    expect(OpRouteModule.dynamicParams).toBe(false);
    expect(OpRouteModule.generateStaticParams().map((p) => p.op)).toEqual([
      "buy",
      "sell",
      "swap",
      "in-kind-transfer",
      "deposit",
      "withdrawal",
      "income-expense",
      "fx-conversion",
    ]);
  });

  it.each(cases)("%s page has a glass bar with a Save button and no card chrome", (slug, title) => {
    const { container } = render(<OpRoute slug={slug} />);
    expect(container.querySelector("[data-slot='page-header']")).not.toBeNull();
    expect(container.querySelector("[data-slot='back-button']")?.getAttribute("href")).toBe("/portfolio/new");
    expect(container.querySelector("[data-slot='card']")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe(title);
    expect(container.querySelector("button[type='submit']")).not.toBeNull();
  });

  it("Sell validates before any request when the holding is missing", async () => {
    search = "account=1";
    render(<OpRoute slug="sell" />);
    // Account 1 is seeded from ?account=; pick nothing else: the form then reports the
    // missing holding instead of posting, which proves validation runs before any request.
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect((await screen.findAllByText("Pick a holding")).length).toBeGreaterThan(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("static: operation page sources", () => {
  it("[op]/page.tsx renders OpRoute, and OpRoute wraps the form in Suspense with no inline size classes", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/portfolio/new/[op]/page.tsx"), "utf8");
    expect(page).toContain("<OpRoute");
    expect(page).not.toMatch(/text-\[\d+px\]/);
    const route = fs.readFileSync(path.join(process.cwd(), "src/components/portfolio/forms/op-route.tsx"), "utf8");
    expect(route).toContain("<Suspense");
    expect(route).not.toMatch(/text-\[\d+px\]/);
  });

  it("no operation form imports the Card primitives or keeps a Cancel button", () => {
    const forms = fs.readdirSync(path.join(process.cwd(), "src/components/portfolio/forms"));
    for (const f of forms.filter((n) => n.endsWith("Form.tsx"))) {
      const src = fs.readFileSync(path.join(process.cwd(), "src/components/portfolio/forms", f), "utf8");
      expect(src, f).not.toMatch(/from "@\/components\/ui\/card"/);
      expect(src, f).not.toMatch(/>\s*Cancel\s*</);
      expect(src, f).toMatch(/safeReturnHref\(searchParams\.get\("returnTo"\)\)/);
      expect(src, f).not.toMatch(/router\.push\("\/transactions"\)/);
    }
  });
});
