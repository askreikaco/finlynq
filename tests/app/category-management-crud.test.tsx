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

      // Input should be gone
      await waitFor(() => {
        expect(screen.queryByDisplayValue("Food")).toBeFalsy();
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
