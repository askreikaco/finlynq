/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render as rtlRender, screen, cleanup, within, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";

const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/categories",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...r }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...r }, children),
}));

import { AppTabs } from "@/components/nav";
import { MoreMenu } from "@/components/more-menu";

let session: Record<string, unknown>;
let dev: boolean;
let announcements: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  session = { isAdmin: false };
  dev = false;
  announcements = [];
  fetchMock = vi.fn(async (url: string) => {
    const j = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
    if (url === "/api/auth/session") return j(session);
    if (url === "/api/settings/dev-mode") return j({ devMode: dev });
    if (url === "/api/announcements") return j(announcements);
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppTabs: /categories is a rail extra (desktop/tablet only), label follows the merged flag like More", () => {
  const catLink = (c: HTMLElement) => c.querySelector('nav[aria-label="Main navigation"] a[href="/categories"]');

  it("the bar has no /categories link", async () => {
    const { container } = render(<AppTabs />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    const bar = container.querySelector('nav[aria-label="Mobile navigation"]')!;
    expect(bar.querySelector('a[href="/categories"]')).toBeNull();
    const labels = [...bar.querySelectorAll("a")].map((a) => a.textContent);
    expect(labels).toEqual(["Home", "Accounts", "Portfolio", "Transactions", "More"]);
  });

  it("the rail labels /categories 'Spending by category' when the merged flag is off", async () => {
    const { container } = render(<AppTabs />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    expect(catLink(container)?.textContent).toBe("Spending by category");
  });

  it("the rail labels /categories 'Categories' when the merged flag is on", async () => {
    const { container } = render(<AppTabs categoriesMerged />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    expect(catLink(container)?.textContent).toBe("Categories");
  });
});

describe("MoreMenu with categoriesMerged", () => {
  it("shows 'Categories' for /categories row when categoriesMerged is true", async () => {
    render(<MoreMenu categoriesMerged={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));

    const moreRows = screen.getAllByTestId("more-row");
    const categoriesRow = moreRows.find((r) => r.getAttribute("href") === "/categories");
    expect(categoriesRow?.textContent).toContain("Categories");
    expect(categoriesRow?.textContent).not.toContain("Spending by category");
  });

  it("shows 'Spending by category' for /categories row when categoriesMerged is false", async () => {
    render(<MoreMenu categoriesMerged={false} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));

    const moreRows = screen.getAllByTestId("more-row");
    const categoriesRow = moreRows.find((r) => r.getAttribute("href") === "/categories");
    expect(categoriesRow?.textContent).toContain("Spending by category");
  });

  it("shows 'Spending by category' for /categories row when categoriesMerged is omitted", async () => {
    render(<MoreMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));

    const moreRows = screen.getAllByTestId("more-row");
    const categoriesRow = moreRows.find((r) => r.getAttribute("href") === "/categories");
    expect(categoriesRow?.textContent).toContain("Spending by category");
  });

  it("shows unchanged labels for other rows when categoriesMerged is true", async () => {
    render(<MoreMenu categoriesMerged={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));

    const moreRows = screen.getAllByTestId("more-row");
    expect(moreRows.some((r) => r.textContent?.includes("Budgets"))).toBe(true);
    expect(moreRows.some((r) => r.textContent?.includes("Settings"))).toBe(true);
  });

  it("does not include 'Spending by category' text when categoriesMerged is true", async () => {
    render(<MoreMenu categoriesMerged={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));

    // Make sure there's no text "Spending by category" anywhere
    expect(screen.queryByText("Spending by category")).toBeNull();
  });

  it("includes 'Spending by category' text when categoriesMerged is false", async () => {
    render(<MoreMenu categoriesMerged={false} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));

    // Make sure "Spending by category" appears exactly once (for the /categories link)
    const matches = screen.queryAllByText("Spending by category");
    expect(matches.length).toBe(1);
  });
});
