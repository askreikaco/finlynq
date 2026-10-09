/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["VND", "USD"] }));

import { AccountDialog } from "@/app/(app)/accounts/_components/account-dialog";

const account = {
  id: 7,
  name: "Techcombank",
  type: "A",
  group: "Banks",
  currency: "VND",
  alias: "TC1",
  note: "Main",
  archived: false,
  invisible: false,
  isInvestment: true,
};

let calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = init?.method === "PUT" ? { id: 7, name: "Techcombank 2" } : {};
      return { ok: true, status: 200, json: async () => body };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountDialog (edit)", () => {
  it("opens prefilled with the account and offers Save Changes and the account actions", () => {
    render(<AccountDialog open account={account} onOpenChange={() => {}} />);
    expect(screen.getByRole("heading", { name: "Edit Account" })).toBeTruthy();
    expect((screen.getByLabelText("Account Name") as HTMLInputElement).value).toBe("Techcombank");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive or delete account" })).toBeTruthy();
  });

  it("saves with PUT /api/accounts and closes", async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    render(<AccountDialog open account={account} onOpenChange={onOpenChange} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Account Name"), { target: { value: "Techcombank 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const put = calls.find((c) => c.init?.method === "PUT");
    expect(put?.url).toBe("/api/accounts");
    expect(JSON.parse(String(put?.init?.body))).toMatchObject({ id: 7, name: "Techcombank 2", type: "A" });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
