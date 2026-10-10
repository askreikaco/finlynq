/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/transactions/new" }));
vi.mock("swr", () => ({ mutate: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
const st: { accounts: any[] } = { accounts: [] };
const ACC = [
  { id: 1, name: "Checking", currency: "USD", archived: false },
  { id: 2, name: "Savings", currency: "USD", archived: false },
];
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts") return { isLoading: false, data: st.accounts };
    if (url === "/api/categories") return { isLoading: false, data: [{ id: 10, name: "Food", type: "E" }, { id: 20, name: "Salary", type: "I" }] };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));
import Page from "@/app/(app)/transactions/new/page";
const KEY = "finlynq:tx-prefill";
const mk = (o: any = {}) => ({ v: 1, amount: "150000", accountId: "2", categoryId: "20", payee: "ACME", note: "N1", tags: "", isBusiness: false, txType: "Income", ts: Date.now(), ...o });
let fetchMock: any;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); window.history.replaceState({}, "", "/transactions/new"); st.accounts = ACC;
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 99 }) })); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function save(type: string) {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  // First POST to /api/transactions (the page also GETs active currencies on mount).
  const post = fetchMock.mock.calls.find((c: unknown[]) => c[0] === "/api/transactions" && (c[1] as RequestInit | undefined)?.method === "POST");
  return JSON.parse(String((post![1] as RequestInit).body));
}
describe("account selection", () => {
  it("R1 no prefill, accounts at mount -> first account shown", () => {
    render(<Page />);
    expect(screen.queryByText("Checking")).toBeTruthy();
    expect(screen.queryByText("Savings")).toBeNull();
  });
  it("R2 no prefill, accounts load AFTER mount -> first account selected", () => {
    st.accounts = [];
    const r = render(<Page />);
    expect(screen.queryByText("Checking")).toBeNull();
    st.accounts = ACC;
    r.rerender(<Page />);
    expect(screen.queryByText("Checking")).toBeTruthy();
  });
  it("R3 prefill, accounts at mount -> prefilled acc 2 kept (payload)", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    expect(screen.queryByText("Savings")).toBeTruthy();
    expect((await save("Income")).accountId).toBe(2);
  });
  it("R4 prefill, accounts load AFTER mount -> prefilled acc 2 kept", async () => {
    st.accounts = [];
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    const r = render(<Page />);
    st.accounts = ACC;
    r.rerender(<Page />);
    expect((await save("Income")).accountId).toBe(2);
  });
  it("R5 StrictMode + prefill + accounts at mount -> acc 2 kept, no notice", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<React.StrictMode><Page /></React.StrictMode>);
    expect(screen.queryByText(/Prefill data expired/)).toBeNull();
    expect((await save("Income")).accountId).toBe(2);
  });
  it("R6 StrictMode + prefill + accounts AFTER mount -> acc 2 kept", async () => {
    st.accounts = [];
    sessionStorage.setItem(KEY, JSON.stringify(mk()));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    const r = render(<React.StrictMode><Page /></React.StrictMode>);
    st.accounts = ACC;
    r.rerender(<React.StrictMode><Page /></React.StrictMode>);
    expect((await save("Income")).accountId).toBe(2);
  });
  it("R8 ?account=2 (no prefill) -> account 2 preselected", () => {
    window.history.replaceState({}, "", "/transactions/new?account=2");
    render(<Page />);
    expect(screen.queryByText("Savings")).toBeTruthy();
    expect(screen.queryByText("Checking")).toBeNull();
  });
  it("R10 ?account=999 (unknown id) -> falls back to first account", () => {
    window.history.replaceState({}, "", "/transactions/new?account=999");
    render(<Page />);
    expect(screen.queryByText("Checking")).toBeTruthy();
    expect(screen.queryByText("Savings")).toBeNull();
  });
  it("R7 invalid prefill (expired) -> notice AND first account auto-selected", () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk({ ts: 1 })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    expect(screen.queryByText(/Prefill data expired/)).toBeTruthy();
    expect(screen.queryByText("Checking")).toBeTruthy();
  });
  it("R8 prefill with first account id (1) kept (not confused with auto)", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk({ accountId: "1" })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    expect((await save("Income")).accountId).toBe(1);
  });
  it("R9 prefill accountId archived/absent -> what happens (documenting)", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(mk({ accountId: "99" })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await new Promise(r => setTimeout(r, 50));
    console.log("R9 fetch calls:", fetchMock.mock.calls.length, fetchMock.mock.calls[0] && fetchMock.mock.calls[0][1]?.body);
  });
});
