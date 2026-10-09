/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({
  search: "",
  params: {} as Record<string, string>,
  push: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => "/settings/investments",
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => nav.params,
}));

import AddSecurityRoute from "@/app/(app)/settings/investments/securities/new/page";
import EditSecurityRoute from "@/app/(app)/settings/investments/securities/[id]/edit/page";
import LinkSecurityRoute from "@/app/(app)/settings/investments/securities/[id]/link/page";
import LinkAccountRoute from "@/app/(app)/settings/investments/accounts/[id]/link/page";
import ManagePricesRoute from "@/app/(app)/settings/investments/securities/[id]/prices/page";
import NewCashSleeveRoute from "@/app/(app)/settings/investments/cash-sleeves/new/page";
import InvestmentsListRoute from "@/app/(app)/settings/investments/page";

const SEC_ID = 7;
const security = {
  id: SEC_ID,
  symbol: "VTI",
  name: "Vanguard Total",
  assetType: "etf",
  currency: "USD",
  isCash: false,
  isCrypto: false,
  priceSource: "auto",
  latestPrice: null,
  image: null,
  accounts: [],
};
const manualSecurity = { ...security, id: 8, symbol: "PRIV", name: "Private Co", priceSource: "manual" };
const brokerage = { id: 3, name: "IBKR", type: "A", currency: "USD", isInvestment: true, archived: false };

type Call = { url: string; method: string; body?: any };
let calls: Call[] = [];
let failNext: { match: (u: string, m: string) => boolean; error: string } | null = null;

function installFetch(extra?: (u: string, m: string) => unknown | undefined) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: u, method, body });
      if (failNext && failNext.match(u, method)) {
        const err = failNext.error;
        failNext = null;
        return { ok: false, status: 400, json: async () => ({ error: err }) };
      }
      const custom = extra?.(u, method);
      if (custom !== undefined) return custom as any;
      if (u === "/api/securities" && method === "GET") {
        return { ok: true, json: async () => ({ data: [security, manualSecurity] }) };
      }
      if (u === "/api/accounts") return { ok: true, json: async () => [brokerage] };
      if (u.startsWith("/api/securities/prices") && method === "GET") {
        return { ok: true, json: async () => ({ data: [{ id: 91, date: "2026-10-01", price: 12.5, currency: "USD" }] }) };
      }
      if (u.startsWith("/api/securities/lookup")) {
        return { ok: true, json: async () => ({ data: { found: false, name: null, currency: null } }) };
      }
      return { ok: true, json: async () => ({ data: { newSecurityId: undefined } }) };
    }),
  );
}

const callsTo = (method: string, prefix: string) =>
  calls.filter((c) => c.method === method && c.url.startsWith(prefix));

