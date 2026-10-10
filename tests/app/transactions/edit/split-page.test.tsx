/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";

const H = vi.hoisted(() => ({ push: vi.fn(), search: "", id: "7" }));
const ROUTER = { push: H.push, replace: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  // PageHeader resolves its auto back target from the nav registry (useBackTarget -> usePathname).
  usePathname: () => "/transactions",
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.id }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: vi.fn(async () => undefined), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));

import SplitRoute from "@/app/(app)/transactions/[id]/split/page";

const CATS = [{ id: 1, name: "Food", type: "E", group: "Daily" }, { id: 2, name: "Fun", type: "E", group: "Leisure" }];
const ACCTS = [{ id: 1, name: "Chequing", currency: "USD", type: "A", archived: false }, { id: 9, name: "Old", currency: "USD", type: "A", archived: true }];
const TX = { id: 7, amount: -50, currency: "USD", categoryId: 1, payee: "Shop", linkId: null };

function stub(splits: unknown[] = [], tx: Record<string, unknown> = TX) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    let body: unknown = {};
    if (url.startsWith("/api/transactions?id=")) body = { data: [tx] };
    else if (url.startsWith("/api/transactions/splits") && method === "GET") body = splits;
    else if (url.startsWith("/api/transactions/splits")) body = {};
    else if (url.startsWith("/api/categories")) body = CATS;
    else if (url.startsWith("/api/accounts")) body = ACCTS;
    return { ok: true, status: 200, json: async () => body, clone() { return this; } };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const posts = (fn: ReturnType<typeof stub>) => fn.mock.calls.filter(([u, i]) => u === "/api/transactions/splits" && (i as any)?.method === "POST");

