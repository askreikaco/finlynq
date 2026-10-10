/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/transactions/new",
}));
vi.mock("swr", () => ({ mutate: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts")
      return { isLoading: false, data: [
        { id: 1, name: "Checking", currency: "USD", archived: false },
        { id: 2, name: "Savings", currency: "USD", archived: false },
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
const mk = (o: Record<string, unknown> = {}) => ({
  v: 1, amount: "150000", accountId: "2", categoryId: "20", payee: "ACME", note: "N1",
  tags: "t1,t2", isBusiness: true, txType: "Income", ts: Date.now(), ...o,
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear(); // last-used account and recent picks persist per browser
  window.history.replaceState({}, "", "/transactions/new");
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 99 }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function saveAndGetPayload(type: string) {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  // First POST to /api/transactions (the page also GETs active currencies on mount).
  const post = fetchMock.mock.calls.find((c: unknown[]) => c[0] === "/api/transactions" && (c[1] as RequestInit | undefined)?.method === "POST");
  return JSON.parse(String((post![1] as RequestInit).body));
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

describe("page prefill", () => {
  it("applies all fields once on mount, clears storage, date today", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk({ ts: Date.now() })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.getByRole("heading", { name: "New Income" })).toBeTruthy();
    expect(screen.queryByText(/Prefill data expired/)).toBeNull();
    const p = await saveAndGetPayload("Income");
    expect(p).toMatchObject({ enteredAmount: 150000, categoryId: 20, payee: "ACME", note: "N1", tags: "t1,t2", isBusiness: 1, date: today() });
  });
  it("expense type signs negative", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk({ txType: "Expense", categoryId: "10" })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    const p = await saveAndGetPayload("Expense");
    expect(p.enteredAmount).toBe(-150000);
  });
  it("date is today even if source differs (prefill has no date)", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...mk(), date: "2001-01-01" }));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    const p = await saveAndGetPayload("Income");
    expect(p.date).toBe(today());
  });
  it("expired -> notice, form empty", () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk({ ts: Date.now() - 3 * 60000 })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    expect(screen.getByText(/Prefill data expired or invalid/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "New Expense" })).toBeTruthy();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
  it("malformed -> notice", () => {
    sessionStorage.setItem(KEY, "{nope");
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    expect(screen.getByText(/Prefill data expired or invalid/)).toBeTruthy();
  });
  it("wrong version -> notice", () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk({ v: 2 })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    expect(screen.getByText(/Prefill data expired or invalid/)).toBeTruthy();
  });
  it("prefill=1 but nothing stored -> notice", () => {
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    expect(screen.getByText(/Prefill data expired or invalid/)).toBeTruthy();
  });
  it("legacy: no prefill, no query -> untouched, no notice, storage not touched", () => {
    render(<Page />);
    expect(screen.queryByText(/Prefill data/)).toBeNull();
    expect(screen.getByRole("heading", { name: "New Expense" })).toBeTruthy();
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("");
  });
  it("legacy: stale storage but no ?prefill query -> data still consumed/applied (documents behaviour)", () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    render(<Page />);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.getByRole("heading", { name: "New Income" })).toBeTruthy();
  });
  it("StrictMode: data survives 2nd mount, applied once, NO spurious notice", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<React.StrictMode><Page /></React.StrictMode>);
    expect(screen.getByRole("heading", { name: "New Income" })).toBeTruthy();
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("150000");
    const p = await saveAndGetPayload("Income");
    expect(p.payee).toBe("ACME");
    expect(p.enteredAmount).toBe(150000);
  });
  it("KNOWN-BUG A: StrictMode shows no spurious notice", () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<React.StrictMode><Page /></React.StrictMode>);
    expect(screen.queryByText(/Prefill data expired/)).toBeNull();
  });
  it("KNOWN-BUG B: prefilled account is not clobbered by auto-select (warm SWR cache)", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk({ accountId: "2" })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    const p = await saveAndGetPayload("Income");
    expect(p.accountId).toBe(2);
  });
  it("remount (fresh navigation) after consumption does not re-apply", () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    const r = render(<Page />);
    r.unmount();
    render(<Page />);
    expect(screen.getByRole("heading", { name: "New Expense" })).toBeTruthy();
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("");
  });
});
