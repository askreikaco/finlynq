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

describe("AppTabs has no categories tab (the label switch lives in More)", () => {
  it("renders no /categories link in either layout, so no label can differ there", async () => {
    const { container } = render(<AppTabs />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    expect(container.querySelector('a[href="/categories"]')).toBeNull();
    expect(container.textContent).not.toContain("Spending by category");
    expect(container.textContent).not.toContain("Categories");
  });

  it("the bar and the rail list the same five labels", async () => {
    const { container } = render(<AppTabs />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    const labels = [...container.querySelectorAll("a")].map((a) => a.textContent);
    expect(labels).toEqual(["Home", "Accounts", "Portfolio", "Transactions", "More", "Home", "Accounts", "Portfolio", "Transactions", "More"]);
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
