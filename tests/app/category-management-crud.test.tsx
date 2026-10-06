/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/categories",
}));

const CATEGORIES_DATA = [
  { id: 1, type: "E", group: "Expenses", name: "Food", note: "" },
  { id: 2, type: "E", group: "Transport", name: "Gas", note: "" },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/categories")) {
      if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => CATEGORIES_DATA };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import { CategoryManagement } from "@/app/(app)/categories/_components/category-management";

describe("CategoryManagement CRUD", () => {
  describe("Add Category", () => {
    it("submitting empty form shows validation error and no POST", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Click Add
      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      // Submit empty
      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // Should show error
      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeTruthy();
      });

      // Should not POST
      const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
      expect(postCalls.length).toBe(0);
    });

    it("submitting form with name/group/type POSTs with trimmed values", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Click Add
      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      // Fill form
      const nameInput = screen.getByLabelText("Category name") as HTMLInputElement;
      await user.clear(nameInput);
      await user.type(nameInput, "  Coffee  ");

      // Get type select and verify it's set to Expense
      const typeSelect = screen.getByLabelText("Type");
      expect(typeSelect).toBeTruthy();

      // Submit
      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // Should POST with trimmed values
      await waitFor(() => {
        const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
        expect(postCalls.length).toBeGreaterThan(0);

        const lastPostCall = postCalls[postCalls.length - 1];
        const body = JSON.parse(lastPostCall[1].body as string);

        expect(body.name).toBe("Coffee");
        expect(body.type).toBe("E");
      });

      // Should fetch categories again
      await waitFor(() => {
        const categoryCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/categories" && !c[1]?.method);
        expect(categoryCalls.length).toBeGreaterThan(1);
      });
    });

    it("Cancel closes add form", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Click Add
      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      // Type something
      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "Test");

      // Click Cancel
      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelButton);

      // Form should be hidden
      await waitFor(() => {
        expect(screen.queryByLabelText("Category name")).toBeFalsy();
      });
    });
  });

  describe("Edit Category", () => {
    it("typing name with spaces and pressing Enter PUTs with trimmed value", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Click edit button for Food
      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      // Should show edit input
      const editInput = screen.getByDisplayValue("Food") as HTMLInputElement;

      // Clear and type with spaces
      await user.clear(editInput);
      await user.type(editInput, "  Groceries  ");

      // Press Enter
      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      // Should PUT with trimmed value
      await waitFor(() => {
        const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
        expect(putCalls.length).toBeGreaterThan(0);

        const lastPutCall = putCalls[putCalls.length - 1];
        const body = JSON.parse(lastPutCall[1].body as string);

        expect(body.name).toBe("Groceries");
      });

      // After success, edit input should be gone
      await waitFor(() => {
        expect(screen.queryByDisplayValue("Groceries")).toBeFalsy();
      });

      // Should fetch categories again
      await waitFor(() => {
        const categoryCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/categories" && !c[1]?.method);
        expect(categoryCalls.length).toBeGreaterThan(1);
      });
    });

    it("Escape cancels edit", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const editInput = screen.getByDisplayValue("Food") as HTMLInputElement;
      await user.clear(editInput);
      await user.type(editInput, "Changed");

      // Press Escape
      fireEvent.keyDown(editInput, { key: "Escape", code: "Escape" });

      // Input should be gone, no PUT made
      await waitFor(() => {
        expect(screen.queryByDisplayValue("Changed")).toBeFalsy();
      });

      const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
      expect(putCalls.length).toBe(0);
    });

    it("empty edit name is a no-op", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const editInput = screen.getByDisplayValue("Food") as HTMLInputElement;
      await user.clear(editInput);

      // Press Enter on empty
      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      // Should not PUT
      const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
      expect(putCalls.length).toBe(0);
    });
  });

  describe("Delete Category", () => {
    it("DELETE sends correct id and reloads", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Click delete button for Food (id=1)
      const deleteButtons = screen.getAllByLabelText("Delete category");
      await user.click(deleteButtons[0]);

      // Should have DELETE call with correct id
      await waitFor(() => {
        const deleteCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "DELETE");
        expect(deleteCalls.length).toBeGreaterThan(0);

        const lastDeleteCall = deleteCalls[deleteCalls.length - 1];
        expect(lastDeleteCall[0]).toContain("id=1");
      });

      // Should reload categories after delete
      await waitFor(() => {
        const categoryCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/categories" && !c[1]?.method);
        expect(categoryCalls.length).toBeGreaterThan(1);
      });
    });
  });

  describe("Error Handling", () => {
    it("PUT non-ok shows data.error", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "PUT") {
            return { ok: false, json: async () => ({ error: "Category name taken" }) };
          }
          return { ok: true, json: async () => CATEGORIES_DATA };
        }
        return { ok: false, json: async () => ({}) };
      });

      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const editInput = screen.getByDisplayValue("Food") as HTMLInputElement;
      await user.clear(editInput);
      await user.type(editInput, "Gas");

      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("Category name taken")).toBeTruthy();
      });
    });

    it("DELETE non-ok shows data.error", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "DELETE") {
            return { ok: false, json: async () => ({ error: "Cannot delete" }) };
          }
          return { ok: true, json: async () => CATEGORIES_DATA };
        }
        return { ok: false, json: async () => ({}) };
      });

      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const deleteButtons = screen.getAllByLabelText("Delete category");
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Cannot delete")).toBeTruthy();
      });
    });

    it("POST non-ok shows data.error", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST") {
            return { ok: false, json: async () => ({ error: "Invalid group" }) };
          }
          return { ok: true, json: async () => CATEGORIES_DATA };
        }
        return { ok: false, json: async () => ({}) };
      });

      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "Test");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Invalid group")).toBeTruthy();
      });
    });

    it("GET rejection shows 'Failed to load categories'", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/api/categories") && !url.includes("method")) {
          throw new Error("Network error");
        }
        return { ok: true, json: async () => CATEGORIES_DATA };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Failed to load categories")).toBeTruthy();
      });
    });

    it("non-array GET response shows 'No categories found'", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/api/categories") && !url.includes("method")) {
          return { ok: true, json: async () => ({ invalid: "data" }) };
        }
        return { ok: true, json: async () => CATEGORIES_DATA };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
      });
    });

    it("empty categories shows 'No categories found'", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/api/categories") && !url.includes("method")) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => CATEGORIES_DATA };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
      });
    });
  });

  describe("Grouping and Order", () => {
    it("groups by type with E first", async () => {
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("type-section-E")).toBeTruthy();
      });

      const eSection = screen.getByTestId("type-section-E");
      const iSection = screen.queryByTestId("type-section-I");

      // E should appear before I
      if (iSection) {
        expect(eSection.compareDocumentPosition(iSection)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
    });
  });

  describe("h1 text", () => {
    it("merged branch shows exact h1 text", async () => {
      const CategoriesPageContent = (await import("@/app/(app)/categories/_page-content")).default;
      render(<CategoriesPageContent isMerged={true} />);

      await waitFor(() => {
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1.textContent).toBe("Categories");
      });
    });
  });
});
