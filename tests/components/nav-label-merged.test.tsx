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
  usePathname: () => "/categories",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...r }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...r }, children),
}));

import { Nav } from "@/components/nav";
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

describe("Nav with categoriesMerged", () => {
  it("shows 'Categories' for /categories link when categoriesMerged is true", async () => {
    const { container } = render(<Nav categoriesMerged={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/session"));

    // Find the link with href="/categories"
    const categoriesLink = container.querySelector('a[href="/categories"]');
    expect(categoriesLink).toBeTruthy();
    expect(categoriesLink?.textContent).toContain("Categories");
  });

  it("shows 'Spending by category' for /categories link when categoriesMerged is false", async () => {
    const { container } = render(<Nav categoriesMerged={false} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/session"));

    // Find the link with href="/categories"
    const categoriesLink = container.querySelector('a[href="/categories"]');
    expect(categoriesLink).toBeTruthy();
    expect(categoriesLink?.textContent).toContain("Spending by category");
  });

  it("shows 'Spending by category' for /categories link when categoriesMerged is omitted", async () => {
    const { container } = render(<Nav />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/session"));

    // Find the link with href="/categories"
    const categoriesLink = container.querySelector('a[href="/categories"]');
    expect(categoriesLink).toBeTruthy();
    expect(categoriesLink?.textContent).toContain("Spending by category");
  });

  it("shows unchanged labels for other links when categoriesMerged is true", async () => {
    const { container } = render(<Nav categoriesMerged={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/session"));

    // Check that other links are unchanged
    const dashboardLink = container.querySelector('a[href="/dashboard"]');
    expect(dashboardLink?.textContent).toContain("Home");

    const budgetsLink = container.querySelector('a[href="/budgets"]');
    expect(budgetsLink?.textContent).toContain("Budgets");
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
    expect(matches.length).toBeGreaterThan(0);
  });
});
