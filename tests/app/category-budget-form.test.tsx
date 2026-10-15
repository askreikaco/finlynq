/**
 * @vitest-environment jsdom
 */
// ONE category + budget form: Add = empty, Edit = the same component prefilled. It creates / updates the category
// and sets / clears its budget. /budgets/new and /settings/categorization are gone (redirects to /categories).
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CategoryBudgetForm } from "@/app/(app)/categories/_components/category-budget-form";
import { REDIRECTS, NAV_REGISTRY } from "@/lib/nav-config";

const ROOT = process.cwd();
const CATS = [
  { id: 1, type: "E", group: "Housing", name: "Rent" },
  { id: 2, type: "E", group: "", name: "Coffee" },
];
const BUDGET = { id: 11, categoryId: 1, categoryName: "Rent", categoryGroup: "Housing", month: "2026-10", amount: 400, currency: "USD" };

type Call = { url: string; method: string; body: unknown };
let calls: Call[];
function stubFetch(handler?: (c: Call) => Response | undefined) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const c = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    return handler?.(c) ?? new Response(JSON.stringify(c.url === "/api/categories" && c.method === "POST" ? { id: 9 } : {}), { status: c.method === "POST" && c.url === "/api/categories" ? 201 : 200 });
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const base = { categories: CATS, budgets: [BUDGET], month: "2026-10", currency: "USD", onClearBudget: vi.fn(async () => true) };

describe("CategoryBudgetForm", () => {
  it("Add: empty form; creates the category, then its budget", async () => {
    stubFetch();
    const onSaved = vi.fn();
    render(<CategoryBudgetForm {...base} category={null} onSaved={onSaved} onCancel={vi.fn()} onDeleted={vi.fn()} />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Budget") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gym" } });
    fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined));
    expect(calls.map((c) => [c.method, c.url])).toEqual([["POST", "/api/categories"], ["POST", "/api/budgets"]]);
    expect(calls[0].body).toEqual({ name: "Gym", type: "E", group: "" });
    expect(calls[1].body).toEqual({ categoryId: 9, month: "2026-10", amount: 50, currency: "USD" });
  });

  it("Edit: the same form prefilled with name, group and budget; saves both", async () => {
    stubFetch();
    const onSaved = vi.fn();
    render(<CategoryBudgetForm {...base} category={CATS[0]} onSaved={onSaved} onCancel={vi.fn()} onDeleted={vi.fn()} />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Rent");
    expect((screen.getByLabelText("Budget") as HTMLInputElement).value).toBe("400");
    expect(screen.queryByLabelText("Type")).toBeNull();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rent flat" } });
    fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "450" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({ method: "PUT", url: "/api/categories", body: { id: 1, name: "Rent flat", group: "Housing" } });
    expect(calls[1]).toMatchObject({ method: "POST", url: "/api/budgets", body: { categoryId: 1, amount: 450 } });
  });

  it("Edit: a blank budget clears the existing one", async () => {
    stubFetch();
    const onClearBudget = vi.fn(async () => true);
    const onSaved = vi.fn();
    render(<CategoryBudgetForm {...base} onClearBudget={onClearBudget} category={CATS[0]} onSaved={onSaved} onCancel={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClearBudget).toHaveBeenCalledWith(BUDGET);
    expect(calls.some((c) => c.url === "/api/budgets")).toBe(false);
  });

  it("Edit: Delete asks to confirm, then deletes the category", async () => {
    stubFetch();
    const onDeleted = vi.fn();
    render(<CategoryBudgetForm {...base} category={CATS[1]} onSaved={vi.fn()} onCancel={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete", hidden: false }).then(() => screen.getAllByRole("button", { name: "Delete" }).at(-1)!));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({ method: "DELETE", url: "/api/categories?id=2" });
  });

  it("name is required", async () => {
    stubFetch();
    render(<CategoryBudgetForm {...base} category={null} onSaved={vi.fn()} onCancel={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Name required")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe("one form, one page", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/(app)/categories/_page-content.tsx"), "utf-8");

  it("the page renders the shared form in the wide pane and the below-wide sheet, and has a topbar Add that opens it", () => {
    expect(page.match(/<CategoryBudgetForm\b/g)).toHaveLength(2);
    expect(page).toContain('href: "/categories?edit=new"');
    expect(page).toMatch(/primary=\{\{ kind: "add", label: "Add", href: "\/categories\?edit=new"/);
    expect(page).toContain("setEdit(c.id)");
  });

  it("the old manage page, tabs, budget form and their routes are gone and redirect", () => {
    for (const f of [
      "src/app/(app)/settings/categorization/page.tsx",
      "src/app/(app)/categories/_components/category-management.tsx",
      "src/app/(app)/budgets/new/page.tsx",
      "src/app/(app)/budgets/_components/set-budget-form.tsx",
    ]) expect(fs.existsSync(path.join(ROOT, f)), f).toBe(false);
    expect(REDIRECTS).toContainEqual({ source: "/settings/categorization", destination: "/categories", permanent: false });
    expect(REDIRECTS).toContainEqual({ source: "/budgets/new", destination: "/categories?edit=new", permanent: false });
    expect(page).not.toMatch(/CategoryManagement|TabsContent|Manage/);
    expect(NAV_REGISTRY.some((e) => e.path === "/settings/categorization")).toBe(false);
  });

  it("Rules stay reachable from the page (auto-categorization rules were linked from the manage page)", () => {
    expect(page).toContain('href: "/settings/rules"');
  });
});
