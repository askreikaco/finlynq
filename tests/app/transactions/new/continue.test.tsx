/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, act, within } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";
import { getLastAccount } from "@/lib/transactions/recent-picks";

const H = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  mutate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/transactions/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));
vi.mock("swr", () => ({ mutate: H.mutate, useSWRConfig: () => ({ mutate: H.mutate, cache: new Map() }) }));
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts") return { isLoading: false, data: H.accounts };
    if (url === "/api/categories")
      return {
        isLoading: false,
        data: [
          { id: 10, name: "Food", type: "E", group: "Daily" },
          { id: 11, name: "Eating Out", type: "E", group: "Daily" },
        ],
      };
    return { isLoading: false, data: [] };
  },
}));

import Page from "@/app/(app)/transactions/new/page";

const KEY = "finlynq:tx-prefill";
const DEFAULT_ACCOUNTS = [
  { id: 1, name: "Checking", currency: "USD", archived: false },
  { id: 2, name: "Savings", currency: "USD", archived: false },
];

function seedPrefill(over: Record<string, unknown> = {}) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      v: 1, amount: "150", accountId: "2", categoryId: "10", payee: "ACME", note: "",
      tags: "", isBusiness: false, txType: "Expense", ts: Date.now(), ...over,
    }),
  );
  window.history.replaceState({}, "", "/transactions/new?prefill=1");
}

// Suggestion replies: `suggestion` is what the server returns; `deferSuggest` holds replies until the
// test resolves them (to exercise races).
let suggestion: { id: number; name: string } | null;
let deferSuggest: boolean;
let pendingSuggest: Array<() => void>;
let calls: { url: string; init?: RequestInit }[];

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/transactions/new");
  H.accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  H.mutate.mockReset();
  calls = [];
  suggestion = { id: 10, name: "Food" };
  deferSuggest = false;
  pendingSuggest = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/transactions/suggest") {
        const reply = () => ({
          ok: true,
          json: async () => ({ suggestion: suggestion ? { ...suggestion, type: "E" } : null }),
        });
        if (!deferSuggest) return reply();
        return new Promise((resolve) => pendingSuggest.push(() => resolve(reply())));
      }
      if (url === "/api/settings/active-currencies")
        return { ok: true, json: async () => ({ active: ["USD", "EUR"] }) };
      return { ok: true, json: async () => ({ id: 99 }) };
    }),
  );
  (Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ??= () => false;
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => {};
  (globalThis as unknown as Record<string, unknown>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const postsTo = (url: string) => calls.filter((c) => c.url === url && c.init?.method === "POST");
const bodyOf = (c: { init?: RequestInit }) => JSON.parse(String(c.init?.body));
const suggestCalls = () => postsTo("/api/transactions/suggest");
const categoryRow = () => screen.getByTestId("txnew-row-category");
const payeeInput = () => screen.getByLabelText("Payee") as HTMLInputElement;
const amountInput = () => screen.getByLabelText("Amount") as HTMLInputElement;

/** Groups start collapsed; expand the open picker sheet's collapsed group rows like a user would. */
function expandCollapsedGroups() {
  const headers = document.querySelectorAll('[data-slot="sheet-content"] [aria-expanded="false"]');
  headers.forEach((h) => fireEvent.click(h));
}

function pickCategory(name: string) {
  fireEvent.click(categoryRow());
  expandCollapsedGroups();
  const sheetItems = screen.getAllByText(name);
  fireEvent.click(sheetItems[sheetItems.length - 1]);
}

describe("Continue (Expense) and the continue toast", () => {
  it("posts once and resets amount, payee, category and note, keeping date and account", async () => {
    seedPrefill({ note: "Lunch" });
    render(<Page />);
    const dateBefore = screen.getByTestId("txnew-row-date").textContent;
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("Savings");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(postsTo("/api/transactions").length).toBe(1));
    await waitFor(() => expect(amountInput().value).toBe(""));

    const body = bodyOf(postsTo("/api/transactions")[0]);
    expect(body.enteredAmount).toBe(-150);
    expect(body.categoryId).toBe(10);
    expect(payeeInput().value).toBe("");
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("");
    expect(categoryRow().textContent).toContain("Select Category");
    expect(screen.getByTestId("txnew-row-date").textContent).toBe(dateBefore);
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("Savings");
    expect(postsTo("/api/transactions").length).toBe(1);
    expect(H.mutate).toHaveBeenCalledWith("/api/accounts");
  });

  it("the toast has role=status, names the amount and category, and disappears after 3s", async () => {
    vi.useFakeTimers();
    seedPrefill();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Flush the request chain by microtasks only (vi.waitFor would advance the fake clock).
    await act(async () => {
      for (let i = 0; i < 50; i++) await Promise.resolve();
    });
    expect(screen.getByTestId("txnew-toast")).toBeTruthy();
    const toast = screen.getByTestId("txnew-toast");
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.textContent).toBe(`Expense saved · ${formatCurrency(150, "USD")} · Food`);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.queryByTestId("txnew-toast")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("txnew-toast")).toBeNull();
  });

  it("a second Continue posts again and restarts the toast", async () => {
    seedPrefill();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByTestId("txnew-toast")).toBeTruthy());
    await waitFor(() => expect(amountInput().value).toBe(""));

    fireEvent.change(amountInput(), { target: { value: "20" } });
    pickCategory("Eating Out");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(postsTo("/api/transactions").length).toBe(2));
    expect(bodyOf(postsTo("/api/transactions")[1]).enteredAmount).toBe(-20);
    await waitFor(() => expect(screen.getByTestId("txnew-toast").textContent).toContain("Eating Out"));
  });

  it("focus returns to the amount after Continue, which opens the numpad", async () => {
    seedPrefill();
    render(<Page />);
    fireEvent.blur(amountInput());
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(postsTo("/api/transactions").length).toBe(1));
    await waitFor(() => expect(document.activeElement).toBe(amountInput()));
    expect(screen.getByTestId("numpad-dock")).toBeTruthy();
  });

  it("writes the last-used account on Continue and reads it back on remount", async () => {
    seedPrefill({ accountId: "2" });
    const first = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByTestId("txnew-toast")).toBeTruthy());
    expect(getLastAccount()).toBe("2");
    first.unmount();

    window.history.replaceState({}, "", "/transactions/new");
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("txnew-row-account").textContent).toContain("Savings"));
  });
});

