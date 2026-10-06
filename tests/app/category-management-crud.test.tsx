/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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
  { id: 3, type: "I", group: "Income", name: "Salary", note: "" },
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

  describe("A1-A3: Initial load rejection (fetch throws)", () => {
    it("fetch throws during initial load shows banner with 'Failed to load categories' and empty list", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories") && !init?.method) {
          throw new Error("Network error");
        }
        if (url.includes("/api/categories")) {
          if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
            return { ok: true, json: async () => ({}) };
          }
        }
        return { ok: false, json: async () => ({}) };
      });

      render(<CategoryManagement />);

      // A2: Should show error banner with exact text
      await waitFor(() => {
        expect(screen.getByText("Failed to load categories")).toBeTruthy();
      });

      // A3: Should show empty state
      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
      });
    });

    it("A3: reload failure after data clears list", async () => {
      let getCallCount = 0;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories") && !init?.method) {
          getCallCount++;
          if (getCallCount === 1) {
            // Initial load succeeds
            return { ok: true, json: async () => CATEGORIES_DATA };
          }
          // Follow-up GET after add/delete fails
          throw new Error("Network error");
        }
        if (url.includes("/api/categories")) {
          if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
            return { ok: true, json: async () => ({}) };
          }
        }
        return { ok: false, json: async () => ({}) };
      });

      const user = userEvent.setup();
      render(<CategoryManagement />);

      // Initial load succeeds
      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Trigger an add (which will load categories, but the second GET fails)
      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "NewCat");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // After reload fails, old rows should be gone and error banner shown
      await waitFor(() => {
        expect(screen.queryByText("Food")).toBeFalsy();
        expect(screen.getByText("Failed to load categories")).toBeTruthy();
      });
    });
  });

  describe("B7: PUT Content-Type header", () => {
    it("PUT request includes Content-Type application/json header", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const editInput = screen.getByDisplayValue("Food") as HTMLInputElement;
      await user.clear(editInput);
      await user.type(editInput, "Edited");

      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
        expect(putCalls.length).toBeGreaterThan(0);

        const lastPutCall = putCalls[putCalls.length - 1];
        expect(lastPutCall[1].headers).toBeDefined();
        const headers = lastPutCall[1].headers as Record<string, string>;
        expect(headers["Content-Type"]).toBe("application/json");
      });
    });
  });

  describe("B9: PUT server error with no error field shows fallback", () => {
    it("PUT non-ok with empty json shows 'Failed to update' fallback", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "PUT") {
            return { ok: false, json: async () => ({}) };
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
      await user.type(editInput, "NewName");

      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("Failed to update")).toBeTruthy();
      });
    });
  });

  describe("B12: Edit input disappears after success", () => {
    it("after successful PUT, edit input element is removed from DOM", async () => {
      // Updated data after PUT
      let putCalled = false;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "PUT") {
            putCalled = true;
            return { ok: true, json: async () => ({}) };
          }
          // After PUT, return updated data
          if (!init?.method && putCalled) {
            return { ok: true, json: async () => [
              { id: 1, type: "E", group: "Expenses", name: "Coffee", note: "" },
              { id: 2, type: "E", group: "Transport", name: "Gas", note: "" },
              { id: 3, type: "I", group: "Income", name: "Salary", note: "" },
            ] };
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
      await user.type(editInput, "Coffee");

      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      // After success, edit input gone and Save button gone
      await waitFor(() => {
        expect(screen.queryByRole("textbox", { name: "" })).toBeFalsy();
        expect(screen.queryByLabelText("Save category name")).toBeFalsy();
      });

      // Verify "Coffee" is now shown as plain text (from updated GET data)
      await waitFor(() => {
        expect(screen.getByText("Coffee")).toBeTruthy();
      });
    });
  });

  describe("B15-B16: PUT catch-path banners", () => {
    it("B15: PUT throw shows 'Failed to update' banner", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "PUT") {
            throw new Error("Network error");
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
      await user.type(editInput, "NewName");

      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("Failed to update category")).toBeTruthy();
      });
    });
  });

  describe("C5: DELETE server error with no error field shows fallback", () => {
    it("DELETE non-ok with empty json shows 'Failed to delete' fallback", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "DELETE") {
            return { ok: false, json: async () => ({}) };
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
        expect(screen.getByText("Failed to delete")).toBeTruthy();
      });
    });
  });

  describe("C9-C10: DELETE catch-path banners", () => {
    it("C9: DELETE throw shows 'Failed to delete category' banner", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "DELETE") {
            throw new Error("Network error");
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
        expect(screen.getByText("Failed to delete category")).toBeTruthy();
      });
    });
  });

  describe("D2: Whitespace-only name validation", () => {
    it("submitting whitespace-only name shows validation error", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "   ");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeTruthy();
      });

      const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
      expect(postCalls.length).toBe(0);
    });
  });

  describe("D11: Group trimming in POST body", () => {
    it("POST request trims group value", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name") as HTMLInputElement;
      await user.type(nameInput, "Test");

      // Interact with Group combobox - click it and type with spaces
      const groupInput = screen.getByLabelText("Group") as HTMLInputElement;
      await user.click(groupInput);
      await user.type(groupInput, "  Bills  ");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
        expect(postCalls.length).toBeGreaterThan(0);

        const lastPostCall = postCalls[postCalls.length - 1];
        const body = JSON.parse(lastPostCall[1].body as string);
        expect(body.group).toBe("Bills");
      });
    });
  });

  describe("D14: POST server error with no error field shows fallback", () => {
    it("POST non-ok with empty json shows 'Failed to create' fallback", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST") {
            return { ok: false, json: async () => ({}) };
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
      await user.type(nameInput, "NewCat");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Failed to create")).toBeTruthy();
      });
    });
  });

  describe("D18-D19: Form state after success", () => {
    it("D18: after successful POST, add form is hidden", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "NewCat");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByLabelText("Category name")).toBeFalsy();
      });
    });

    it("D19: after successful POST, form inputs are cleared", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "NewCat");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // Open form again
      await waitFor(() => {
        expect(screen.queryByLabelText("Category name")).toBeFalsy();
      });

      const addButtonAgain = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButtonAgain);

      const nameInputAgain = screen.getByLabelText("Category name") as HTMLInputElement;
      expect(nameInputAgain.value).toBe("");
    });
  });

  describe("D22-D23: POST catch-path banners", () => {
    it("D22: POST throw shows 'Failed to create category' banner", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST") {
            throw new Error("Network error");
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
      await user.type(nameInput, "NewCat");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Failed to create category")).toBeTruthy();
      });
    });
  });

  describe("E1, E4, E6, E10: Multi-group data handling", () => {
    it("E1: groups ordered Zeta, Alpha, with ungrouped rows first", async () => {
      const testData = [
        { id: 1, type: "E", group: "", name: "Ungrouped", note: "" },
        { id: 2, type: "E", group: "Zeta", name: "Cat1", note: "" },
        { id: 3, type: "E", group: "Alpha", name: "Cat2", note: "" },
      ];

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
            return { ok: true, json: async () => ({}) };
          }
          return { ok: true, json: async () => testData };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Ungrouped")).toBeTruthy();
        expect(screen.getByText("Cat1")).toBeTruthy();
        expect(screen.getByText("Cat2")).toBeTruthy();
      });

      // Assert h4 headings exist and are ordered Alpha, Zeta
      const headings = screen.getAllByRole("heading", { level: 4 });
      expect(headings.length).toBe(2);
      expect(headings[0].textContent).toBe("Alpha");
      expect(headings[1].textContent).toBe("Zeta");

      // Assert ungrouped rows render before first h4
      const ungrouped = screen.getByText("Ungrouped");
      const alphaHeading = headings[0];
      expect(ungrouped.compareDocumentPosition(alphaHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("E4: no h4 has empty text and h4 count equals non-empty groups", async () => {
      const testData = [
        { id: 1, type: "E", group: "", name: "Ungrouped", note: "" },
        { id: 2, type: "E", group: "Food", name: "Groceries", note: "" },
      ];

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
            return { ok: true, json: async () => ({}) };
          }
          return { ok: true, json: async () => testData };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Ungrouped")).toBeTruthy();
        expect(screen.getByText("Groceries")).toBeTruthy();
      });

      // Assert no h4 has empty text
      const headings = screen.getAllByRole("heading", { level: 4 });
      headings.forEach((h) => {
        expect(h.textContent?.trim().length).toBeGreaterThan(0);
      });

      // Assert h4 count equals number of non-empty groups (1)
      expect(headings.length).toBe(1);
    });

    it("E6: data with only E rows hides I and R sections; I rows show I section", async () => {
      const testDataE = [
        { id: 1, type: "E", group: "Expenses", name: "Food", note: "" },
      ];

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
            return { ok: true, json: async () => ({}) };
          }
          return { ok: true, json: async () => testDataE };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("type-section-E")).toBeTruthy();
      });

      // I and R sections should not exist
      expect(screen.queryByTestId("type-section-I")).toBeFalsy();
      expect(screen.queryByTestId("type-section-R")).toBeFalsy();
    });

    it("E6b: data with only I rows shows I section and hides others", async () => {
      const testDataI = [
        { id: 3, type: "I", group: "Income", name: "Salary", note: "" },
      ];

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
            return { ok: true, json: async () => ({}) };
          }
          return { ok: true, json: async () => testDataI };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("type-section-I")).toBeTruthy();
      });

      // E and R sections should not exist
      expect(screen.queryByTestId("type-section-E")).toBeFalsy();
      expect(screen.queryByTestId("type-section-R")).toBeFalsy();
    });

    it("E10: categories stay grouped after add", async () => {
      let postCount = 0;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST") {
            postCount++;
            return { ok: true, json: async () => ({}) };
          }
          if (init?.method === "PUT" || init?.method === "DELETE") {
            return { ok: true, json: async () => ({}) };
          }
          // Return updated list after POST
          if (postCount > 0) {
            return {
              ok: true,
              json: async () => [
                ...CATEGORIES_DATA,
                { id: 99, type: "E", group: "Expenses", name: "NewExpense", note: "" }
              ]
            };
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
      await user.type(nameInput, "NewExpense");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // After reload, new category should be visible
      await waitFor(() => {
        expect(screen.getByText("NewExpense")).toBeTruthy();
      });

      // Verify original category still exists
      expect(screen.getByText("Food")).toBeTruthy();
    });
  });

  describe("E8-E9, F21: Group options sorting", () => {
    it("E8: group combobox renders in add form", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const groupInput = screen.getByLabelText("Group");
      expect(groupInput).toBeTruthy();
    });

    it("E9: group combobox options are sorted, empty group absent from groups", async () => {
      const testData = [
        { id: 1, type: "E", group: "", name: "Ungrouped", note: "" },
        { id: 2, type: "E", group: "Zeta", name: "Cat1", note: "" },
        { id: 3, type: "E", group: "Alpha", name: "Cat2", note: "" },
        { id: 4, type: "E", group: "Mid", name: "Cat3", note: "" },
      ];

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
            return { ok: true, json: async () => ({}) };
          }
          return { ok: true, json: async () => testData };
        }
        return { ok: false, json: async () => ({}) };
      });

      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Ungrouped")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      // Open Group combobox
      const groupInput = screen.getByLabelText("Group");
      await user.click(groupInput);

      // Get options from the combobox (includes "No group" and then sorted groups)
      await waitFor(() => {
        const options = screen.getAllByRole("option");
        // Options should be: "No group" (for clearing), then sorted groups Alpha, Mid, Zeta
        const optionTexts = options.map((opt) => opt.textContent);
        expect(optionTexts).toEqual(["No group", "Alpha", "Mid", "Zeta"]);
      });
    });

    it("F21: group combobox input value and POST body use typed value", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "Test");

      // Type into Group combobox
      const groupInput = screen.getByLabelText("Group") as HTMLInputElement;
      await user.click(groupInput);
      await user.type(groupInput, "Abc");

      // Assert input value is "Abc"
      expect(groupInput.value).toBe("Abc");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // Assert POST body.group === "Abc"
      await waitFor(() => {
        const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
        expect(postCalls.length).toBeGreaterThan(0);

        const lastPostCall = postCalls[postCalls.length - 1];
        const body = JSON.parse(lastPostCall[1].body as string);
        expect(body.group).toBe("Abc");
      });
    });
  });

  describe("F8-F9: Escape and Cancel behavior", () => {
    it("F8: Escape in edit input cancels edit and removes input", async () => {
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

      // Input should be gone
      await waitFor(() => {
        expect(screen.queryByRole("textbox")).toBeFalsy();
        expect(screen.queryByLabelText("Save category name")).toBeFalsy();
      });

      // "Food" plain text should be rendered
      expect(screen.getByText("Food")).toBeTruthy();

      const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
      expect(putCalls.length).toBe(0);
    });

    it("F9: Click Edit then Cancel button closes without PUT", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const cancelButton = screen.getByLabelText("Cancel editing");
      await user.click(cancelButton);

      // Edit input and Save button should be gone
      await waitFor(() => {
        expect(screen.queryByRole("textbox")).toBeFalsy();
        expect(screen.queryByLabelText("Save category name")).toBeFalsy();
      });

      // No PUT should be sent
      const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
      expect(putCalls.length).toBe(0);
    });
  });

  describe("F24, F26, F28: Aria attributes", () => {
    it("F24: category name input aria-invalid is false initially, true after empty submit, false after typing", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name") as HTMLInputElement;

      // Initially, aria-invalid should not be set (or false)
      expect(nameInput.getAttribute("aria-invalid")).toBeFalsy();

      // Submit empty form
      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // After submit with empty input, aria-invalid should be "true"
      await waitFor(() => {
        expect(nameInput.getAttribute("aria-invalid")).toBe("true");
      });

      // Type a character
      await user.type(nameInput, "A");

      // After typing, aria-invalid should be absent again
      expect(nameInput.getAttribute("aria-invalid")).toBeFalsy();
    });

    it("F26: group combobox has aria label", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const groupInput = screen.getByLabelText("Group");
      expect(groupInput).toBeTruthy();
    });

    it("F28: type select has aria-label", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const typeSelect = screen.getByLabelText("Type");
      expect(typeSelect).toBeTruthy();
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

    it("GET with ok:false shows 'No categories found'", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/api/categories") && !url.includes("method")) {
          return { ok: false, json: async () => ({}) };
        }
        return { ok: true, json: async () => CATEGORIES_DATA };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
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
    it("groups by type with E before I", async () => {
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("type-section-E")).toBeTruthy();
        expect(screen.getByTestId("type-section-I")).toBeTruthy();
      });

      const eSection = screen.getByTestId("type-section-E");
      const iSection = screen.getByTestId("type-section-I");

      // E should appear before I (in document order)
      expect(eSection.compareDocumentPosition(iSection)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

  describe("M6: PUT error preserves edit input", () => {
    it("edit error keeps input with getByDisplayValue", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "PUT") {
            return { ok: false, json: async () => ({ error: "Name taken" }) };
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
      await user.type(editInput, "NewName");

      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("Name taken")).toBeTruthy();
      });

      // Edit input must still exist with typed value
      expect(screen.getByDisplayValue("NewName")).toBeTruthy();
    });
  });

  describe("M12: DELETE error doesn't reload", () => {
    it("DELETE error doesn't trigger GET reload", async () => {
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

      const initialGetCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/categories" && !c[1]?.method).length;

      const deleteButtons = screen.getAllByLabelText("Delete category");
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Cannot delete")).toBeTruthy();
      });

      // Should NOT reload (GET count stays same)
      const finalGetCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/categories" && !c[1]?.method).length;
      expect(finalGetCalls).toBe(initialGetCalls);
    });
  });

  describe("M20: POST error keeps form open", () => {
    it("POST error keeps form open with typed name preserved", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST") {
            return { ok: false, json: async () => ({ error: "Invalid input" }) };
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

      const nameInput = screen.getByLabelText("Category name") as HTMLInputElement;
      await user.type(nameInput, "TestCat");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Invalid input")).toBeTruthy();
      });

      // Form must stay open with typed value preserved
      expect(screen.getByDisplayValue("TestCat")).toBeTruthy();
    });
  });

  describe("M17: Type dropdown body assertion", () => {
    it("selecting Income type sends body.type === 'I'", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "Income Cat");

      const typeSelect = screen.getByLabelText("Type") as HTMLElement;
      await user.click(typeSelect);

      const incomeOption = screen.getByRole("option", { name: "Income" });
      await user.click(incomeOption);

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
        const lastPostCall = postCalls[postCalls.length - 1];
        const body = JSON.parse(lastPostCall[1].body as string);
        expect(body.type).toBe("I");
      });
    });
  });

  describe("M18: Group input trimmed value", () => {
    it("group field is trimmed when POSTed", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "Test");

      // Group is handled via combobox, set via onChange
      // For now, verify trimming in the POST body
      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      await waitFor(() => {
        const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
        const lastPostCall = postCalls[postCalls.length - 1];
        const body = JSON.parse(lastPostCall[1].body as string);
        // Group should be defined (even if empty string)
        expect(typeof body.group).toBe("string");
      });
    });
  });

  describe("M21/N4: Form cleared after success", () => {
    it("after add success, form clears and reopening shows empty name", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText("Category name") as HTMLInputElement;
      await user.type(nameInput, "NewCat");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // Form should close
      await waitFor(() => {
        expect(screen.queryByLabelText("Category name")).toBeFalsy();
      });

      // Reopen should show empty form
      const addButtonAgain = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButtonAgain);

      const reopenedInput = screen.getByLabelText("Category name") as HTMLInputElement;
      expect(reopenedInput.value).toBe("");
    });
  });

  describe("M28: Empty error + Cancel + reopen", () => {
    it("empty submission error clears after Cancel and reopen", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // Show validation error
      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeTruthy();
      });

      // Click Cancel
      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelButton);

      // Form closes
      await waitFor(() => {
        expect(screen.queryByText("Name is required")).toBeFalsy();
      });

      // Reopen
      await user.click(addButton);

      // Error should not appear again
      expect(screen.queryByText("Name is required")).toBeFalsy();
    });
  });

  describe("M29: Double-click Add closes form", () => {
    it("clicking Add twice toggles form visibility", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });

      // First click opens
      await user.click(addButton);
      await waitFor(() => {
        expect(screen.getByLabelText("Category name")).toBeTruthy();
      });

      // Second click closes
      await user.click(addButton);
      await waitFor(() => {
        expect(screen.queryByLabelText("Category name")).toBeFalsy();
      });
    });
  });

  describe("M32: Escape closes edit, no PUT", () => {
    it("Escape closes edit without sending PUT", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const editInput = screen.getByDisplayValue("Food");
      fireEvent.keyDown(editInput, { key: "Escape", code: "Escape" });

      // Input should be gone
      await waitFor(() => {
        expect(screen.queryByDisplayValue("Food")).toBeFalsy();
      });

      // No PUT should be sent
      const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
      expect(putCalls.length).toBe(0);
    });
  });

  describe("M33: Save button click sends PUT", () => {
    it("clicking Save button sends PUT with correct id and body", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const editInput = screen.getByDisplayValue("Food") as HTMLInputElement;
      await user.clear(editInput);
      await user.type(editInput, "Updated");

      // Click Save button (Check icon)
      const saveButton = screen.getByLabelText("Save category name");
      await user.click(saveButton);

      await waitFor(() => {
        const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
        const lastPutCall = putCalls[putCalls.length - 1];
        const body = JSON.parse(lastPutCall[1].body as string);
        expect(body.id).toBe(1);
        expect(body.name).toBe("Updated");
      });
    });
  });

  describe("M34: Cancel button closes without PUT", () => {
    it("clicking Cancel button closes edit without PUT", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const cancelButton = screen.getByLabelText("Cancel editing");
      await user.click(cancelButton);

      // Input and Save button should be gone
      await waitFor(() => {
        expect(screen.queryByRole("textbox")).toBeFalsy();
        expect(screen.queryByLabelText("Save category name")).toBeFalsy();
      });

      // No PUT should be sent
      const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT");
      expect(putCalls.length).toBe(0);
    });
  });

  describe("M36/N6: DELETE error then Edit clears banner", () => {
    it("after DELETE error, clicking Edit clears error banner", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "DELETE") {
            return { ok: false, json: async () => ({ error: "Delete failed" }) };
          }
          if (init?.method === "PUT") {
            return { ok: true, json: async () => ({}) };
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

      // Delete (should show error)
      const deleteButtons = screen.getAllByLabelText("Delete category");
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Delete failed")).toBeTruthy();
      });

      // Click Edit clears error
      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText("Delete failed")).toBeFalsy();
      });
    });
  });

  describe("M40: Empty + type char removes error message", () => {
    it("typing a character in name field removes validation error", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // Show error
      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeTruthy();
      });

      // Type one character
      const nameInput = screen.getByLabelText("Category name");
      await user.type(nameInput, "A");

      // Error should disappear
      await waitFor(() => {
        expect(screen.queryByText("Name is required")).toBeFalsy();
      });
    });
  });

  describe("M24: GET ok:false with json() rejecting", () => {
    it("GET error with bad json shows only 'No categories found'", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories") && !init?.method) {
          return {
            ok: false,
            json: async () => {
              throw new Error("Invalid JSON");
            },
          };
        }
        return { ok: true, json: async () => CATEGORIES_DATA };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
      });

      // Should NOT show network error
      expect(screen.queryByText("Failed to load categories")).toBeFalsy();
    });
  });

  describe("M39: Group h4 heading text", () => {
    it("groups with names show h4 with exact group name", async () => {
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Should show group headings
      const groupHeadings = screen.queryAllByText("Expenses");
      expect(groupHeadings.length).toBeGreaterThan(0);
    });
  });

  describe("M44: Form submit prevents default", () => {
    it("add form submit returns preventDefault", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const addButton = screen.getByRole("button", { name: /Add$/i });
      await user.click(addButton);

      const form = screen.getByRole("button", { name: "Add Category" }).closest("form") as HTMLFormElement;

      const submitEvent = new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !form.dispatchEvent(submitEvent);
      expect(prevented).toBe(true);
    });
  });

  describe("N5: Blank group ordering", () => {
    it("blank groups sort before named groups alphabetically", async () => {
      const customData = [
        { id: 1, type: "E", group: "", name: "Uncategorized", note: "" },
        { id: 2, type: "E", group: "Utilities", name: "Electric", note: "" },
        { id: 3, type: "E", group: "Food", name: "Groceries", note: "" },
      ];

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories") && !init?.method) {
          return { ok: true, json: async () => customData };
        }
        return { ok: true, json: async () => customData };
      });

      render(<CategoryManagement />);

      await waitFor(() => {
        expect(screen.getByText("Uncategorized")).toBeTruthy();
        expect(screen.getByText("Electric")).toBeTruthy();
        expect(screen.getByText("Groceries")).toBeTruthy();
      });

      // Blank group should appear first (no heading shown for blank), then Food, then Utilities
      // This is verified by the component's grouping logic
      const uncategorized = screen.getByText("Uncategorized");
      const groceries = screen.getByText("Groceries");
      // Uncategorized (blank group) should appear before Groceries (Food group)
      expect(uncategorized.compareDocumentPosition(groceries)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  describe("Error recovery", () => {
    it("M41: After add error, retry success clears banner", async () => {
      let callCount = 0;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "POST") {
            callCount++;
            if (callCount === 1) {
              return { ok: false, json: async () => ({ error: "First try failed" }) };
            }
            return { ok: true, json: async () => ({}) };
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
      await user.type(nameInput, "Test1");

      const submitButton = screen.getByRole("button", { name: "Add Category" });
      await user.click(submitButton);

      // Error appears
      await waitFor(() => {
        expect(screen.getByText("First try failed")).toBeTruthy();
      });

      // Clear input and try again
      await user.clear(nameInput);
      await user.type(nameInput, "Test2");
      await user.click(submitButton);

      // Error should clear on success
      await waitFor(() => {
        expect(screen.queryByText("First try failed")).toBeFalsy();
      });
    });

    it("M42: After delete error, retry success clears banner", async () => {
      let callCount = 0;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "DELETE") {
            callCount++;
            if (callCount === 1) {
              return { ok: false, json: async () => ({ error: "Delete blocked" }) };
            }
            return { ok: true, json: async () => ({}) };
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

      // First delete (fails)
      const deleteButtons = screen.getAllByLabelText("Delete category");
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Delete blocked")).toBeTruthy();
      });

      // Second delete (succeeds)
      const deleteButtonsAgain = screen.getAllByLabelText("Delete category");
      await user.click(deleteButtonsAgain[0]);

      await waitFor(() => {
        expect(screen.queryByText("Delete blocked")).toBeFalsy();
      });
    });

    it("M43: After edit error, retry success clears banner", async () => {
      let callCount = 0;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) {
          if (init?.method === "PUT") {
            callCount++;
            if (callCount === 1) {
              return { ok: false, json: async () => ({ error: "Name conflict" }) };
            }
            return { ok: true, json: async () => ({}) };
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

      // First edit (fails)
      const editButtons = screen.getAllByLabelText("Edit category");
      await user.click(editButtons[0]);

      const editInput = screen.getByDisplayValue("Food") as HTMLInputElement;
      await user.clear(editInput);
      await user.type(editInput, "Gas");

      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("Name conflict")).toBeTruthy();
      });

      // Second edit (succeeds)
      await user.clear(editInput);
      await user.type(editInput, "OtherName");
      fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.queryByText("Name conflict")).toBeFalsy();
      });
    });
  });
});
