/**
 * @vitest-environment jsdom
 *
 * Golden payloads: the SAME loaded row and the SAME user edits are saved through the OLD edit form
 * (TransactionEditForm) and through the entry screen in edit mode. Every request they send must be equal.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const ROUTER = { push: H.push, replace: H.replace, back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/transactions/7/edit",
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: vi.fn(async () => undefined), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/lib/transactions/revalidate", () => ({ revalidateTransactionLists: vi.fn(async () => undefined) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD", "EUR", "CAD"] }));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "golden-user", ready: true }),
}));

const ACCOUNTS: any[] = [
  { id: 1, name: "Checking", currency: "USD", archived: false },
  { id: 2, name: "Savings", currency: "USD", archived: false },
  { id: 5, name: "Maple", currency: "CAD", archived: false },
];
const CATS: any[] = [
  { id: 1, name: "Food", type: "E", group: "g" },
  { id: 2, name: "Salary", type: "I", group: "g" },
  { id: 3, name: "Transfers", type: "R", group: "g" },
];
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts") return { isLoading: false, data: ACCOUNTS };
    if (url === "/api/categories") return { isLoading: false, data: CATS };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import { TransactionEditForm } from "@/app/(app)/transactions/_components/transaction-edit-form";
import { TransactionEntryScreen } from "@/components/transactions/entry/transaction-entry-screen";
import { canEditInEntryScreen } from "@/lib/transactions/edit-flow";
import { toEntryMode } from "@/lib/transactions/entry-mode";

const base = {
  id: 7, date: "2026-01-01", accountId: 1, categoryId: 1, currency: "USD", amount: -25, enteredAmount: -25, enteredCurrency: "USD",
  quantity: null, portfolioHolding: null, note: "lunch note", payee: "Cafe", tags: "", isBusiness: 0, linkId: null,
};
type Req = { method: string; path: string; body: unknown };
let reqs: Req[] = [];
function stubFetch(splits: any[]) {
  reqs = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const method = init?.method ?? "GET";
    if (method !== "GET") reqs.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const body = path === "/api/transactions/splits" && method === "GET" ? splits : path === "/api/transactions" && method === "PUT" ? { id: 7 } : {};
    return { ok: true, status: 200, json: async () => body, clone() { return this; } };
  }));
}
beforeEach(() => {
  H.push.mockClear();
  localStorage.clear();
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

interface Case {
  name: string;
  state: any;
  splits?: any[];
  /** Edits applied through each UI (the old form types the signed amount, the entry screen the magnitude). */
  old?: (c: HTMLElement) => void;
  neu?: () => void;
}
const typeIn = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

const cases: Case[] = [
  { name: "expense, untouched", state: { kind: "transaction-edit", tx: base, linkedSiblings: [] } },
  {
    name: "income with tags and business",
    state: { kind: "transaction-edit", tx: { ...base, categoryId: 2, amount: 900, enteredAmount: 900, tags: "x,y", isBusiness: 1 }, linkedSiblings: [] },
  },
  {
    name: "multi-currency (entered EUR on a USD account)",
    state: { kind: "transaction-edit", tx: { ...base, amount: -27, enteredAmount: -25, enteredCurrency: "EUR" }, linkedSiblings: [] },
  },
  {
    name: "edited payee and amount",
    state: { kind: "transaction-edit", tx: base, linkedSiblings: [] },
    old: () => { typeIn(screen.getByDisplayValue("Cafe"), "Bistro"); typeIn(screen.getByPlaceholderText("-50.00"), "-31.75"); },
    neu: () => { typeIn(document.getElementById("txnew-payee")!, "Bistro"); typeIn(screen.getByLabelText("Amount"), "31.75"); },
  },
  {
    name: "cleared payee and note",
    state: { kind: "transaction-edit", tx: base, linkedSiblings: [] },
    old: () => { typeIn(screen.getByDisplayValue("Cafe"), ""); typeIn(screen.getByDisplayValue("lunch note"), ""); },
    neu: () => { typeIn(document.getElementById("txnew-payee")!, ""); typeIn(document.getElementById("txnew-note")!, ""); },
  },
  {
    name: "stored splits (saved again)",
    state: { kind: "transaction-edit", tx: { ...base, amount: -50, enteredAmount: -50 }, linkedSiblings: [] },
    splits: [{ categoryId: 1, amount: -20, note: "a" }, { categoryId: 1, amount: -30, note: "" }],
  },
  {
    name: "transfer, same currency",
    state: {
      kind: "transfer-edit", linkId: "L-1",
      debit: { ...base, id: 1, categoryId: 3, amount: -100, enteredAmount: -100, note: "rent", linkId: "L-1" },
      credit: { ...base, id: 2, accountId: 2, categoryId: 3, amount: 100, enteredAmount: 100, note: "rent", linkId: "L-1" },
    },
  },
  {
    name: "transfer with tags, edited amount",
    state: {
      kind: "transfer-edit", linkId: "L-1",
      debit: { ...base, id: 1, categoryId: 3, amount: -100, enteredAmount: -100, note: "", tags: "t1", linkId: "L-1" },
      credit: { ...base, id: 2, accountId: 2, categoryId: 3, amount: 100, enteredAmount: 100, note: "", tags: "t1", linkId: "L-1" },
    },
    old: () => typeIn(screen.getByPlaceholderText("100.00"), "75"),
    neu: () => typeIn(screen.getByLabelText("Amount"), "75"),
  },
  {
    name: "transfer, cross currency (booked received amount kept)",
    state: {
      kind: "transfer-edit", linkId: "L-1",
      debit: { ...base, id: 1, categoryId: 3, amount: -100, enteredAmount: -100, note: "fx", linkId: "L-1" },
      credit: { ...base, id: 2, accountId: 5, categoryId: 3, currency: "CAD", amount: 131.5, enteredAmount: 100, enteredCurrency: "USD", note: "fx", linkId: "L-1" },
    },
  },
];

describe("golden payloads: old edit form vs entry screen in edit mode", () => {
  it.each(cases)("$name", async (c) => {
    // The case must actually open in the entry screen, or this comparison is meaningless.
    const splits = c.splits ?? [];
    expect(canEditInEntryScreen(c.state, { accounts: ACCOUNTS, categories: CATS, splits })).toBe(true);

    // OLD
    stubFetch(splits);
    const old = render(
      <TransactionEditForm initialState={c.state} accounts={ACCOUNTS} categories={CATS} holdings={[]} returnTo="/transactions" />,
    );
    if (c.splits) await screen.findByDisplayValue("-20"); // old form renders stored splits asynchronously
    await new Promise((r) => setTimeout(r, 20));
    c.old?.(old.container);
    fireEvent.submit(document.getElementById("transaction-edit-form")!);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    const oldReqs = reqs;
    cleanup();
    H.push.mockClear();

    // NEW
    stubFetch(splits);
    render(<TransactionEntryScreen mode={toEntryMode(c.state, splits.map((s) => s), "/transactions")} />);
    await new Promise((r) => setTimeout(r, 20));
    c.neu?.();
    fireEvent.click(screen.getByTestId("txnew-save"));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    const newReqs = reqs;

    expect(oldReqs.length).toBeGreaterThan(0);
    expect(oldReqs.some((r) => r.method === "PUT")).toBe(true);
    if (c.splits) expect(newReqs.some((r) => r.path === "/api/transactions/splits" && r.method === "POST")).toBe(true);
    // Same endpoints, methods, bodies, in the same order (list-refresh GETs are not part of the comparison).
    expect(newReqs).toEqual(oldReqs);
  });
});