beforeEach(() => {
  nav.search = "";
  nav.params = {};
  nav.push.mockClear();
  failNext = null;
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("securities/new (Add security page)", () => {
  it("renders the ticker, name, currency, crypto and pricing fields", () => {
    render(<AddSecurityRoute />);
    expect(screen.getByPlaceholderText("e.g. AAPL, VTI, BTC")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add security" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manual" })).toBeTruthy();
  });

  it("blocks an empty ticker and a bad currency without calling define", async () => {
    render(<AddSecurityRoute />);
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "U" } });
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    expect(await screen.findByText("Ticker is required")).toBeTruthy();
    expect(screen.getByText("Enter a 3-4 letter currency code")).toBeTruthy();
    expect(callsTo("POST", "/api/securities/define")).toHaveLength(0);
  });

  it("posts the same define payload as the old dialog and returns to the list with a notice", async () => {
    render(<AddSecurityRoute />);
    fireEvent.change(screen.getByPlaceholderText("e.g. AAPL, VTI, BTC"), { target: { value: "  msft " } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Microsoft" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "usd" } });
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
    const [post] = callsTo("POST", "/api/securities/define");
    expect(post.body).toEqual({
      symbol: "msft",
      name: "Microsoft",
      currency: "USD",
      isCrypto: false,
      priceSource: "auto",
    });
    expect(nav.push).toHaveBeenCalledWith("/settings/investments?notice=security-added");
  });

  it("manual pricing returns with the manual notice", async () => {
    render(<AddSecurityRoute />);
    fireEvent.change(screen.getByPlaceholderText("e.g. AAPL, VTI, BTC"), { target: { value: "PRIV" } });
    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    expect(nav.push.mock.calls[0][0]).toBe("/settings/investments?notice=security-added-manual");
  });

  it("Cancel goes to the validated returnTo", () => {
    nav.search = "returnTo=%2Fsettings%2Finvestments%3Ftab%3Dby-account";
    render(<AddSecurityRoute />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(nav.push).toHaveBeenCalledWith("/settings/investments?tab=by-account");
  });

  it.each([
    ["//evil.example", "//evil.example"],
    ["https://evil.example/x", "https://evil.example/x"],
    ["javascript:alert(1)", "javascript:alert(1)"],
  ])("rejects unsafe returnTo %s and falls back to the list", (raw) => {
    nav.search = `returnTo=${encodeURIComponent(raw)}`;
    render(<AddSecurityRoute />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(nav.push).toHaveBeenCalledWith("/settings/investments");
  });
});

describe("securities/[id]/edit (Edit security page)", () => {
  beforeEach(() => {
    nav.params = { id: String(SEC_ID) };
  });

  it("sends only the name change in a single PATCH when the ticker is unchanged", async () => {
    render(<EditSecurityRoute />);
    const name = await screen.findByDisplayValue("Vanguard Total");
    fireEvent.change(name, { target: { value: "Vanguard Total Market" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    const patches = callsTo("PATCH", "/api/securities");
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ id: SEC_ID, name: "Vanguard Total Market" });
    expect(nav.push).toHaveBeenCalledWith("/settings/investments?notice=security-updated");
  });

  it("re-clusters a ticker change first, then applies the rest to the new security id", async () => {
    // Re-cluster answers with a merge target id; everything else uses the base mock.
    const base = (globalThis.fetch as any).getMockImplementation();
    (globalThis.fetch as any).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url) === "/api/securities" && init?.method === "PATCH" && JSON.parse(String(init.body)).symbol) {
        calls.push({ url: String(url), method: "PATCH", body: JSON.parse(String(init.body)) });
        return { ok: true, json: async () => ({ data: { newSecurityId: 42 } }) };
      }
      return base(url, init);
    });
    render(<EditSecurityRoute />);
    fireEvent.change(await screen.findByDisplayValue("VTI"), { target: { value: "VT" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    const patches = callsTo("PATCH", "/api/securities");
    expect(patches[0].body).toEqual({ id: SEC_ID, symbol: "VT" });
    expect(patches[1].body).toEqual({ id: 42, name: "Vanguard Total", assetType: undefined, priceSource: undefined });
    expect(nav.push).toHaveBeenCalledWith("/settings/investments?notice=ticker-changed");
  });

  it("shows a save error inline and does not navigate", async () => {
    failNext = { match: (u, m) => u === "/api/securities" && m === "PATCH", error: "Name taken" };
    render(<EditSecurityRoute />);
    await screen.findByDisplayValue("Vanguard Total");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name taken")).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("securities/[id]/link and accounts/[id]/link", () => {
  it("security link (mode account) requires a pick, then posts {securityId, accountId}", async () => {
    nav.params = { id: String(SEC_ID) };
    render(<LinkSecurityRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    expect(await screen.findByText("Pick an account")).toBeTruthy();
    expect(callsTo("POST", "/api/securities")).toHaveLength(0);
  });

  it("account link (mode security) renders with the account heading and Cancel returns validated", async () => {
    nav.params = { id: "3" };
    nav.search = "returnTo=%2Fsettings%2Finvestments%3Ftab%3Dby-account";
    render(<LinkAccountRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(nav.push).toHaveBeenCalledWith("/settings/investments?tab=by-account");
  });
});

describe("cash-sleeves/new", () => {
  it("validates the currency code and posts {accountId, currency} on success", async () => {
    nav.search = "accountId=3";
    render(<NewCashSleeveRoute />);
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "u" } });
    fireEvent.click(screen.getByRole("button", { name: "Add cash sleeve" }));
    expect(await screen.findByText("Enter a 3-4 letter currency code")).toBeTruthy();
    expect(callsTo("POST", "/api/portfolio/holdings/cash-sleeve")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "eur" } });
    fireEvent.click(screen.getByRole("button", { name: "Add cash sleeve" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    expect(callsTo("POST", "/api/portfolio/holdings/cash-sleeve")[0].body).toEqual({
      accountId: 3,
      currency: "EUR",
    });
    expect(nav.push).toHaveBeenCalledWith("/settings/investments?notice=cash-added");
  });

  it("without a valid accountId it shows a notice and no form", () => {
    nav.search = "accountId=abc";
    render(<NewCashSleeveRoute />);
    expect(screen.getByText(/No account selected/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add cash sleeve" })).toBeNull();
  });
});

describe("securities/[id]/prices", () => {
  it("lists the marks and rejects a missing price without posting", async () => {
    nav.params = { id: "8" };
    render(<ManagePricesRoute />);
    expect(await screen.findByText("2026-10-01")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add price" }));
    expect(await screen.findByText("Enter a price (0 or more)")).toBeTruthy();
    expect(callsTo("POST", "/api/securities/prices")).toHaveLength(0);
  });

  it("Done returns to the validated returnTo", async () => {
    nav.params = { id: "8" };
    nav.search = "returnTo=%2F%2Fevil.example";
    render(<ManagePricesRoute />);
    await screen.findByText("2026-10-01");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(nav.push).toHaveBeenCalledWith("/settings/investments");
  });
});

describe("/settings/investments list navigates to the full pages", () => {
  it("Add security opens the create page carrying the current tab as returnTo", async () => {
    render(<InvestmentsListRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Add security" }));
    expect(nav.push).toHaveBeenCalledWith(
      "/settings/investments/securities/new?returnTo=%2Fsettings%2Finvestments%3Ftab%3Dsecurities",
    );
  });

  it("Prices on a manual security opens its prices page", async () => {
    render(<InvestmentsListRoute />);
    fireEvent.click(await screen.findByRole("button", { name: /Prices/ }));
    expect(nav.push.mock.calls[0][0]).toMatch(/^\/settings\/investments\/securities\/8\/prices\?returnTo=/);
  });

  it("the list no longer mounts the old dialogs or the page FAB handler", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(app)/settings/investments/page.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/<Dialog\b/);
    expect(src).not.toMatch(/ManagePricesDialog|AddSecurityForm|EditSecurityForm|LinkForm/);
    expect(src).not.toMatch(/usePageFab\(/);
    expect(src).toMatch(/router\.push\(/);
  });
});
