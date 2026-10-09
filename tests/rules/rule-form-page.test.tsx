/**
 * @vitest-environment jsdom
 */
/**
 * /settings/rules/new and /settings/rules/[id]/edit (PKG5). Full pages that
 * replace the RuleEditorDialog openers. Payloads are the same ones the old
 * dialog flow sent: POST/PUT /api/rules, POST /api/import/staged/[id]/create-rule.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ push: vi.fn(), search: "", params: { id: "5" } as Record<string, string> }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => nav.params,
  usePathname: () => "/settings/rules/new",
}));

const RULES = [
  {
    id: 5,
    name: "Groceries",
    conditions: { all: [{ field: "payee", op: "contains", value: "Whole Foods" }] },
    actions: [{ kind: "set_category", categoryId: 2 }],
    isActive: true,
    priority: 3,
    createdAt: "2026-01-01",
    updatedAt: null,
  },
];
const CATS = [{ id: 2, name: "Food", type: "E", group: "Groceries" }];

const fetchMock = vi.fn();

function mockApi(save?: () => Promise<unknown>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/rules" && init?.method && init.method !== "GET") {
      return save ? save() : { ok: true, json: async () => ({}) };
    }
    if (url === "/api/rules") return { ok: true, json: async () => RULES };
    if (url === "/api/categories") return { ok: true, json: async () => CATS };
    if (url === "/api/accounts") return { ok: true, json: async () => [] };
    if (url === "/api/portfolio") return { ok: true, json: async () => [] };
    if (url.startsWith("/api/import/staged/")) {
      return save ? save() : { ok: true, json: async () => ({}) };
    }
    return { ok: false, json: async () => ({}) };
  });
}

function sent(method: string, urlPart = "/api/rules") {
  const call = fetchMock.mock.calls.find((c) => c[1]?.method === method && String(c[0]).includes(urlPart));
  return call ? { url: String(call[0]), headers: call[1].headers as Record<string, string>, body: JSON.parse(call[1].body as string) } : null;
}

beforeEach(() => {
  nav.push.mockReset();
  nav.search = "";
  nav.params = { id: "5" };
  fetchMock.mockReset();
  mockApi();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import NewRulePage from "@/app/(app)/settings/rules/new/page";
import EditRuleRoute from "@/app/(app)/settings/rules/[id]/edit/page";

describe("new rule page (/settings/rules/new)", () => {
  it("renders the 'New rule' page with the editor and a Create rule action", async () => {
    render(<NewRulePage />);
    expect(await screen.findByPlaceholderText("e.g. Grocery stores")).toBeTruthy();
    expect(screen.getByText("New rule")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create rule" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("prefills the name, payee condition and category from query params", async () => {
    nav.search = "payee=Whole%20Foods&categoryId=2";
    render(<NewRulePage />);
    expect(await screen.findByDisplayValue('Match "Whole Foods"')).toBeTruthy();
    // condition value input (the live-preview sample payee also defaults to a value, so match any)
    expect(screen.getAllByDisplayValue("Whole Foods").length).toBeGreaterThan(0);
    expect(screen.getByText("Set category")).toBeTruthy();
  });

  it("empty name shows 'Name is required' and sends no POST", async () => {
    const user = userEvent.setup();
    render(<NewRulePage />);
    await user.click(await screen.findByRole("button", { name: "Create rule" }));
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(sent("POST")).toBeNull();
  });

  it("POSTs the prefilled rule to /api/rules with the same payload shape the dialog sent, then returns to the default", async () => {
    nav.search = "payee=Whole%20Foods&categoryId=2";
    const user = userEvent.setup();
    render(<NewRulePage />);
    await screen.findByDisplayValue('Match "Whole Foods"');
    await user.click(screen.getByRole("button", { name: "Create rule" }));
    await waitFor(() => expect(sent("POST")).not.toBeNull());
    const post = sent("POST")!;
    expect(post.url).toBe("/api/rules");
    expect(post.headers["Content-Type"]).toBe("application/json");
    expect(post.body).toEqual({
      name: 'Match "Whole Foods"',
      conditions: { all: [{ field: "payee", op: "contains", value: "Whole Foods" }] },
      actions: [{ kind: "set_category", categoryId: 2 }],
      priority: 0,
      isActive: true,
    });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/settings/rules"));
  });

  it("a non-ok POST shows the server error inline and stays on the page", async () => {
    mockApi(async () => ({ ok: false, json: async () => ({ error: "Name taken" }) }));
    nav.search = "payee=Whole%20Foods&categoryId=2";
    const user = userEvent.setup();
    render(<NewRulePage />);
    await screen.findByDisplayValue('Match "Whole Foods"');
    await user.click(screen.getByRole("button", { name: "Create rule" }));
    expect(await screen.findByText("Name taken")).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("with no actions (banner flow) the editor refuses to save and sends nothing", async () => {
    nav.search = "payee=Acme&stagedImportId=batch1";
    const user = userEvent.setup();
    render(<NewRulePage />);
    await screen.findByDisplayValue('Match "Acme"');
    await user.click(screen.getByRole("button", { name: "Create rule + apply" }));
    expect(await screen.findByText("At least one action is required")).toBeTruthy();
    expect(sent("POST", "create-rule")).toBeNull();
  });

  it("stagedImportId submits to /api/import/staged/[id]/create-rule and titles the page for the banner flow", async () => {
    nav.search = "payee=Acme&stagedImportId=batch1&returnTo=%2Fimport%2Fpending%3Fid%3Dbatch1";
    const user = userEvent.setup();
    render(<NewRulePage />);
    await screen.findByDisplayValue('Match "Acme"');
    expect(screen.getByText("Create rule from row")).toBeTruthy();
    // add the action the banner flow expects the user to pick
    await user.click(screen.getByRole("button", { name: "Add action" }));
    await user.click(screen.getByRole("button", { name: "Create rule + apply" }));
    await waitFor(() => expect(sent("POST", "create-rule")).not.toBeNull());
    const post = sent("POST", "create-rule")!;
    expect(post.url).toBe("/api/import/staged/batch1/create-rule");
    expect(post.body.name).toBe('Match "Acme"');
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/import/pending?id=batch1"));
  });
});

describe("returnTo validation (same-app paths only)", () => {
  it.each([
    ["protocol-relative", "//evil.example/steal"],
    ["absolute https", "https://evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
  ])("rejects %s and falls back to /settings/rules after save", async (_label, raw) => {
    nav.search = `payee=Acme&categoryId=2&returnTo=${encodeURIComponent(raw)}`;
    const user = userEvent.setup();
    render(<NewRulePage />);
    await screen.findByDisplayValue('Match "Acme"');
    await user.click(screen.getByRole("button", { name: "Create rule" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/settings/rules"));
    expect(nav.push).not.toHaveBeenCalledWith(raw);
  });

  it("Cancel returns to a valid returnTo", async () => {
    nav.search = "returnTo=%2Fsettings%2Freconciliation";
    const user = userEvent.setup();
    render(<NewRulePage />);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(nav.push).toHaveBeenCalledWith("/settings/reconciliation");
  });
});

describe("edit rule page (/settings/rules/[id]/edit)", () => {
  it("loads the rule by id and saves with PUT /api/rules { id, ...payload }", async () => {
    const user = userEvent.setup();
    render(<EditRuleRoute />);
    const name = (await screen.findByDisplayValue("Groceries")) as HTMLInputElement;
    expect(screen.getByText("Edit rule")).toBeTruthy();
    await user.clear(name);
    await user.type(name, "  Grocery stores  ");
    await user.click(screen.getByRole("button", { name: "Update rule" }));
    await waitFor(() => expect(sent("PUT")).not.toBeNull());
    const put = sent("PUT")!;
    expect(put.body).toEqual({
      id: 5,
      name: "Grocery stores",
      conditions: { all: [{ field: "payee", op: "contains", value: "Whole Foods" }] },
      actions: [{ kind: "set_category", categoryId: 2 }],
      priority: 3,
      isActive: true,
    });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/settings/rules"));
  });

  it("an id that is not in the user's rules shows 'Rule not found.' and no editor", async () => {
    nav.params = { id: "999" };
    render(<EditRuleRoute />);
    expect(await screen.findByText("Rule not found.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update rule" })).toBeNull();
  });

  it("a non-numeric id is treated as not found", async () => {
    nav.params = { id: "abc" };
    render(<EditRuleRoute />);
    expect(await screen.findByText("Rule not found.")).toBeTruthy();
  });
});
