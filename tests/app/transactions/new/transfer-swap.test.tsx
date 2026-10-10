/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/transactions/new",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
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


beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/transactions/new");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ active: ["USD", "EUR"] }) })));
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
  vi.unstubAllGlobals();
});

function openTransfer(prefill: Record<string, unknown> = { txType: "Transfer" }) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      v: 1, amount: "150", accountId: "", categoryId: "", payee: "", note: "",
      tags: "", isBusiness: false, txType: "Transfer", ts: Date.now(), ...prefill,
    }),
  );
  window.history.replaceState({}, "", "/transactions/new?prefill=1&kind=transfer");
  render(<Page />);
}

describe("Transfer tab: From/To labels, currency trigger, swap", () => {
  it("labels the rows From and To and shows an enabled currency trigger on Transfer", async () => {
    openTransfer();
    await waitFor(() => expect(screen.getByTestId("txnew-row-to-account")).toBeTruthy());
    expect(screen.getByTestId("txnew-row-account").textContent).toMatch(/^From/);
    expect(screen.getByTestId("txnew-row-to-account").textContent).toMatch(/^To/);
    const trigger = screen.getByRole("button", { name: "Currency" }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(false);
  });

  it("swap button is disabled when both sides are empty", async () => {
    openTransfer({ accountId: "" });
    const swap = await screen.findByRole("button", { name: "Swap accounts" });
    expect((swap as HTMLButtonElement).disabled).toBe(true);
    expect(swap.className).toContain("size-11");
  });

  it("swap exchanges From and To accounts", async () => {
    openTransfer({ accountId: "2" });
    const swap = await screen.findByRole("button", { name: "Swap accounts" });
    expect((swap as HTMLButtonElement).disabled).toBe(false);
    // Pick the To account from the sheet (Checking), then swap: From should become Checking, To Savings.
    fireEvent.click(screen.getByTestId("txnew-row-to-account"));
    fireEvent.click(await screen.findByRole("button", { name: /^Checking/ }));
    await waitFor(() => expect(screen.getByTestId("txnew-row-to-account").textContent).toContain("Checking"));
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("Savings");
    fireEvent.click(swap);
    await waitFor(() => expect(screen.getByTestId("txnew-row-account").textContent).toContain("Checking"));
    expect(screen.getByTestId("txnew-row-to-account").textContent).toContain("Savings");
  });

  it("swap with only From set moves it to To and empties From", async () => {
    openTransfer({ accountId: "2" });
    fireEvent.click(await screen.findByRole("button", { name: "Swap accounts" }));
    await waitFor(() => expect(screen.getByTestId("txnew-row-to-account").textContent).toContain("Savings"));
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("Select Account");
  });
});
