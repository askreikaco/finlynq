/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SizeClass } from "@/components/ui/size-class";

// Size class and session are controlled per test. Everything else is the real code.
const size: { current: SizeClass } = { current: "compact" };
const session: { userId: string | null; ready: boolean } = { userId: null, ready: true };

vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => size.current,
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: session.userId, ready: session.ready }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => "/accounts" }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));

import AccountsPage from "@/app/(app)/accounts/page";
import { VIEW_MODE_STORAGE_KEY } from "@/components/adaptive/view-mode";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../src/app/(app)/accounts/page.tsx"), "utf-8");

const balances = [
  { accountId: 1, accountName: "Techcombank", accountType: "A", accountGroup: "Banks", currency: "VND", balance: 40000000, convertedBalance: 40000000 },
  { accountId: 4, accountName: "Visa", accountType: "L", accountGroup: "Credit Card", currency: "VND", balance: -5000000, convertedBalance: -5000000 },
];

let uid = 0;
beforeEach(() => {
  uid += 1;
  session.userId = `accounts-dataview-user-${uid}`;
  size.current = "compact";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/api/dashboard") ? { balances } : {}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* storage may be unavailable */ }
});

async function mountPage() {
  render(<AccountsPage />);
  await screen.findByRole("heading", { level: 1, name: "Accounts" });
}

function mountedViews(): string[] {
  return Array.from(document.querySelectorAll("[data-view]")).map((el) => el.getAttribute("data-view") ?? "");
}

function storedPrefs(): Record<string, string> {
  const raw = localStorage.getItem(`${VIEW_MODE_STORAGE_KEY}:${session.userId}`);
  return raw ? JSON.parse(raw) : {};
}

describe("Accounts page: one DataView, one toolbar", () => {
  it("exactly one of [data-view=cards] / [data-view=list] is mounted; compact defaults to cards", async () => {
    await mountPage();
    expect(mountedViews()).toEqual(["cards"]);
    expect(document.querySelector("[data-view=cards]")).not.toBeNull();
    expect(document.querySelector("[data-view=list]")).toBeNull();
  });

  it("the toggle switches the mounted view both ways", async () => {
    await mountPage();
    fireEvent.click(screen.getByRole("radio", { name: /List/ }));
    await waitFor(() => expect(mountedViews()).toEqual(["list"]));
    expect(screen.getByRole("radio", { name: /List/ }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: /Cards/ }));
    await waitFor(() => expect(mountedViews()).toEqual(["cards"]));
  });

  it("the page has one toolbar with one Cards/List control", async () => {
    await mountPage();
    expect(screen.getAllByRole("radiogroup", { name: "View" })).toHaveLength(1);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("the choice persists per size class: a list choice on compact does not change wide", async () => {
    size.current = "compact";
    await mountPage();
    fireEvent.click(screen.getByRole("radio", { name: /List/ }));
    await waitFor(() => expect(storedPrefs()).toEqual({ "accounts:compact": "list" }));
    cleanup();

    // Wide has no stored choice: its default for accounts is the list.
    size.current = "wide";
    await mountPage();
    expect(mountedViews()).toEqual(["list"]);
    fireEvent.click(screen.getByRole("radio", { name: /Cards/ }));
    await waitFor(() => expect(storedPrefs()["accounts:wide"]).toBe("cards"));
    expect(storedPrefs()["accounts:compact"]).toBe("list");
    cleanup();

    // Back on compact the stored list choice still applies, and wide's cards choice is not used.
    size.current = "compact";
    await mountPage();
    expect(mountedViews()).toEqual(["list"]);
  });

  it("a stored choice survives a remount for the same user and size class", async () => {
    size.current = "regular";
    await mountPage();
    expect(mountedViews()).toEqual(["cards"]);
    fireEvent.click(screen.getByRole("radio", { name: /List/ }));
    await waitFor(() => expect(storedPrefs()["accounts:regular"]).toBe("list"));
    cleanup();

    await mountPage();
    expect(mountedViews()).toEqual(["list"]);
  });
});

describe("Accounts page: no size-class wrappers around sections", () => {
  it("CompactOnly / FromMd appear only as the Add / New-account label swap (span)", () => {
    const wrappers = SRC.match(/<(CompactOnly|FromMd)\b[^>]*>/g) ?? [];
    expect(wrappers.length).toBeGreaterThan(0);
    for (const tag of wrappers) expect(tag).toMatch(/as="span"/);
  });

  it("the sections live inside the DataView, not behind size wrappers", () => {
    const dataView = SRC.indexOf("<DataView");
    expect(dataView).toBeGreaterThan(-1);
    expect(SRC.indexOf("renderMobileSection(\"Assets\"")).toBeGreaterThan(dataView);
    expect(SRC.indexOf("renderSection(\"Assets\"")).toBeGreaterThan(dataView);
    expect(SRC.match(/<DataView\b/g)).toHaveLength(1);
    expect(SRC.match(/<ViewModeToggle\b/g)).toHaveLength(1);
  });

  it("the list layout carries no viewport tokens (md:/lg:/max-md:)", () => {
    const list = SRC.slice(SRC.indexOf("list={"), SRC.indexOf("/>", SRC.indexOf("list={")));
    expect(list).not.toMatch(/(^|[\s"'`])(max-)?(sm|md|lg|xl|2xl):/);
    expect(list).toContain("wide:grid-cols-2");
  });
});
