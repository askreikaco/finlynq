/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/accounts/groups",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));

import AccountGroupsPage from "@/app/(app)/accounts/groups/page";

const balances = [
  { accountId: 1, accountName: "TCB", accountType: "A", accountGroup: "Banks", currency: "VND", balance: 1, convertedBalance: 1 },
  { accountId: 2, accountName: "TCBS", accountType: "A", accountGroup: "Investments", currency: "VND", balance: 1, convertedBalance: 1 },
  { accountId: 3, accountName: "Loose", accountType: "A", accountGroup: "", currency: "VND", balance: 1, convertedBalance: 1 },
  { accountId: 4, accountName: "Visa", accountType: "L", accountGroup: "Credit Card", currency: "VND", balance: -1, convertedBalance: -1 },
];

type Call = { url: string; method: string; body?: any };
let calls: Call[] = [];
let patchError: string | null = null;

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: u, method, body });
    if (u.startsWith("/api/dashboard")) return { ok: true, json: async () => ({ balances }) };
    if (u === "/api/settings/account-group-order" && method === "GET") {
      return { ok: true, json: async () => ({ order: { A: [], L: [] } }) };
    }
    if (u === "/api/accounts/groups" && method === "PATCH") {
      if (patchError) return { ok: false, json: async () => ({ error: patchError }) };
      return { ok: true, json: async () => ({ success: true, data: { renamed: 1 } }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
}

beforeEach(() => {
  nav.search = "";
  patchError = null;
  installFetch();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const callsTo = (method: string, url: string) => calls.filter((c) => c.method === method && c.url === url);

async function openRowMenu(group: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Actions for ${group}` }));
  return within(await screen.findByRole("menu", undefined, { timeout: 5000 }));
}

describe("/accounts/groups page", () => {
  it("renders asset and liability groups from the live balances, Other last", async () => {
    render(<AccountGroupsPage />);
    await screen.findByRole("button", { name: "Actions for Banks" });
    const assets = document.querySelector("[data-slot=manage-groups-A]") as HTMLElement;
    const names = Array.from(assets.querySelectorAll("li span")).map((s) => s.textContent);
    expect(names).toEqual(["Banks", "Investments", "Other"]);
    const liab = document.querySelector("[data-slot=manage-groups-L]") as HTMLElement;
    expect(within(liab).getByText("Credit Card")).toBeTruthy();
    // "Other" is not movable / renamable / mergeable
    expect(screen.queryByRole("button", { name: "Actions for Other" })).toBeNull();
    expect(callsTo("GET", "/api/dashboard?currency=VND")).toHaveLength(1);
  });

  it("back link uses a validated returnTo and falls back to /accounts", async () => {
    nav.search = "returnTo=" + encodeURIComponent("/accounts?view=all");
    render(<AccountGroupsPage />);
    expect(screen.getByRole("link", { name: "Back to accounts" }).getAttribute("href")).toBe("/accounts?view=all");
  });

  it.each([
    ["//evil.example"],
    ["https://evil.example"],
    ["http:evil.example"],
    ["/\\evil.example"],
    ["/\t/evil.example"],
    ["javascript:alert(1)"],
    ["evil.example/accounts"],
    [""],
  ])("rejects returnTo %j and falls back to /accounts", (raw) => {
    nav.search = "returnTo=" + encodeURIComponent(raw);
    render(<AccountGroupsPage />);
    expect(screen.getByRole("link", { name: "Back to accounts" }).getAttribute("href")).toBe("/accounts");
    cleanup();
  });

  it("safeReturnTo accepts only same-origin relative in-app paths", () => {
    expect(safeReturnTo("/accounts")).toBe("/accounts");
    expect(safeReturnTo("/accounts/new?x=1")).toBe("/accounts/new?x=1");
    expect(safeReturnTo("//evil.example")).toBe("/accounts");
    expect(safeReturnTo("/\\evil.example")).toBe("/accounts");
    expect(safeReturnTo(null)).toBe("/accounts");
  });

  it("rename PATCHes the same payload as the dialog, then persists order and reloads", async () => {
    render(<AccountGroupsPage />);
    await screen.findByRole("button", { name: "Actions for Banks" });
    const menu = await openRowMenu("Banks");
    fireEvent.click(menu.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByLabelText("New name for Banks") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Bank  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save group name" }));

    await waitFor(() => expect(callsTo("PATCH", "/api/accounts/groups")).toHaveLength(1));
    expect(callsTo("PATCH", "/api/accounts/groups")[0].body).toEqual({ from: "Banks", to: "Bank", type: "A" });
    await waitFor(() => expect(callsTo("PUT", "/api/settings/account-group-order")).toHaveLength(1));
    expect(callsTo("PUT", "/api/settings/account-group-order")[0].body).toEqual({ order: { A: [], L: [] } });
    await waitFor(() => expect(callsTo("GET", "/api/dashboard?currency=VND")).toHaveLength(2));
  });

  it("shows the server error when rename is rejected", async () => {
    patchError = "Name already in use";
    render(<AccountGroupsPage />);
    await screen.findByRole("button", { name: "Actions for Banks" });
    const menu = await openRowMenu("Banks");
    fireEvent.click(menu.getByRole("menuitem", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("New name for Banks"), { target: { value: "Investments" } });
    fireEvent.click(screen.getByRole("button", { name: "Save group name" }));
    expect(await screen.findByText("Name already in use")).toBeTruthy();
    expect(callsTo("PUT", "/api/settings/account-group-order")).toHaveLength(0);
  });

  it("move down persists the full ordered list for that type", async () => {
    render(<AccountGroupsPage />);
    await screen.findByRole("button", { name: "Actions for Banks" });
    const menu = await openRowMenu("Banks");
    fireEvent.click(menu.getByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(callsTo("PUT", "/api/settings/account-group-order")).toHaveLength(1));
    expect(callsTo("PUT", "/api/settings/account-group-order")[0].body).toEqual({
      order: { A: ["Investments", "Banks"], L: [] },
    });
  });

  it("merge into Other asks for confirmation, then PATCHes to:Other", async () => {
    render(<AccountGroupsPage />);
    await screen.findByRole("button", { name: "Actions for Investments" });
    const menu = await openRowMenu("Investments");
    fireEvent.click(menu.getByRole("menuitem", { name: "Merge into Other" }));
    fireEvent.click(await screen.findByRole("button", { name: "Merge" }));
    await waitFor(() => expect(callsTo("PATCH", "/api/accounts/groups")).toHaveLength(1));
    expect(callsTo("PATCH", "/api/accounts/groups")[0].body).toEqual({ from: "Investments", to: "Other", type: "A" });
  });
});

describe("static guards", () => {
  const root = path.resolve(__dirname, "../../src");
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

  it("accounts page no longer imports or renders the dialog, and links to /accounts/groups", () => {
    const src = read("app/(app)/accounts/page.tsx");
    expect(src).not.toMatch(/ManageGroupsDialog|manage-groups-dialog|manageGroupsOpen/);
    expect(src).toContain('href: "/accounts/groups"');
    expect(src).toContain('render={<Link href="/accounts/groups" />}');
    expect(fs.existsSync(path.join(root, "app/(app)/accounts/_components/manage-groups-dialog.tsx"))).toBe(false);
  });

  it("groups page and panel avoid JS viewport branching and arbitrary pixel font sizes", () => {
    for (const rel of ["app/(app)/accounts/groups/page.tsx", "app/(app)/accounts/_components/manage-groups-panel.tsx"]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/isMobile|window\.innerWidth|md:hidden/);
      expect(src, rel).not.toMatch(/text-\[\d+px\]/);
    }
  });
});
