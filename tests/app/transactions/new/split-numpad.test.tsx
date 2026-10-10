/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/transactions/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("swr", () => ({ mutate: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));

vi.mock("@/components/currency-provider", () => ({
  useDisplayCurrency: () => ({ displayCurrency: "USD", setDisplayCurrency: vi.fn(), isLoading: false }),
  CurrencyProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts")
      return {
        isLoading: false,
        data: [{ id: 1, name: "Checking CAD", currency: "CAD", archived: false }],
      };
    if (url === "/api/categories")
      return {
        isLoading: false,
        data: [
          { id: 10, name: "Food", type: "E" },
          { id: 20, name: "Transport", type: "E" },
        ],
      };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import Page from "@/app/(app)/transactions/new/page";

const KEY = "finlynq:tx-prefill";
const mk = (o: Record<string, unknown> = {}) => ({
  v: 1,
  amount: "100",
  accountId: "1",
  categoryId: "10",
  payee: "",
  note: "",
  tags: "",
  isBusiness: false,
  txType: "Expense",
  ts: Date.now(),
  ...o,
});

const dock = () => screen.queryByTestId("numpad-dock");
const mainAmount = () => document.querySelector<HTMLInputElement>('input[aria-label="Amount"]')!;
const splitAmount = (n: number) => screen.getByTestId(`split-amount-${n}`) as HTMLInputElement;
const keypad = () => within(screen.getByRole("group", { name: "Amount keypad" }));

/** Opens the More details panel and types a 2-row split count. */
async function openSplitTwo() {
  fireEvent.click(screen.getByRole("button", { name: /More details/i }));
  const count = await screen.findByTestId("split-count");
  fireEvent.change(count, { target: { value: "2" } });
  await waitFor(() => expect(screen.getByTestId("split-amount-1")).toBeTruthy());
}

describe("split amounts use the shared numpad", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState({}, "", "/transactions/new");
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 99 }) }));
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("focusing an editable split amount opens the dock; the remainder never does", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());
    await openSplitTwo();

    expect(dock()).toBeNull();
    fireEvent.focus(splitAmount(1));
    expect(dock()).not.toBeNull();
    expect(screen.getAllByTestId("numpad-dock")).toHaveLength(1);

  });

  it("the remainder row never opens the dock", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());
    await openSplitTwo();

    fireEvent.focus(splitAmount(2));
    expect(dock()).toBeNull();
  });

  it("typing on the dock writes to the focused split row, live", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());
    await openSplitTwo();

    fireEvent.focus(splitAmount(1));
    fireEvent.click(keypad().getByText("4"));
    fireEvent.click(keypad().getByText("5"));
    expect(splitAmount(1).value).toBe("45");
    expect(splitAmount(2).value).toBe("55.00");
  });

  it("switching to another amount commits the pending expression to the row it was opened for", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());
    await openSplitTwo();

    fireEvent.focus(splitAmount(1));
    fireEvent.click(keypad().getByText("4"));
    fireEvent.click(keypad().getByText("5"));
    fireEvent.click(keypad().getByLabelText("Plus"));
    fireEvent.click(keypad().getByText("1"));
    fireEvent.click(keypad().getByText("2"));
    expect(splitAmount(1).value).toBe("45+12");

    // Focusing the main Amount switches the shared dock: the pending "45+12" commits to split 1.
    fireEvent.focus(mainAmount());
    expect(splitAmount(1).value).toBe("57");
    expect(splitAmount(2).value).toBe("43.00");
    expect(mainAmount().value).toBe("100");
    expect(dock()).not.toBeNull();
  });

  it("Equals evaluates a pending expression and keeps the dock open; OK then evaluates and closes", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());
    await openSplitTwo();

    fireEvent.focus(splitAmount(1));
    fireEvent.click(keypad().getByText("1"));
    fireEvent.click(keypad().getByLabelText("Plus"));
    fireEvent.click(keypad().getByText("2"));
    fireEvent.click(keypad().getByLabelText("Equals"));
    expect(splitAmount(1).value).toBe("3");
    expect(dock()).not.toBeNull();
    fireEvent.click(keypad().getByLabelText("Done"));
    expect(dock()).toBeNull();
  });

  it("split rows never show the currency chips; the main amount does", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());
    await openSplitTwo();

    fireEvent.focus(splitAmount(1));
    expect(keypad().queryByRole("group", { name: "Currency" })).toBeNull();
    expect(within(dock()!).queryByRole("group", { name: "Currency" })).toBeNull();

    fireEvent.focus(mainAmount());
    expect(within(dock()!).getByRole("group", { name: "Currency" })).toBeTruthy();
  });

  it("the main Amount still opens the same dock and writes the main amount", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());

    fireEvent.focus(mainAmount());
    expect(dock()).not.toBeNull();
    fireEvent.click(keypad().getByText("7"));
    expect(mainAmount().value).toBe("1007");
  });
});

