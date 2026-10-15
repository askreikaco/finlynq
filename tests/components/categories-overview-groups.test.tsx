/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/categories",
}));

vi.mock("@/components/sparkline", () => ({
  Sparkline: () => <div data-testid="sparkline" />,
}));

const OVERVIEW = {
  data: {
    total: 1500,
    averageTotal: 1200,
    partial: false,
    displayCurrency: "USD",
    type: "E",
    windowMonths: ["2026-01", "2026-02", "2026-03"],
    categories: [
      { id: 1, name: "Housing - Rent", group: "Housing", amount: 600, average: 600, budget: 700, share: 0.4, trend: [600, 600, 600], change: 0 },
      { id: 2, name: "Housing - Utilities", group: "Housing", amount: 200, average: 100, budget: null, share: 0.133, trend: [100, 100, 200], change: 1 },
      { id: 3, name: "Food", group: "Lifestyle", amount: 500, average: 450, budget: null, share: 0.333, trend: [400, 450, 500], change: 0.111 },
      { id: 4, name: "Health", group: "", amount: 200, average: null, budget: null, share: 0.133, trend: [0, 0, 200], change: null },
    ],
  },
};

let mockType = "E";
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(mockType === "I" ? "type=I" : ""),
  usePathname: () => "/categories",
}));

const fetchMock = vi.fn();

beforeEach(() => {
  mockType = "E";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    url.includes("/api/reports/categories") ? { ok: true, json: async () => OVERVIEW } : { ok: false, json: async () => ({}) },
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import CategoriesPageContent from "@/app/(app)/categories/_page-content";

async function renderPage() {
  render(<CategoriesPageContent />);
  await waitFor(() => expect(header(/^Housing/)).toBeTruthy(), { timeout: 5000 });
}

// A group row has its own chevron button (aria-expanded, "Expand <group>" / "Collapse <group>"): the ONLY expand control.
const header = (name: RegExp) => {
  const group = name.source.replace(/^\^/, "");
  return screen.getByRole("button", { name: new RegExp(`^(Expand|Collapse) ${group}$`) });
};
// The group row body is a link that selects the group (its own detail route below wide).
const groupRow = (name: RegExp) => screen.getByRole("link", { name });

describe("By category: collapsible groups (accordion)", () => {
  it("shows one collapsed header per group and ungrouped categories as plain links", async () => {
    await renderPage();
    expect(header(/^Housing/).getAttribute("aria-expanded")).toBe("false");
    expect(header(/^Lifestyle/).getAttribute("aria-expanded")).toBe("false");
    // Children are not rendered until the group opens.
    expect(screen.queryByText("Rent")).toBeNull();
    expect(screen.queryByText("Food")).toBeNull();
    // Ungrouped Health is its own top-level row and links straight to its detail page.
    expect(screen.getByRole("link", { name: /Health/ }).getAttribute("href")).toBe("/categories/4");
    expect(screen.queryByRole("link", { name: /Health/ })?.querySelector("svg.lucide-chevron-right")).toBeNull();
  });

  it("group header shows the summed amount and count", async () => {
    await renderPage();
    const housing = groupRow(/^Housing/);
    expect(housing.textContent).toContain("$800");
    expect(housing.textContent).toContain("2"); // category count
    expect(housing.getAttribute("href")).toBe("/categories/g-E-housing");
  });

  it("expanding a group shows its categories with the group prefix removed; several may be open", async () => {
    await renderPage();
    fireEvent.click(header(/^Housing/));
    await waitFor(() => expect(header(/^Housing/).getAttribute("aria-expanded")).toBe("true"));
    expect(screen.getByText("Rent")).toBeTruthy();
    expect(screen.getByText("Utilities")).toBeTruthy();
    expect(screen.queryByText("Housing - Rent")).toBeNull();
    expect(screen.getByRole("link", { name: /Rent/ }).getAttribute("href")).toBe("/categories/1");

    fireEvent.click(header(/^Lifestyle/));
    await waitFor(() => expect(screen.getByText("Food")).toBeTruthy());
    expect(header(/^Housing/).getAttribute("aria-expanded")).toBe("true");
    expect(header(/^Lifestyle/).getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(header(/^Housing/));
    await waitFor(() => expect(screen.queryByText("Rent")).toBeNull());
    expect(screen.getByText("Food")).toBeTruthy();
  });

  it("does not render a back control or breadcrumb", async () => {
    await renderPage();
    fireEvent.click(header(/^Housing/));
    await waitFor(() => expect(screen.getByText("Rent")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /back to all categories/i })).toBeNull();
  });
});

describe("parent rows select; only the chevron expands", () => {
  it("clicking a group row body does not expand it", async () => {
    await renderPage();
    fireEvent.click(groupRow(/^Housing/));
    expect(header(/^Housing/).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Rent")).toBeNull();
  });
});

describe("hero: pie instead of progress bar", () => {
  it("renders a labelled pie and no stacked progress bar", async () => {
    await renderPage();
    const pie = screen.getByRole("img", { name: /top Housing 53%/ });
    expect(pie.querySelector("svg")).toBeTruthy();
    expect(screen.queryByLabelText(/Where your .* went/)).toBeNull();
  });

  it("a legend item expands and reveals its group", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Lifestyle 33%$/ }));
    await waitFor(() => expect(header(/^Lifestyle/).getAttribute("aria-expanded")).toBe("true"));
    expect(screen.getByText("Food")).toBeTruthy();
  });

});

describe("resets", () => {
  it("switching to Income collapses every group", async () => {
    await renderPage();
    fireEvent.click(header(/^Housing/));
    await waitFor(() => expect(screen.getByText("Rent")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Income" }));
    await waitFor(() => expect(header(/^Housing/).getAttribute("aria-expanded")).toBe("false"));
    expect(screen.queryByText("Rent")).toBeNull();
  });
});
