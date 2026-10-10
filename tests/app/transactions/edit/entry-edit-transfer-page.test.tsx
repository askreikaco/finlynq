/**
 * @vitest-environment jsdom
 *
 * /transactions/transfer/[linkId]/edit renders the SAME TransactionEntryScreen as New, in edit-transfer mode.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const H = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  mutate: vi.fn(async () => undefined),
  search: "returnTo=%2Ftransactions",
  linkId: "L-1",
}));

const ROUTER = { push: H.push, replace: H.replace, back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/transactions/transfer/L-1/edit",
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ linkId: H.linkId }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: H.mutate, useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/lib/transactions/revalidate", () => ({ revalidateTransactionLists: vi.fn(async () => undefined) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD", "CAD"] }));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "page-test-user", ready: true }),
}));

const ACCOUNTS = [
  { id: 1, name: "Chequing", currency: "USD", archived: false },
  { id: 2, name: "Savings", currency: "USD", archived: false },
  { id: 3, name: "Broker", currency: "USD", archived: false, isInvestment: true },
  { id: 5, name: "Maple", currency: "CAD", archived: false },
];
const CATS = [{ id: 3, name: "Transfers", type: "R", group: "g" }];
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts") return { isLoading: false, data: ACCOUNTS };
    if (url === "/api/categories") return { isLoading: false, data: CATS };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import EditTransferRoute from "@/app/(app)/transactions/transfer/[linkId]/edit/page";
import { revalidateTransactionLists } from "@/lib/transactions/revalidate";

const base = { date: "2026-02-01", categoryId: 3, quantity: null, portfolioHolding: null, payee: "", tags: "", isBusiness: 0, linkId: "L-1", note: "rent",
  createdAt: "2026-02-01T10:00:00Z", updatedAt: "2026-02-02T10:00:00Z", source: "manual" };
const debitLeg = { ...base, id: 1, accountId: 1, accountName: "Chequing", currency: "USD", amount: -100, enteredAmount: -100, enteredCurrency: "USD" };
const creditLeg = { ...base, id: 2, accountId: 2, accountName: "Savings", currency: "USD", amount: 100, enteredAmount: 100, enteredCurrency: "USD" };

type Handler = (init?: RequestInit) => unknown;
let calls: Array<{ url: string; method: string; body: any }> = [];
function stub(legs: { 1: any; 2: any } = { 1: debitLeg, 2: creditLeg }, over: Record<string, Handler | { status: number; body: unknown }> = {}) {
  const routes: Record<string, Handler | { status: number; body: unknown }> = {
    "/api/transactions/linked": () => ({ data: [legs[1], legs[2]] }),
    "PUT /api/transactions/transfer": () => ({ fromTransactionId: 1 }),
    "DELETE /api/transactions/transfer": () => ({}),
    "/api/transactions/splits": () => [],
    "/api/accounts": () => ACCOUNTS,
    "/api/categories": () => CATS,
    "/api/portfolio": () => [],
    "/api/fx/preview": () => ({ rate: 1.35, source: "test", converted: 135, date: "2026-02-01" }),
    ...over,
  };
  calls = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    let h: any = routes[`${method} ${path}`] ?? routes[url] ?? routes[path];
    if (!h && path === "/api/transactions" && url.includes("id=")) h = () => ({ data: [legs[Number(url.split("id=")[1]) as 1 | 2]] });
    const out: any = typeof h === "function" ? h(init) : h ?? {};
    const failing = out && typeof out === "object" && "status" in out && "body" in out;
    const status: number = failing ? out.status : 200;
    return { ok: status >= 200 && status < 300, status, json: async () => (failing ? out.body : out), clone() { return this; } };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const find = (method: string, path: string) => calls.find((c) => c.method === method && c.url.split("?")[0] === path);

beforeEach(() => {
  H.push.mockClear(); H.replace.mockClear(); H.mutate.mockClear(); (revalidateTransactionLists as any).mockClear();
  H.search = "returnTo=%2Ftransactions"; H.linkId = "L-1";
  localStorage.clear();
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mountReady() {
  render(<EditTransferRoute />);
  await screen.findByTestId("txnew-root");
}
const save = () => fireEvent.click(screen.getByTestId("txnew-save"));

describe("transfer edit = entry screen", () => {
  it("is the entry screen titled Edit transfer, with the Transfer rows prefilled and only Transfer selectable", async () => {
    stub();
    await mountReady();
    expect(screen.getByRole("heading", { name: "Edit transfer" })).toBeTruthy();
    expect(screen.queryByTestId("tx-edit-root")).toBeNull();
    expect((document.getElementById("txnew-date") as HTMLInputElement).value).toBe("2026-02-01");
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("100");
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("Chequing");
    expect(screen.getByTestId("txnew-row-to-account").textContent).toContain("Savings");
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("From");
    expect((document.getElementById("txnew-note") as HTMLTextAreaElement).value).toBe("rent");
    expect(screen.queryByTestId("txnew-row-category")).toBeNull();
    expect(screen.queryByTestId("txnew-row-payee")).toBeNull();
    expect((screen.getByRole("radio", { name: "Expense" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "Income" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("radio", { name: "Transfer" }).getAttribute("aria-checked")).toBe("true");
    // The transfer PUT carries no entered currency: the chip shows the From currency and cannot be changed.
    expect((screen.getByRole("button", { name: "Currency" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the Created / Updated line with the source badge", async () => {
    stub();
    await mountReady();
    const meta = screen.getByTestId("txnew-edit-meta");
    expect(meta.textContent).toContain("Created");
    expect(meta.textContent).toContain("Manual");
  });

  it("Back is a link to returnTo; Cancel pushes returnTo without a request", async () => {
    H.search = "returnTo=%2Ftransactions%3Fpage%3D3";
    stub();
    await mountReady();
    const back = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/transactions"));
    expect(back?.getAttribute("href")).toBe("/transactions?page=3");
    fireEvent.click(screen.getByTestId("txnew-cancel"));
    expect(H.push).toHaveBeenCalledWith("/transactions?page=3");
    expect(find("PUT", "/api/transactions/transfer")).toBeUndefined();
  });

  it("saves with the same transfer PUT body the old form sent, refreshes lists, returns to returnTo", async () => {
    stub();
    await mountReady();
    save();
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    expect(find("PUT", "/api/transactions/transfer")!.body).toEqual({
      fromAccountId: 1, toAccountId: 2, enteredAmount: 100, date: "2026-02-01", note: "rent", linkId: "L-1",
      holdingName: null, destHoldingName: null, quantity: null, destQuantity: null,
    });
    expect(find("POST", "/api/transactions/transfer")).toBeUndefined();
    expect(revalidateTransactionLists).toHaveBeenCalled();
    expect(H.mutate).toHaveBeenCalledWith("/api/accounts");
  });

  it("tags go into the body when present and More details opens for them", async () => {
    stub({ 1: { ...debitLeg, tags: "a,b" }, 2: creditLeg });
    await mountReady();
    expect(screen.getByTestId("txnew-more").getAttribute("aria-expanded")).toBe("true");
    expect((document.getElementById("txnew-tags") as HTMLInputElement).value).toBe("a,b");
    save();
    await waitFor(() => expect(find("PUT", "/api/transactions/transfer")).toBeTruthy());
    expect(find("PUT", "/api/transactions/transfer")!.body.tags).toBe("a,b");
  });

  it("an edited amount is sent as entered", async () => {
    stub();
    await mountReady();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250.5" } });
    save();
    await waitFor(() => expect(find("PUT", "/api/transactions/transfer")).toBeTruthy());
    expect(find("PUT", "/api/transactions/transfer")!.body.enteredAmount).toBe(250.5);
  });

  it("cross currency: the received amount is the destination leg's own amount, kept, and sent as receivedAmount", async () => {
    stub({ 1: debitLeg, 2: { ...creditLeg, accountId: 5, accountName: "Maple", currency: "CAD", amount: 131.5, enteredAmount: 100, enteredCurrency: "USD" } });
    await mountReady();
    const received = await screen.findByTestId("txnew-row-received");
    expect((within(received).getByRole("textbox") as HTMLInputElement).value).toBe("131.5");
    // Let the FX preview settle: it must not overwrite the booked amount.
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/fx/preview"))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect((within(received).getByRole("textbox") as HTMLInputElement).value).toBe("131.5");
    save();
    await waitFor(() => expect(find("PUT", "/api/transactions/transfer")).toBeTruthy());
    expect(find("PUT", "/api/transactions/transfer")!.body).toMatchObject({ toAccountId: 5, enteredAmount: 100, receivedAmount: 131.5 });
  });

  it("Swap exchanges From and To in the PUT", async () => {
    stub();
    await mountReady();
    fireEvent.click(screen.getByTestId("txnew-swap-accounts"));
    save();
    await waitFor(() => expect(find("PUT", "/api/transactions/transfer")).toBeTruthy());
    expect(find("PUT", "/api/transactions/transfer")!.body).toMatchObject({ fromAccountId: 2, toAccountId: 1, linkId: "L-1" });
  });

  it("an API error shows its message and stays", async () => {
    stub(undefined, { "PUT /api/transactions/transfer": { status: 400, body: { error: "Nope" } } });
    await mountReady();
    save();
    expect(await screen.findByText("Nope")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("fx-currency-needs-override names the destination currency", async () => {
    stub(undefined, { "PUT /api/transactions/transfer": { status: 409, body: { code: "fx-currency-needs-override", currency: "CAD" } } });
    await mountReady();
    save();
    expect(await screen.findByText("No FX rate for CAD.")).toBeTruthy();
  });

  it("the overflow has only Delete transfer (a transfer cannot be duplicated)", async () => {
    stub();
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Delete transfer" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Duplicate" })).toBeNull();
  });

  it("Delete transfer asks first, then deletes both legs by linkId and returns", async () => {
    stub();
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete transfer" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("Delete this transfer?")).toBeTruthy();
    expect(find("DELETE", "/api/transactions/transfer")).toBeUndefined();
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/transactions/transfer?linkId=L-1")).toBe(true);
    expect(revalidateTransactionLists).toHaveBeenCalled();
  });

  it("a failed delete shows the message in the dialog and does not leave the page", async () => {
    stub(undefined, { "DELETE /api/transactions/transfer": { status: 500, body: { error: "Cannot delete" } } });
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete transfer" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    expect(await within(dlg).findByText("Cannot delete")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("transfer edit: which UI a pair opens in", () => {
  it("a pair with an investment account keeps the old edit form", async () => {
    stub({ 1: debitLeg, 2: { ...creditLeg, accountId: 3, accountName: "Broker" } });
    render(<EditTransferRoute />);
    await screen.findByTestId("tx-edit-root");
    expect(screen.queryByTestId("txnew-root")).toBeNull();
  });

  it("an in-kind pair (holding + quantity) keeps the old edit form", async () => {
    stub({ 1: { ...debitLeg, quantity: -2, portfolioHolding: "VFV" }, 2: { ...creditLeg, quantity: 2, portfolioHolding: "VFV" } });
    render(<EditTransferRoute />);
    await screen.findByTestId("tx-edit-root");
  });

  it("an unknown link shows the not-found message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), clone() { return this; } })));
    render(<EditTransferRoute />);
    expect(await screen.findByText("This transfer no longer exists.")).toBeTruthy();
  });
});