describe("suggested category on Payee blur", () => {
  it("fills an empty category once on blur, marked 'Suggested'", async () => {
    render(<Page />);
    fireEvent.change(payeeInput(), { target: { value: "Pho Bo" } });
    fireEvent.blur(payeeInput());

    await waitFor(() => expect(categoryRow().textContent).toContain("Food"));
    expect(categoryRow().textContent).toContain("· Suggested");
    expect(suggestCalls().length).toBe(1);
    expect(bodyOf(suggestCalls()[0])).toEqual({ payee: "Pho Bo" });

    // The category is now set, so another blur makes no call.
    fireEvent.blur(payeeInput());
    await new Promise((r) => setTimeout(r, 10));
    expect(suggestCalls().length).toBe(1);
  });

  it("does not call for a payee shorter than 2 characters", async () => {
    render(<Page />);
    fireEvent.change(payeeInput(), { target: { value: "P" } });
    fireEvent.blur(payeeInput());
    await new Promise((r) => setTimeout(r, 10));
    expect(suggestCalls().length).toBe(0);
  });

  it("does not overwrite a category the user picked before the reply arrives", async () => {
    deferSuggest = true;
    render(<Page />);
    fireEvent.change(payeeInput(), { target: { value: "Pho Bo" } });
    fireEvent.blur(payeeInput());
    await waitFor(() => expect(pendingSuggest.length).toBe(1));

    pickCategory("Eating Out");
    await act(async () => {
      pendingSuggest.forEach((resolve) => resolve());
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(categoryRow().textContent).toContain("Eating Out");
    expect(categoryRow().textContent).not.toContain("Suggested");
  });

  it("removes the marker when the user picks another category", async () => {
    render(<Page />);
    fireEvent.change(payeeInput(), { target: { value: "Pho Bo" } });
    fireEvent.blur(payeeInput());
    await waitFor(() => expect(categoryRow().textContent).toContain("· Suggested"));

    pickCategory("Eating Out");
    expect(categoryRow().textContent).toContain("Eating Out");
    expect(categoryRow().textContent).not.toContain("Suggested");
  });

  it("ignores a reply when the payee changed while it was pending", async () => {
    deferSuggest = true;
    render(<Page />);
    fireEvent.change(payeeInput(), { target: { value: "Pho Bo" } });
    fireEvent.blur(payeeInput());
    await waitFor(() => expect(pendingSuggest.length).toBe(1));

    fireEvent.change(payeeInput(), { target: { value: "Banh Mi" } });
    await act(async () => {
      pendingSuggest.forEach((resolve) => resolve());
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(categoryRow().textContent).toContain("Select Category");
    expect(categoryRow().textContent).not.toContain("Suggested");
  });

  it("does nothing when the suggestion is not in the loaded categories", async () => {
    suggestion = { id: 999, name: "Gone" };
    render(<Page />);
    fireEvent.change(payeeInput(), { target: { value: "Pho Bo" } });
    fireEvent.blur(payeeInput());
    await waitFor(() => expect(suggestCalls().length).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(categoryRow().textContent).toContain("Select Category");
  });
});

describe("Continue does not lock the form (the Save lock applies to Save only)", () => {
  it("is not locked: a second Continue after success is accepted", async () => {
    seedPrefill();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByTestId("txnew-toast")).toBeTruthy());
    const save = within(screen.getByTestId("txnew-actions")).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });
});
