/**
 * @vitest-environment jsdom
 *
 * Repeat + Installment on the New Transaction screen: pill states, save payloads, validation, error mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({ mutate: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, back: vi.fn() }),
  usePathname: () => "/transactions/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement("a", { href }, children),
}));
vi.mock("swr", () => ({ mutate: H.mutate, useSWRConfig: () => ({ mutate: H.mutate, cache: new Map() }) }));
vi.mock("@/lib/transactions/revalidate", () => ({ revalidateTransactionLists: vi.fn(async () => undefined) }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD", "EUR"] }));
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts")
      return { isLoading: false, data: [
        { id: 1, name: "Checking", currency: "USD", archived: false },
        { id: 2, name: "Savings", currency: "EUR", archived: false },
      ] };
    if (url === "/api/categories")
      return { isLoading: false, data: [
        { id: 10, name: "Food", type: "E" },
        { id: 20, name: "Salary", type: "I" },
      ] };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import Page from "@/app/(app)/transactions/new/page";

const KEY = "finlynq:tx-prefill";
function seed(over: Record<string, unknown> = {}) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      v: 1, amount: "500", accountId: "1", categoryId: "10", payee: "Landlord", note: "",
      tags: "", isBusiness: false, txType: "Expense", ts: Date.now(), ...over,
    }),
  );
  window.history.replaceState({}, "", "/transactions/new?prefill=1");
}

type Reply = { status: number; body: unknown };
let calls: Array<{ url: string; method: string; body: any }>;
let replies: Record<string, Reply>;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  H.mutate.mockReset();
  H.push.mockReset();
  calls = [];
  replies = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = replies[`${method} ${url}`] ?? (method === "POST"
        ? { status: 201, body: url.endsWith("/installments") ? { installmentGroupId: "g", count: 6, ids: [1, 2, 3, 4, 5, 6] } : { id: 99, currency: "USD", amount: -500, enteredAmount: -500 } }
        : { status: 200, body: { active: ["USD", "EUR"] } });
      return { ok: r.status < 300, status: r.status, json: async () => r.body, clone() { return this; } };
    }),
  );
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (Element.prototype as any).scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const posts = () => calls.filter((c) => c.method === "POST");
async function mount(over: Record<string, unknown> = {}) {
  seed(over);
  render(<Page />);
  await screen.findByTestId("txnew-row-date");
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2027-01-10" } });
}
const pill = () => screen.getByTestId("txnew-repeat-pill") as HTMLButtonElement;
const openSheet = () => fireEvent.click(pill());
const done = () => fireEvent.click(screen.getByRole("button", { name: "Done" }));
const save = () => fireEvent.click(screen.getByTestId("txnew-save"));

describe("Repeat pill on the Date row", () => {
  it("sits on the Date row, labelled Repeat, on a new Expense and Income", async () => {
    await mount();
    expect(screen.getByTestId("txnew-row-date").contains(pill())).toBe(true);
    expect(pill().textContent).toBe("Repeat");
    fireEvent.click(screen.getByRole("radio", { name: "Income" }));
    expect(screen.getByTestId("txnew-repeat-pill")).toBeTruthy();
  });

  it("is hidden for Transfer, and a chosen series is cleared on the way", async () => {
    await mount();
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    done();
    expect(pill().textContent).toBe("Monthly");
    fireEvent.click(screen.getByRole("radio", { name: "Transfer" }));
    expect(screen.queryByTestId("txnew-repeat-pill")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Expense" }));
    expect(pill().textContent).toBe("Repeat");
  });

  it("is disabled with an explanatory title while splits are on", async () => {
    await mount({ amount: "100" });
    fireEvent.click(screen.getByTestId("txnew-more"));
    fireEvent.click(screen.getByRole("button", { name: "Increase splits" }));
    expect(pill().disabled).toBe(true);
    expect(pill().title).toMatch(/splits/i);
    fireEvent.click(screen.getByRole("button", { name: "Decrease splits" }));
    expect(pill().disabled).toBe(false);
  });

  it("shows the summary after Done and clears through the sheet's Never", async () => {
    await mount();
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Every 2 weeks" }));
    fireEvent.click(screen.getByRole("radio", { name: "After N times" }));
    done();
    expect(pill().textContent).toBe("Every 2 weeks · 12×");
    expect(pill().getAttribute("aria-label")).toBe("Repeat: Every 2 weeks · 12×");
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Never" }));
    expect(pill().textContent).toBe("Repeat");
  });

  it("shows an installment summary", async () => {
    await mount();
    openSheet();
    fireEvent.click(screen.getByRole("radio", { name: "Installment" }));
    done();
    expect(pill().textContent).toBe("6 installments");
  });
});

describe("Save: repeat", () => {
  it("adds repeat to the single POST body (expense is negative, entered currency kept)", async () => {
    await mount();
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Last day of month" }));
    fireEvent.click(screen.getByRole("radio", { name: "Until date" }));
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2027-12-31" } });
    done();
    save();
    await waitFor(() => expect(posts()).toHaveLength(1));
    const p = posts()[0];
    expect(p.url).toBe("/api/transactions");
    expect(p.body).toMatchObject({
      date: "2027-01-10", accountId: 1, categoryId: 10, enteredCurrency: "USD", enteredAmount: -500, payee: "Landlord",
      repeat: { frequency: "monthly_eom", end: { type: "until", date: "2027-12-31" } },
    });
    await waitFor(() => expect(screen.getByText("Expense saved successfully!")).toBeTruthy());
    // subscription lists are refreshed
    const filters = H.mutate.mock.calls.map((c) => c[0]).filter((a) => typeof a === "function");
    expect(filters.some((f: (k: string) => boolean) => f("/api/subscriptions") && !f("/api/accounts"))).toBe(true);
  });

  it("income keeps a positive amount; an entered currency other than the account's is sent", async () => {
    await mount({ txType: "Income", categoryId: "20" });
    fireEvent.click(screen.getByRole("button", { name: "Currency" }));
    fireEvent.click(await screen.findByRole("button", { name: /EUR/ }));
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Annually" }));
    fireEvent.click(screen.getByRole("radio", { name: "After N times" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease times" }));
    done();
    save();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toMatchObject({
      enteredAmount: 500, enteredCurrency: "EUR", repeat: { frequency: "annual", end: { type: "count", count: 11 } },
    });
  });

  it("without a series the POST body has no repeat", async () => {
    await mount();
    save();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).not.toHaveProperty("repeat");
    expect(posts()[0].url).toBe("/api/transactions");
  });

  it("a repeat without a payee shows the inline error and posts nothing", async () => {
    await mount({ payee: "" });
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    done();
    save();
    expect(await screen.findByText("Repeat needs a payee")).toBeTruthy();
    expect(posts()).toHaveLength(0);
    // typing a payee clears it
    fireEvent.change(screen.getByLabelText("Payee"), { target: { value: "ACME" } });
    expect(screen.queryByText("Repeat needs a payee")).toBeNull();
    save();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body.payee).toBe("ACME");
  });

  it.each([
    [400, { code: "repeat_requires_payee", error: "x" }, "Repeat needs a payee"],
    [400, { code: "repeat_end_before_first", error: "x" }, "The repeat end date is before the first repeat. Pick a later date."],
    [400, { code: "repeat_not_supported", error: "x" }, "Repeat is not available for this kind of transaction."],
    [409, { code: "repeat_subscription_name_conflict", error: "x" }, "A different subscription with this payee name already exists. Edit or rename it first."],
    [409, { code: "fx-currency-needs-override", currency: "EUR", error: "x" }, "No FX rate for EUR."],
    [423, { error: "locked" }, "Unlock your data to make changes"],
  ])("maps server error %i %o", async (status, body, message) => {
    replies["POST /api/transactions"] = { status, body };
    await mount();
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    done();
    save();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message);
  });
});

describe("Save: installments", () => {
  it("POSTs to /api/transactions/installments with count and mode (expense negative)", async () => {
    await mount();
    openSheet();
    fireEvent.click(screen.getByRole("radio", { name: "Installment" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase months" }));
    fireEvent.click(screen.getByRole("radio", { name: "Each payment = amount" }));
    done();
    save();
    await waitFor(() => expect(posts()).toHaveLength(1));
    const p = posts()[0];
    expect(p.url).toBe("/api/transactions/installments");
    expect(p.body).toEqual({
      date: "2027-01-10", accountId: 1, categoryId: 10, enteredCurrency: "USD", enteredAmount: -500,
      payee: "Landlord", isBusiness: 0, count: 7, mode: "each",
    });
    expect(p.body).not.toHaveProperty("repeat");
    await waitFor(() => expect(screen.getByText("7 installments saved successfully!")).toBeTruthy());
  });

  it("income installments are positive and need no payee", async () => {
    await mount({ txType: "Income", categoryId: "20", payee: "" });
    openSheet();
    fireEvent.click(screen.getByRole("radio", { name: "Installment" }));
    done();
    save();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].url).toBe("/api/transactions/installments");
    expect(posts()[0].body).toMatchObject({ enteredAmount: 500, count: 6, mode: "split" });
    expect(screen.queryByText("Repeat needs a payee")).toBeNull();
  });

  it("an empty amount stops at the usual amount check", async () => {
    await mount({ amount: "" });
    openSheet();
    fireEvent.click(screen.getByRole("radio", { name: "Installment" }));
    expect(screen.getByTestId("installment-preview").textContent).toMatch(/Enter an amount/);
    done();
    save();
    expect(await screen.findByText("Please enter a valid amount greater than 0")).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it.each([
    [400, { code: "invalid_plan", error: "total is too small to split into that many payments" }, "total is too small to split into that many payments"],
    [409, { code: "fx-currency-needs-override", currency: "USD", error: "x" }, "No FX rate for USD."],
    [423, {}, "Unlock your data to make changes"],
  ])("maps server error %i %o", async (status, body, message) => {
    replies["POST /api/transactions/installments"] = { status, body };
    await mount();
    openSheet();
    fireEvent.click(screen.getByRole("radio", { name: "Installment" }));
    done();
    save();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message);
  });
});
