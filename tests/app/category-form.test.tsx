/**
 * @vitest-environment jsdom
 */
/**
 * /categories/new and /categories/[id]/edit (PKG5). Add and rename are full
 * pages shared by the merged hub and /settings/categorization. Payloads are the
 * same ones the old inline forms sent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ push: vi.fn(), search: "", params: { id: "1" } as Record<string, string> }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => nav.params,
  usePathname: () => "/categories/new",
}));

const CATEGORIES_DATA = [
  { id: 1, type: "E", group: "Expenses", name: "Food", note: "" },
  { id: 2, type: "E", group: "Transport", name: "Gas", note: "" },
  { id: 3, type: "I", group: "Income", name: "Salary", note: "" },
];

const fetchMock = vi.fn();

function mockApi(overrides: { post?: () => Promise<unknown>; put?: () => Promise<unknown> } = {}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/categories" && init?.method === "POST") {
      if (overrides.post) return overrides.post();
      return { ok: true, json: async () => ({}) };
    }
    if (url === "/api/categories" && init?.method === "PUT") {
      if (overrides.put) return overrides.put();
      return { ok: true, json: async () => ({}) };
    }
    if (url === "/api/categories") return { ok: true, json: async () => CATEGORIES_DATA };
    return { ok: false, json: async () => ({}) };
  });
}

function bodyOf(method: string) {
  const call = fetchMock.mock.calls.find((c) => c[1]?.method === method);
  return call ? { init: call[1] as RequestInit, body: JSON.parse(call[1].body as string) } : null;
}

beforeEach(() => {
  nav.push.mockReset();
  nav.search = "";
  nav.params = { id: "1" };
  fetchMock.mockReset();
  mockApi();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import { CategoryForm } from "@/app/(app)/categories/_components/category-form";
import NewCategoryPage from "@/app/(app)/categories/new/page";
import EditCategoryRoute from "@/app/(app)/categories/[id]/edit/page";

describe("create category page (/categories/new)", () => {
  it("renders the name, group and type fields with labels and an Add Category action", async () => {
    render(<NewCategoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Category name")).toBeTruthy());
    expect(screen.getByLabelText("Group")).toBeTruthy();
    expect(screen.getByLabelText("Type")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Category" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("empty name shows 'Name is required' and sends no POST", async () => {
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Category name")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Add Category" }));
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(bodyOf("POST")).toBeNull();
  });

  it("whitespace-only name is rejected the same way", async () => {
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    const input = await screen.findByLabelText("Category name");
    await user.type(input, "   ");
    await user.click(screen.getByRole("button", { name: "Add Category" }));
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(bodyOf("POST")).toBeNull();
  });

  it("POSTs { name, type, group } with trimmed name and group and a JSON content type, then returns to the default", async () => {
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    const input = await screen.findByLabelText("Category name");
    await user.type(input, "  Coffee  ");
    await user.click(screen.getByRole("button", { name: "Add Category" }));
    await waitFor(() => expect(bodyOf("POST")).not.toBeNull());
    const post = bodyOf("POST")!;
    expect(post.body).toEqual({ name: "Coffee", type: "E", group: "" });
    expect((post.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/categories?tab=manage"));
  });

  it("returns to a valid returnTo after a successful create", async () => {
    nav.search = "returnTo=%2Fsettings%2Fcategorization";
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    await user.type(await screen.findByLabelText("Category name"), "Gym");
    await user.click(screen.getByRole("button", { name: "Add Category" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/settings/categorization"));
  });

  it("a non-ok POST shows the server error and stays on the page", async () => {
    mockApi({ post: async () => ({ ok: false, json: async () => ({ error: "Name already exists" }) }) });
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    await user.type(await screen.findByLabelText("Category name"), "Food");
    await user.click(screen.getByRole("button", { name: "Add Category" }));
    expect(await screen.findByText("Name already exists")).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Category name") as HTMLInputElement).value).toBe("Food");
  });

  it("a non-ok POST with no error field shows 'Failed to create'", async () => {
    mockApi({ post: async () => ({ ok: false, json: async () => ({}) }) });
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    await user.type(await screen.findByLabelText("Category name"), "X");
    await user.click(screen.getByRole("button", { name: "Add Category" }));
    expect(await screen.findByText("Failed to create")).toBeTruthy();
  });

  it("a thrown POST shows 'Failed to create category'", async () => {
    mockApi({ post: async () => { throw new Error("network"); } });
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    await user.type(await screen.findByLabelText("Category name"), "X");
    await user.click(screen.getByRole("button", { name: "Add Category" }));
    expect(await screen.findByText("Failed to create category")).toBeTruthy();
  });

  it("Cancel returns to returnTo without POSTing", async () => {
    nav.search = "returnTo=%2Fcategories%3Ftab%3Dmanage";
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    await user.type(await screen.findByLabelText("Category name"), "Abc");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(nav.push).toHaveBeenCalledWith("/categories?tab=manage");
    expect(bodyOf("POST")).toBeNull();
  });

  it("group combobox offers existing groups from GET /api/categories", async () => {
    render(<NewCategoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Group")).toBeTruthy());
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === "/api/categories")).toBe(true));
  });
});

describe("rename category page (/categories/[id]/edit)", () => {
  it("prefills the current name and renames with PUT { id, name } (trimmed, JSON)", async () => {
    nav.params = { id: "2" };
    const user = userEvent.setup();
    render(<EditCategoryRoute />);
    const input = (await screen.findByLabelText("Category name")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Gas"));
    await user.clear(input);
    await user.type(input, "  Fuel  ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodyOf("PUT")).not.toBeNull());
    const put = bodyOf("PUT")!;
    expect(put.body).toEqual({ id: 2, name: "Fuel" });
    expect((put.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/categories?tab=manage"));
  });

  it("an empty name shows 'Name is required' and sends no PUT", async () => {
    nav.params = { id: "2" };
    const user = userEvent.setup();
    render(<EditCategoryRoute />);
    const input = (await screen.findByLabelText("Category name")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Gas"));
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(bodyOf("PUT")).toBeNull();
  });

  it("a non-ok PUT shows data.error, and with no error field shows 'Failed to update'", async () => {
    nav.params = { id: "1" };
    mockApi({ put: async () => ({ ok: false, json: async () => ({}) }) });
    const user = userEvent.setup();
    render(<EditCategoryRoute />);
    const input = (await screen.findByLabelText("Category name")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Food"));
    await user.type(input, "2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Failed to update")).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("a thrown PUT shows 'Failed to update category'", async () => {
    nav.params = { id: "1" };
    mockApi({ put: async () => { throw new Error("network"); } });
    const user = userEvent.setup();
    render(<EditCategoryRoute />);
    const input = (await screen.findByLabelText("Category name")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Food"));
    await user.type(input, "2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Failed to update category")).toBeTruthy();
  });

  it("an id that is not in the list shows 'Category not found' and no form", async () => {
    nav.params = { id: "999" };
    render(<EditCategoryRoute />);
    expect(await screen.findByText("Category not found")).toBeTruthy();
    expect(screen.queryByLabelText("Category name")).toBeNull();
  });

  it("a non-numeric id is treated as not found", async () => {
    nav.params = { id: "abc" };
    render(<EditCategoryRoute />);
    expect(await screen.findByText("Category not found")).toBeTruthy();
  });

  it("the form has no type or group fields in rename mode (payload is name only)", async () => {
    nav.params = { id: "1" };
    render(<CategoryForm mode="rename" categoryId={1} />);
    await screen.findByDisplayValue("Food");
    expect(screen.queryByLabelText("Type")).toBeNull();
    expect(screen.queryByLabelText("Group")).toBeNull();
  });
});

describe("returnTo validation (same-app paths only)", () => {
  it.each([
    ["protocol-relative", "//evil.example/steal"],
    ["absolute https", "https://evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["backslash trick", "/\\evil.example"],
    ["embedded space", "/categories tab"],
  ])("rejects %s and falls back to the default after save", async (_label, raw) => {
    nav.search = `returnTo=${encodeURIComponent(raw)}`;
    const user = userEvent.setup();
    render(<NewCategoryPage />);
    await user.type(await screen.findByLabelText("Category name"), "Abc");
    await user.click(screen.getByRole("button", { name: "Add Category" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/categories?tab=manage"));
    expect(nav.push).not.toHaveBeenCalledWith(raw);
  });

  it("the Cancel button uses the same validated returnTo", async () => {
    nav.search = `returnTo=${encodeURIComponent("//evil.example")}`;
    render(<NewCategoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(nav.push).toHaveBeenCalledWith("/categories?tab=manage");
  });
});
