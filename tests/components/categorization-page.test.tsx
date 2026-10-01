/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

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
  fetchMock.mockImplementation(async (_u: string, init?: RequestInit) => {
    if (init?.method === "POST") return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => cats };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

import Page from "@/app/(app)/settings/categorization/page";

async function openForm() {
  render(<Page />);
  await screen.findByText("Rent");
  fireEvent.click(screen.getByRole("button", { name: /add$/i }));
  return screen.getByRole("button", { name: "Add Category" }).closest("form") as HTMLFormElement;
}

describe("categorization page", () => {
  it("add form has no visible labels; controls labelled via aria", async () => {
    const form = await openForm();
    expect(form.querySelectorAll("label").length).toBe(0);
    expect(within(form).getByRole("textbox", { name: "Category name" }).getAttribute("placeholder")).toBe("Category name");
    expect(within(form).getByRole("combobox", { name: "Group" }).getAttribute("placeholder")).toBe("Group");
    expect(within(form).getByRole("combobox", { name: "Type" })).toBeTruthy();
  });

  it("validation error shows under the name field", async () => {
    const form = await openForm();
    fireEvent.submit(form);
    expect(await screen.findByText("Name is required")).toBeTruthy();
  });

  it("group combobox lists, filters, adds new; new group is POSTed", async () => {
    const form = await openForm();
    const group = within(form).getByRole("combobox", { name: "Group" }) as HTMLInputElement;
    fireEvent.focus(group);
    const opts = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opts).toEqual(["No group", "Adjust", "Food", "Housing", "Salary"]);
    fireEvent.change(group, { target: { value: "ho" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["No group", "Housing", 'Add "ho"']);
    fireEvent.change(group, { target: { value: "Travel" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["No group", 'Add "Travel"']);
    fireEvent.click(screen.getByRole("option", { name: 'Add "Travel"' }));
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(within(form).getByRole("textbox", { name: "Category name" }), { target: { value: "Flights" } });
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(JSON.parse(post[1].body)).toEqual({ name: "Flights", type: "E", group: "Travel" });
  });

  it("keyboard: arrows + enter pick, escape closes", async () => {
    const form = await openForm();
    const group = within(form).getByRole("combobox", { name: "Group" }) as HTMLInputElement;
    fireEvent.focus(group);
    fireEvent.keyDown(group, { key: "ArrowDown" });
    fireEvent.keyDown(group, { key: "ArrowDown" });
    fireEvent.keyDown(group, { key: "ArrowUp" });
    fireEvent.keyDown(group, { key: "Enter" });
    expect(group.value).toBe("Adjust");
    fireEvent.focus(group);
    fireEvent.keyDown(group, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
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

  it("type select shows the label, not the code", async () => {
    const form = await openForm();
    const trigger = within(form).getByRole("combobox", { name: "Type" });
    expect(trigger.textContent).toContain("Expense");
    expect(trigger.textContent).not.toMatch(/^E$/);
  });
});