describe("split save uses the entered currency and surfaces failures", () => {
  const splitCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.filter(([url]) => String(url) === "/api/transactions/splits");

  /** Entered USD 100 on a CAD account; the server stores 135 CAD (rate 1.35). */
  function stubSave(splitsReply: () => Promise<unknown> | unknown) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("active-currencies")) {
        return { ok: true, json: async () => ({ active: ["CAD", "USD"] }) };
      }
      if (String(url) === "/api/transactions" && init?.method === "POST") {
        return { ok: true, json: async () => ({ id: 99, currency: "CAD", amount: -135, enteredAmount: -100 }) };
      }
      if (String(url) === "/api/transactions/splits") {
        return splitsReply() as Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
      }
      return { ok: true, json: async () => ({ id: 99 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function enterUsdSplit() {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Currency" }));
    fireEvent.click(await screen.findByRole("button", { name: /^USD/ }));
    await openSplitTwo();
    fireEvent.change(splitAmount(1), { target: { value: "30" } });
    expect(splitAmount(2).value).toBe("70.00");
  }

  it("converts entered-currency split amounts to the account currency; the legs sum to the stored total", async () => {
    const fetchMock = stubSave(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    await enterUsdSplit();

    fireEvent.click(screen.getByTestId("txnew-save"));
    await waitFor(() => expect(splitCalls(fetchMock)).toHaveLength(1));

    const body = JSON.parse(String(splitCalls(fetchMock)[0][1]?.body));
    expect(body.transactionId).toBe(99);
    // Expense: negative. Ratio 135/100 = 1.35: 30 -> 40.5, last = 135 - 40.5 = 94.5.
    expect(body.splits.map((s: { amount: number }) => s.amount)).toEqual([-40.5, -94.5]);
    expect(body.splits.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0)).toBe(-135);
    // Rows inherit the main category (10).
    expect(body.splits.map((s: { categoryId: number }) => s.categoryId)).toEqual([10, 10]);
  });

  it("a failed split write shows an error (not a silent console warning) and keeps the saved transaction", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubSave(() => ({ ok: false, status: 500, json: async () => ({ error: "boom" }) }));
    await enterUsdSplit();

    fireEvent.click(screen.getByTestId("txnew-save"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Transaction saved, but the splits were not: boom");
    expect(warn).not.toHaveBeenCalledWith("Splits write failed:", expect.anything());
    warn.mockRestore();
  });
});

describe("main amount currency chips", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("active-currencies")) {
          return { ok: true, json: async () => ({ active: ["CAD", "USD"] }) };
        }
        return { ok: true, json: async () => ({ id: 99 }) };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tapping a chip switches the entered currency through the same handler and keeps the pad open", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking CAD")).toBeTruthy());
    fireEvent.focus(mainAmount());

    const chipGroup = within(dock()!).getByRole("group", { name: "Currency" });
    expect(within(chipGroup).getByRole("button", { name: "CAD" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(chipGroup).getByRole("button", { name: "USD" }));

    expect(screen.getByRole("button", { name: "Currency" }).textContent).toContain("USD");
    expect(dock()).not.toBeNull();
    expect(within(dock()!).getByRole("button", { name: "USD" }).getAttribute("aria-pressed")).toBe("true");
  });
});

