/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// /settings/categorization is the legacy category screen. Add and rename are
// full pages shared with the merged hub (/categories/new, /categories/[id]/edit);
// this screen only lists categories and links to those pages.

const CATS = [
  { id: 1, type: "I", group: "Salary", name: "Paycheck", note: "" },
  { id: 2, type: "E", group: "Housing", name: "Rent", note: "" },
  { id: 3, type: "E", group: "", name: "Misc", note: "" },
  { id: 4, type: "E", group: "Food", name: "Groceries", note: "" },
  { id: 5, type: "R", group: "Adjust", name: "Fix", note: "" },
];
let cats = CATS;
const fetchMock = vi.fn();

beforeEach(() => {
  cats = CATS;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => cats }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

import Page from "@/app/(app)/settings/categorization/page";

describe("categorization page (legacy screen)", () => {
  it("Add links to /categories/new with returnTo back to this page; no inline form", async () => {
    render(<Page />);
    await screen.findByText("Rent");
    const add = screen.getByRole("link", { name: /add$/i });
    expect(add.getAttribute("href")).toBe("/categories/new?returnTo=%2Fsettings%2Fcategorization");
    expect(screen.queryByLabelText("Category name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Category" })).toBeNull();
  });

  it("Edit links to /categories/[id]/edit with returnTo back to this page", async () => {
    render(<Page />);
    await screen.findByText("Rent");
    const hrefs = screen.getAllByRole("link", { name: "Edit category" }).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/categories/2/edit?returnTo=%2Fsettings%2Fcategorization");
  });

  it("renders type sections in order without type badges", async () => {
    render(<Page />);
    await screen.findByText("Rent");
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(heads).toEqual(["Expense", "Income", "Reconciliation"]);
    const exp = screen.getByTestId("type-section-E");
    // ungrouped first, then groups A-Z
    const order = Array.from(exp.querySelectorAll("h4, span.text-sm")).map((e) => e.textContent);
    expect(order).toEqual(["Misc", "Food", "Groceries", "Housing", "Rent"]);
    // no per-row badge text: "Expense" appears only as the section header
    expect(screen.getAllByText("Expense").length).toBe(1);
    expect(screen.getAllByText("Income").length).toBe(1);
  });

  it("hides empty type sections", async () => {
    cats = CATS.filter((c) => c.type === "E");
    render(<Page />);
    await screen.findByText("Rent");
    expect(screen.queryByTestId("type-section-I")).toBeNull();
    expect(screen.queryByTestId("type-section-R")).toBeNull();
  });
});
