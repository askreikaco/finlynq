/**
 * @vitest-environment jsdom
 *
 * Post now (Repeat + Installment phase 2a): /transactions/new?subscription=<id>&occurrence=<date>
 * prefills from the subscription, hides the Repeat pill, sends subscriptionId + occurrenceDate,
 * maps the 409s and returns to the right page with the subscription keys revalidated.
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
  useApi: (url: string | null) => {
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
    if (url === "/api/subscriptions")
      return { isLoading: false, data: [
        { id: 7, name: "Gym", amount: 40, currency: "EUR", categoryId: 10, accountId: 2, nextDate: "2026-06-10", status: "active" },
        { id: 8, name: "Pension", amount: 300, currency: "USD", categoryId: 20, accountId: 1, nextDate: "2026-06-10", status: "active" },
      ] };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import Page from "@/app/(app)/transactions/new/page";

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
        ? { status: 201, body: { id: 99, currency: "EUR", amount: -40, enteredAmount: -40 } }
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
  window.history.replaceState({}, "", "/");
});

const posts = () => calls.filter((c) => c.method === "POST");
async function mount(query = "subscription=7&occurrence=2026-06-10") {
  window.history.replaceState({}, "", `/transactions/new?${query}`);
  render(<Page />);
  await screen.findByTestId("txnew-row-date");
}
const save = () => fireEvent.click(screen.getByTestId("txnew-save"));

describe("Post now entry mode", () => {
  it("prefills payee, amount, category, account, currency and the due date; shows the muted line", async () => {
    await mount();
    await waitFor(() => expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-06-10"));
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toMatch(/40/);
    expect((screen.getByRole("textbox", { name: /payee/i }) as HTMLInputElement).value).toBe("Gym");
    expect(screen.getByTestId("txnew-post-line").textContent).toBe("Posting Gym due 10 Jun 2026");
    expect(screen.getByTestId("txnew-row-category").textContent).toMatch(/Food/);
    expect(screen.getByTestId("txnew-row-account").textContent).toMatch(/Savings/);
  });

  it("hides the Repeat pill and disables Transfer", async () => {
    await mount();
    expect(screen.queryByTestId("txnew-repeat-pill")).toBeNull();
    expect((screen.getByRole("radio", { name: "Transfer" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an income-category subscription opens as Income", async () => {
    await mount("subscription=8&occurrence=2026-06-10");
    await waitFor(() => expect(screen.getByRole("radio", { name: "Income" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("Save sends subscriptionId + occurrenceDate (and the possibly edited date), then returns with subscription keys revalidated", async () => {
    await mount();
    await waitFor(() => expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-06-10"));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-12" } });
    save();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].url).toBe("/api/transactions");
    expect(posts()[0].body).toMatchObject({
      date: "2026-06-12", accountId: 2, categoryId: 10, enteredCurrency: "EUR", enteredAmount: -40, payee: "Gym",
      subscriptionId: 7, occurrenceDate: "2026-06-10",
    });
    expect(posts()[0].body).not.toHaveProperty("repeat");
    const filters = H.mutate.mock.calls.map((c) => c[0]).filter((a) => typeof a === "function");
    expect(filters.some((f: (k: string) => boolean) => f("/api/subscriptions") && !f("/api/accounts"))).toBe(true);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"), { timeout: 3000 });
  });

  it("returns to the page named by ?return= (same-origin paths only)", async () => {
    await mount("subscription=7&occurrence=2026-06-10&return=/subscriptions");
    await waitFor(() => expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-06-10"));
    save();
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/subscriptions"), { timeout: 3000 });
  });

  it("ignores an off-site ?return= and malformed params", async () => {
    await mount("subscription=7&occurrence=2026-06-10&return=//evil.example");
    await waitFor(() => expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-06-10"));
    save();
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"), { timeout: 3000 });
    cleanup();
    await mount("subscription=abc&occurrence=soon");
    expect(screen.queryByTestId("txnew-post-line")).toBeNull();
    expect(screen.getByTestId("txnew-repeat-pill")).toBeTruthy();
  });

  it("maps already_posted and occurrence_not_due to plain messages and stays on the page", async () => {
    await mount();
    await waitFor(() => expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-06-10"));
    replies["POST /api/transactions"] = { status: 409, body: { code: "already_posted", error: "x" } };
    save();
    await waitFor(() => expect(screen.getByText("This payment was already posted.")).toBeTruthy());
    expect(H.push).not.toHaveBeenCalled();
    replies["POST /api/transactions"] = { status: 409, body: { code: "occurrence_not_due", error: "x" } };
    save();
    await waitFor(() => expect(screen.getByText(/no longer due/)).toBeTruthy());
  });

  it("a plain /transactions/new has no post line and still shows the Repeat pill", async () => {
    await mount("account=1");
    expect(screen.queryByTestId("txnew-post-line")).toBeNull();
    expect(screen.getByTestId("txnew-repeat-pill")).toBeTruthy();
  });
});
