/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

const H = vi.hoisted(() => ({ push: vi.fn(), search: "", goalId: "7" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.goalId }),
  usePathname: () => "/goals/new",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD", "VND"] }));
// Combobox is a base-ui popover; drive it as a plain input so the test can pick an account by id.
vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ value, onValueChange, placeholder }: { value: string; onValueChange: (v: string) => void; placeholder?: string }) =>
    React.createElement("input", {
      "aria-label": "account-picker",
      placeholder,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value),
    }),
}));

import NewGoalRoute from "@/app/(app)/goals/new/page";
import EditGoalRoute from "@/app/(app)/goals/[id]/edit/page";

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let postStatus = 201;
let goalsList: unknown[] = [];

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const GOAL = {
  id: 7, name: "Trip", type: "savings", targetAmount: 1000, currentAmount: 250, currency: "USD",
  deadline: "2027-01-31", accountIds: [3], accounts: ["Bank"], accountName: "Bank",
  priority: 2, status: "active", progress: 25, remaining: 750, monthlyNeeded: 0, note: "summer",
};

beforeEach(() => {
  calls = [];
  postStatus = 201;
  goalsList = [GOAL];
  H.search = "";
  H.goalId = "7";
  H.push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/accounts") return json([{ id: 3, name: "Bank" }, { id: 4, name: "Cash" }]);
      if (url === "/api/goals" && (!init?.method || init.method === "GET")) return json(goalsList);
      if (url === "/api/goals" && init?.method === "POST") {
        return json(postStatus === 201 ? { id: 99 } : { error: "Goal name taken" }, postStatus);
      }
      if (url === "/api/goals" && init?.method === "PUT") return json({ ok: true });
      if (url.startsWith("/api/goals?id=") && init?.method === "DELETE") return json({ ok: true });
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callsTo = (method: string, url = "/api/goals") =>
  calls.filter((c) => c.url === url && c.init?.method === method);
const nameInput = (c: HTMLElement) => c.querySelector('input[placeholder="e.g. Emergency Fund"]') as HTMLInputElement;
const amountInput = (c: HTMLElement) => c.querySelector('input[type="number"]') as HTMLInputElement;

describe("New goal page: fields and prefill", () => {
  it("renders the page heading, the form fields and the Create button", () => {
    render(<NewGoalRoute />);
    expect(screen.getByRole("heading", { level: 1, name: "New financial goal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Goal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("prefills the name and type from the empty-state chip query", () => {
    H.search = "name=Emergency%20Fund&type=emergency_fund";
    const { container } = render(<NewGoalRoute />);
    expect(nameInput(container).value).toBe("Emergency Fund");
  });

  it("ignores an unknown type in the query and falls back to savings", () => {
    H.search = "name=X&type=bogus";
    const { container } = render(<NewGoalRoute />);
    expect(nameInput(container).value).toBe("X");
    expect(screen.getByText("Savings")).toBeTruthy();
  });

  it("loads accounts for the linked-account picker", async () => {
    render(<NewGoalRoute />);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/accounts")).toBe(true));
  });
});

describe("New goal page: validation and save", () => {
  it("blocks submit while the name is empty", () => {
    const { container } = render(<NewGoalRoute />);
    fireEvent.change(amountInput(container), { target: { value: "500" } });
    const create = screen.getByRole("button", { name: "Create Goal" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(callsTo("POST")).toHaveLength(0);
  });

  it("POSTs the same payload shape as the old dialog, then returns to the goals list", async () => {
    const { container } = render(<NewGoalRoute />);
    fireEvent.change(nameInput(container), { target: { value: "  Trip  " } });
    fireEvent.change(amountInput(container), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Goal" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/goals"));
    const posts = callsTo("POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({
      name: "  Trip  ",
      type: "savings",
      targetAmount: 1000,
      currency: "USD",
      deadline: null,
      accountIds: [],
      priority: 1,
      note: "",
    });
  });

  it("shows the server error and stays on the page when the POST fails", async () => {
    postStatus = 409;
    const { container } = render(<NewGoalRoute />);
    fireEvent.change(nameInput(container), { target: { value: "Trip" } });
    fireEvent.change(amountInput(container), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Goal" }));
    expect(await screen.findByText("Goal name taken")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("New goal page: returnTo", () => {
  it("uses a same-app returnTo for Back and Cancel", () => {
    H.search = "returnTo=/portfolio";
    render(<NewGoalRoute />);
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/portfolio");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(H.push).toHaveBeenCalledWith("/portfolio");
  });

  it("after a successful create, navigates to a valid returnTo", async () => {
    H.search = "returnTo=/portfolio";
    const { container } = render(<NewGoalRoute />);
    fireEvent.change(nameInput(container), { target: { value: "Trip" } });
    fireEvent.change(amountInput(container), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Goal" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/portfolio"));
  });

  it.each(["//evil.example/x", "https://evil.example", "javascript:alert(1)", "/\\evil"])(
    "rejects returnTo %s and falls back to /goals",
    async (bad) => {
      H.search = "returnTo=" + encodeURIComponent(bad);
      const { container } = render(<NewGoalRoute />);
      fireEvent.change(nameInput(container), { target: { value: "Trip" } });
      fireEvent.change(amountInput(container), { target: { value: "1000" } });
      fireEvent.click(screen.getByRole("button", { name: "Create Goal" }));
      await waitFor(() => expect(H.push).toHaveBeenCalledWith("/goals"));
      expect(H.push).not.toHaveBeenCalledWith(bad);
      expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/goals");
    },
  );
});

describe("Edit goal page", () => {
  it("loads the goal by id and prefills the form", async () => {
    const { container } = render(<EditGoalRoute />);
    await waitFor(() => expect(nameInput(container)?.value).toBe("Trip"));
    expect(screen.getByRole("heading", { level: 1, name: "Edit goal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeTruthy();
  });

  it("PUTs the goal id with the same payload shape as the old edit dialog", async () => {
    const { container } = render(<EditGoalRoute />);
    await waitFor(() => expect(nameInput(container)?.value).toBe("Trip"));
    fireEvent.change(nameInput(container), { target: { value: "Trip 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/goals"));
    const puts = callsTo("PUT");
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String(puts[0].init?.body))).toEqual({
      name: "Trip 2",
      type: "savings",
      targetAmount: 1000,
      currency: "USD",
      deadline: "2027-01-31",
      accountIds: [3],
      priority: 2,
      note: "summer",
      id: 7,
    });
  });

  it("deletes after the confirm dialog and returns to the goals list", async () => {
    const { container } = render(<EditGoalRoute />);
    await waitFor(() => expect(nameInput(container)?.value).toBe("Trip"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/goals"));
    expect(calls.some((c) => c.url === "/api/goals?id=7" && c.init?.method === "DELETE")).toBe(true);
  });

  it("says the goal no longer exists when the id is not in the list", async () => {
    H.goalId = "404";
    render(<EditGoalRoute />);
    expect(await screen.findByText(/no longer exists/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
