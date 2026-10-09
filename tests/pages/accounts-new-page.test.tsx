/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

const H = vi.hoisted(() => ({ push: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  usePathname: () => "/accounts/new",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["VND", "USD"] }));

import NewAccountRoute from "@/app/(app)/accounts/new/page";

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let postStatus = 201;
let postBody: unknown = { id: 42, name: "Wallet", type: "A", group: "Cash", currency: "VND" };

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  calls = [];
  postStatus = 201;
  postBody = { id: 42, name: "Wallet", type: "A", group: "Cash", currency: "VND" };
  H.search = "";
  H.push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/accounts?includeArchived=1") {
        return json([{ id: 1, name: "Bank", alias: "BK1", group: "Banks" }]);
      }
      if (url === "/api/accounts" && init?.method === "POST") {
        return json(postStatus === 201 ? postBody : { error: "Name taken" }, postStatus);
      }
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const postCalls = () => calls.filter((c) => c.url === "/api/accounts" && c.init?.method === "POST");

describe("New account page: fields", () => {
  it("renders the page heading, the label-left fields and the Create button", () => {
    render(<NewAccountRoute />);
    expect(screen.getByRole("heading", { level: 1, name: "New account" })).toBeTruthy();
    expect(screen.getByLabelText("Account Name")).toBeTruthy();
    expect(screen.getByLabelText(/Alias/)).toBeTruthy();
    expect(screen.getByText("Type")).toBeTruthy();
    expect(screen.getByLabelText("Group")).toBeTruthy();
    expect(screen.getByText("Currency")).toBeTruthy();
    expect(screen.getByLabelText(/Note/)).toBeTruthy();
    expect(screen.getByLabelText("Opening balance")).toBeTruthy();
    expect(screen.getByLabelText("Date")).toBeTruthy();
    expect(screen.getByLabelText("Investment account")).toBeTruthy();
    expect(screen.getByLabelText("Invisible")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeTruthy();
  });

  it("loads existing accounts (archived included) for the group and alias checks", async () => {
    render(<NewAccountRoute />);
    await waitFor(() =>
      expect(calls.some((c) => c.url === "/api/accounts?includeArchived=1")).toBe(true),
    );
  });
});

describe("New account page: validation and save", () => {
  it("blocks submit and shows an error when the name is empty", async () => {
    render(<NewAccountRoute />);
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(postCalls()).toHaveLength(0);
  });

  it("POSTs the same payload shape as the old dialog, then opens the new account", async () => {
    render(<NewAccountRoute />);
    fireEvent.change(screen.getByLabelText("Account Name"), { target: { value: "  Wallet  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/accounts/42"));
    expect(postCalls()).toHaveLength(1);
    expect(JSON.parse(String(postCalls()[0].init?.body))).toEqual({
      name: "Wallet",
      type: "A",
      group: "Cash",
      currency: "VND",
      note: "",
      isInvestment: false,
      invisible: false,
    });
  });

  it("shows the server error and stays on the page when the POST fails", async () => {
    postStatus = 409;
    render(<NewAccountRoute />);
    fireEvent.change(screen.getByLabelText("Account Name"), { target: { value: "Wallet" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Name taken")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("New account page: returnTo", () => {
  it("uses a same-app returnTo for Back and Cancel", async () => {
    H.search = "returnTo=/portfolio";
    render(<NewAccountRoute />);
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/portfolio");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(H.push).toHaveBeenCalledWith("/portfolio");
  });

  it.each(["//evil.example/x", "https://evil.example", "/\\evil.example", "javascript:alert(1)"])(
    "rejects returnTo=%s and falls back to /accounts",
    (raw) => {
      H.search = `returnTo=${encodeURIComponent(raw)}`;
      render(<NewAccountRoute />);
      expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/accounts");
    },
  );
});

describe("safeReturnTo", () => {
  it("accepts same-app relative paths, with query", () => {
    expect(safeReturnTo("/portfolio")).toBe("/portfolio");
    expect(safeReturnTo("/transactions?x=1")).toBe("/transactions?x=1");
  });

  it("falls back for absolute, protocol-relative, backslash and empty values", () => {
    for (const raw of ["https://x.test", "//x.test", "/\\x.test", "portfolio", "", null, undefined]) {
      expect(safeReturnTo(raw as string | null | undefined), String(raw)).toBe("/accounts");
    }
    expect(safeReturnTo("//x.test", "/portfolio")).toBe("/portfolio");
  });

  it("rejects control characters", () => {
    expect(safeReturnTo("/ok\u0009//evil.test")).toBe("/accounts");
  });
});
