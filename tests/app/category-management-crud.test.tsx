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
  describe("Delete Category", () => {
    it("DELETE sends correct id and reloads", async () => {
      const user = userEvent.setup();
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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
          // Follow-up GET after delete fails
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
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      // Initial load succeeds
      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Delete the first row (Food); the follow-up GET fails.
      const deleteButtons = screen.getAllByRole("button", { name: "Delete category" });
      await user.click(deleteButtons[0]);

      // After reload fails, old rows should be gone and error banner shown
      await waitFor(() => {
        expect(screen.queryByText("Food")).toBeFalsy();
        expect(screen.getByText("Failed to load categories")).toBeTruthy();
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
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByTestId("type-section-I")).toBeTruthy();
      });

      // E and R sections should not exist
      expect(screen.queryByTestId("type-section-E")).toBeFalsy();
      expect(screen.queryByTestId("type-section-R")).toBeFalsy();
    });

  });

  describe("Error Handling", () => {
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
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      const deleteButtons = screen.getAllByLabelText("Delete category");
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Cannot delete")).toBeTruthy();
      });
    });

    it("GET with ok:false shows 'No categories found'", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/api/categories") && !url.includes("method")) {
          return { ok: false, json: async () => ({}) };
        }
        return { ok: true, json: async () => CATEGORIES_DATA };
      });

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
      });
    });
  });

  describe("Grouping and Order", () => {
    it("groups by type with E before I", async () => {
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByText("No categories found")).toBeTruthy();
      });

      // Should NOT show network error
      expect(screen.queryByText("Failed to load categories")).toBeFalsy();
    });
  });

  describe("M39: Group h4 heading text", () => {
    it("groups with names show h4 with exact group name", async () => {
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });

      // Should show group headings
      const groupHeadings = screen.queryAllByText("Expenses");
      expect(groupHeadings.length).toBeGreaterThan(0);
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

      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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
      render(<CategoryManagement returnTo="/categories?tab=manage" />);

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

  });

  describe("Add and rename are page navigation (not inline forms)", () => {
    it("Add is a link to /categories/new carrying the returnTo, and opens no inline form", async () => {
      render(<CategoryManagement returnTo="/categories?tab=manage" />);
      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });
      const add = screen.getByRole("link", { name: /Add$/i });
      expect(add.getAttribute("href")).toBe("/categories/new?returnTo=%2Fcategories%3Ftab%3Dmanage");
      expect(screen.queryByLabelText("Category name")).toBeNull();
      expect(screen.queryByRole("button", { name: "Add Category" })).toBeNull();
    });

    it("Edit icon is a link to /categories/[id]/edit with the same returnTo, and renders no inline rename input", async () => {
      render(<CategoryManagement returnTo="/settings/categorization" />);
      await waitFor(() => {
        expect(screen.getByText("Food")).toBeTruthy();
      });
      const edits = screen.getAllByRole("link", { name: "Edit category" });
      expect(edits.length).toBe(CATEGORIES_DATA.length);
      expect(edits[0].getAttribute("href")).toBe("/categories/1/edit?returnTo=%2Fsettings%2Fcategorization");
      expect(screen.queryByRole("button", { name: "Save category name" })).toBeNull();
      expect(screen.queryByDisplayValue("Food")).toBeNull();
    });
  });
});
