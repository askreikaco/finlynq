/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/portfolio/new/buy",
}));

// Form data is a fixture; the real hook fetches the account/holding lists.
let formData: Record<string, unknown> = {};
vi.mock("@/lib/hooks/usePortfolioFormData", () => ({
  usePortfolioFormData: () => formData,
}));

import BuyForm from "@/components/portfolio/forms/BuyForm";

const ACCOUNTS = [{ id: 1, name: "Broker", currency: "USD", isInvestment: true }];
const HOLDINGS = [
  { id: 10, accountId: 1, name: "VTI", symbol: "VTI", currency: "USD", isCash: false, currentShares: 5 },
  { id: 11, accountId: 1, name: "Cash USD", symbol: null, currency: "USD", isCash: true },
];

function fixture(over: Record<string, unknown> = {}) {
  return {
    accounts: ACCOUNTS,
    holdings: HOLDINGS,
    categories: [],
    loading: false,
    loadError: null,
    // editData seeds the form fields (same effect the edit flow uses) without an editId.
    editData: { accountId: 1, holdingId: 10, qty: 5, totalCost: 100, date: "2026-10-01" },
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
  search = "";
  formData = fixture();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const saveButton = () => screen.getByRole("button", { name: "Record" });

describe("Buy operation page (/portfolio/new/buy)", () => {
  it("renders the grouped fields with label-left rows and no card chrome", () => {
    const { container } = render(<BuyForm />);
    const rowLabels = [...container.querySelectorAll("span.w-28")].map((n) => n.textContent ?? "");
    expect(rowLabels.length).toBeGreaterThanOrEqual(7);
    for (const label of ["Account", "Holding", "Quantity", "Total cost", "Date", "Payee", "Note", "Tags"]) {
      expect(rowLabels.some((t) => t.startsWith(label)), label).toBe(true);
    }
    expect(container.querySelector("[data-slot='card']")).toBeNull();
    expect(screen.queryByText("Open →")).toBeNull();
  });

  it("submits the same payload as the old flow and returns to /portfolio", async () => {
    render(<BuyForm />);
    fireEvent.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/portfolio/operations/buy");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      accountId: 1,
      holdingId: 10,
      qty: 5,
      totalCost: 100,
      date: "2026-10-01",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/portfolio"));
  });

  it("validates quantity before any request", async () => {
    formData = fixture({ editData: { accountId: 1, holdingId: 10, qty: 0, totalCost: 100, date: "2026-10-01" } });
    render(<BuyForm />);
    fireEvent.click(saveButton());
    expect(await screen.findByText("Quantity must be > 0")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("returns to a valid ?returnTo= and ignores an unsafe one", async () => {
    search = "returnTo=%2Ftransactions";
    const { unmount } = render(<BuyForm />);
    fireEvent.click(saveButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/transactions"));
    unmount();
    cleanup();

    push.mockClear();
    search = "returnTo=%2F%2Fevil.example";
    render(<BuyForm />);
    fireEvent.click(saveButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/portfolio"));
  });
});