beforeEach(() => {
  H.push.mockClear(); H.search = "returnTo=%2Ftransactions"; H.id = "7";
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mountReady() {
  render(<SplitRoute />);
  await screen.findByTestId("tx-split-root");
}

const amountOf = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).value;

describe("/transactions/[id]/split page", () => {
  it("opens with count 2, an empty first split and the last split as the read-only remainder", async () => {
    stub();
    await mountReady();
    expect(screen.getByText("Split transaction")).toBeTruthy();
    expect((screen.getByTestId("split-count") as HTMLInputElement).value).toBe("2");
    expect(amountOf("split-amount-2")).toBe("50.00");
    expect((screen.getByTestId("split-amount-2") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
    expect((screen.getByTestId("tx-split-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("count 1 shows the hint, disables Save and posts nothing", async () => {
    const fn = stub();
    await mountReady();
    fireEvent.change(screen.getByTestId("split-count"), { target: { value: "1" } });
    expect(screen.getByText("Enter 2 or more to split")).toBeTruthy();
    expect((screen.getByTestId("tx-split-save") as HTMLButtonElement).disabled).toBe(true);
    expect(posts(fn)).toHaveLength(0);
  });

  it("an over-typed amount shows the exceed status and disables Save", async () => {
    stub();
    await mountReady();
    fireEvent.change(document.getElementById("tx-split-amount-1")!, { target: { value: "60" } });
    expect(screen.getByText(`Splits exceed the total by ${formatCurrency(10, "USD")}`)).toBeTruthy();
    expect((screen.getByTestId("tx-split-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("the status line reports what is allocated and the remainder updates live", async () => {
    stub();
    await mountReady();
    fireEvent.change(document.getElementById("tx-split-amount-1")!, { target: { value: "20" } });
    expect(screen.getByText(`Allocated ${formatCurrency(20, "USD")} of ${formatCurrency(50, "USD")}`)).toBeTruthy();
    expect(amountOf("split-amount-2")).toBe("30.00");
    expect((screen.getByTestId("tx-split-save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("balanced two-split save posts the outflow sign with the parent category, then returns to returnTo", async () => {
    const fn = stub();
    await mountReady();
    fireEvent.change(document.getElementById("tx-split-amount-1")!, { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("split-note-2"), { target: { value: "beer" } });
    fireEvent.click(screen.getByTestId("tx-split-save"));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    const post = posts(fn)[0];
    expect(JSON.parse((post![1] as any).body)).toEqual({
      transactionId: 7,
      splits: [
        { categoryId: 1, accountId: null, amount: -20, note: "", description: "", tags: "" },
        { categoryId: 1, accountId: null, amount: -30, note: "beer", description: "", tags: "" },
      ],
    });
  });

  it("saved expense splits load as absolute amounts and keep their own categories", async () => {
    stub([
      { categoryId: 1, accountId: null, amount: -30, note: null, description: null, tags: null },
      { categoryId: 2, accountId: null, amount: -20, note: null, description: null, tags: null },
    ]);
    await mountReady();
    expect((screen.getByTestId("split-count") as HTMLInputElement).value).toBe("2");
    expect(amountOf("split-amount-1")).toBe("30.00");
    expect(amountOf("split-amount-2")).toBe("20.00");
    expect(screen.queryByTestId("tx-split-adjusted")).toBeNull();
    expect((screen.getByTestId("tx-split-save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("saved splits that do not sum to the total make the last split the remainder and show the one-time notice", async () => {
    stub([
      { categoryId: 1, accountId: null, amount: -30, note: null, description: null, tags: null },
      { categoryId: 2, accountId: null, amount: -10, note: null, description: null, tags: null },
    ]);
    await mountReady();
    expect(amountOf("split-amount-2")).toBe("20.00");
    expect(screen.getByTestId("tx-split-adjusted").textContent).toBe(
      `Last split adjusted from ${formatCurrency(10, "USD")} to ${formatCurrency(20, "USD")} to match the total.`,
    );
  });

  it("round-trips accountId, description and tags of loaded rows in the save payload and shows the account chip", async () => {
    const fn = stub([
      { categoryId: 1, accountId: 1, amount: -30, note: "a", description: "desc", tags: "t1" },
      { categoryId: 2, accountId: null, amount: -20, note: null, description: null, tags: null },
    ]);
    await mountReady();
    expect(screen.getByTestId("split-account-1").textContent).toBe("Account: Chequing");
    expect(screen.queryByTestId("split-account-2")).toBeNull();
    fireEvent.click(screen.getByTestId("tx-split-save"));
    await waitFor(() => expect(posts(fn)).toHaveLength(1));
    expect(JSON.parse((posts(fn)[0][1] as any).body).splits).toEqual([
      { categoryId: 1, accountId: 1, amount: -30, note: "a", description: "desc", tags: "t1" },
      { categoryId: 2, accountId: null, amount: -20, note: "", description: "", tags: "" },
    ]);
  });

  it("an unset category inherits the parent category, shown as 'same as above'", async () => {
    stub();
    await mountReady();
    expect(screen.getByTestId("split-category-1").textContent).toBe("Food · same as above");
    expect(screen.getByTestId("split-category-2").textContent).toBe("Food · same as above");
  });

  it("with no category on the parent and none picked, the chip asks for one and Save stays disabled", async () => {
    stub([], { ...TX, categoryId: null });
    await mountReady();
    fireEvent.change(document.getElementById("tx-split-amount-1")!, { target: { value: "20" } });
    expect(screen.getByTestId("split-category-1").textContent).toBe("Choose category");
    expect((screen.getByTestId("tx-split-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("the amount field opens the numpad and a note focus closes it", async () => {
    stub();
    await mountReady();
    expect(screen.queryByTestId("numpad-dock")).toBeNull();
    fireEvent.focus(document.getElementById("tx-split-amount-1")!);
    expect(screen.getByTestId("numpad-dock")).toBeTruthy();
    fireEvent.focus(screen.getByTestId("split-note-2"));
    expect(screen.queryByTestId("numpad-dock")).toBeNull();
  });

  it("Clear splits sends DELETE for the transaction and returns", async () => {
    const fn = stub([{ categoryId: 1, accountId: null, amount: -10, note: null, description: null, tags: null }, { categoryId: 2, accountId: null, amount: -40, note: "x", description: null, tags: null }]);
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "Clear splits" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    expect(fn.mock.calls.some(([u, i]) => u === "/api/transactions/splits?transactionId=7" && (i as any)?.method === "DELETE")).toBe(true);
  });

  it("a transfer leg is refused: a message, no editor and no Save", async () => {
    stub([], { ...TX, linkId: "link-1" });
    render(<SplitRoute />);
    expect((await screen.findByTestId("tx-split-blocked")).textContent).toBe("Transfers can't be split.");
    expect(screen.queryByTestId("tx-split-root")).toBeNull();
    expect(screen.queryByTestId("tx-split-save")).toBeNull();
  });

  it("more than 20 saved splits are refused rather than silently truncated", async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ categoryId: 1, accountId: null, amount: -1, note: String(i), description: null, tags: null }));
    stub(many, { ...TX, amount: -21 });
    render(<SplitRoute />);
    expect((await screen.findByTestId("tx-split-blocked")).textContent).toContain("21 splits");
    expect(screen.queryByTestId("tx-split-root")).toBeNull();
  });

  it.each([["//evil.example", "/transactions"], ["https://evil.example", "/transactions"], ["javascript:alert(1)", "/transactions"]])(
    "returnTo %s is not used for Back",
    async (raw, expected) => {
      H.search = `returnTo=${encodeURIComponent(raw)}`;
      stub();
      await mountReady();
      const back = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/"));
      expect(back?.getAttribute("href")).toBe(expected);
    },
  );
});
