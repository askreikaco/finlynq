/**
 * @vitest-environment jsdom
 */
/**
 * RulesSection (PKG5): Add Rule and Edit open the full rule pages; no dialog
 * opens in place. Toggle and delete behaviour is covered by rules-toggle.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/rules",
}));

const RULES = [
  {
    id: 5,
    name: "Groceries",
    conditions: { all: [{ field: "payee", op: "contains", value: "Whole Foods" }] },
    actions: [{ kind: "set_category", categoryId: 2 }],
    isActive: true,
    priority: 0,
    createdAt: "2026-01-01",
    updatedAt: null,
    actionFKNames: { categories: { "2": "Food" }, accounts: {}, holdings: {} },
  },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/rules") return { ok: true, json: async () => RULES };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import { RulesSection } from "@/components/settings/sections/rules-section";

describe("RulesSection navigation", () => {
  it("Add Rule links to /settings/rules/new with returnTo=/settings/rules", async () => {
    render(<RulesSection />);
    await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
    const add = screen.getByRole("link", { name: /Add Rule/ });
    expect(add.getAttribute("href")).toBe("/settings/rules/new?returnTo=%2Fsettings%2Frules");
  });

  it("Edit links to /settings/rules/[id]/edit with the same returnTo", async () => {
    render(<RulesSection />);
    await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
    const edit = screen.getByRole("link", { name: "Edit" });
    expect(edit.getAttribute("href")).toBe("/settings/rules/5/edit?returnTo=%2Fsettings%2Frules");
  });

  it("loads only the rules list (the editor's lookups now live on the page)", async () => {
    render(<RulesSection />);
    await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(["/api/rules"]);
  });

  it("renders no rule form in place", async () => {
    render(<RulesSection />);
    await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
    expect(screen.queryByLabelText("Rule name")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
