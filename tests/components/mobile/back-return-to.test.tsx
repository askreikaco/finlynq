/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, renderHook, cleanup } from "@testing-library/react";

let mockPath: string | null = "/dashboard";
let mockSearch = "";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...r }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...r }, children),
}));

import { useBackTarget, applyReturnTo } from "@/components/adaptive/use-back-target";
import { PageHeader } from "@/components/mobile/page-header";

afterEach(() => {
  cleanup();
  mockPath = "/dashboard";
  mockSearch = "";
});

const backLink = () => document.querySelector('[data-slot="back-button"]') as HTMLElement | null;
const target = () => renderHook(() => useBackTarget()).result.current;

describe("useBackTarget with ?returnTo", () => {
  it("a valid returnTo wins over the registry parent", () => {
    mockPath = "/categories/9/edit";
    mockSearch = "returnTo=%2Ftransactions%2Fnew";
    expect(target()).toEqual({ href: "/transactions/new", level: 3 });
  });

  it("a valid returnTo with its own query string is kept verbatim", () => {
    mockPath = "/accounts";
    mockSearch = "returnTo=" + encodeURIComponent("/transactions/new?accountId=5&kind=expense");
    expect(target()).toEqual({ href: "/transactions/new?accountId=5&kind=expense", level: 2 });
  });

  it.each([
    ["protocol-relative //", "//evil.example/x"],
    ["absolute https URL", "https://evil.example/x"],
    ["backslash", "/\\evil.example"],
    ["javascript: scheme", "javascript:alert(1)"],
    ["no leading slash", "transactions/new"],
    ["tab-smuggled //", "/\t/evil.example"],
    ["space inside", "/transactions/new foo"],
  ])("an invalid returnTo (%s) is ignored, the registry parent is used", (_label, raw) => {
    mockPath = "/categories/9/edit";
    mockSearch = new URLSearchParams({ returnTo: raw }).toString();
    expect(target()).toEqual({ href: "/categories", level: 3 });
  });

  it("no returnTo: the registry parent is used", () => {
    mockPath = "/categories/9/edit";
    expect(target()).toEqual({ href: "/categories", level: 3 });
  });

  it("a level 1 tab opened with a returnTo gets a back target at level 2", () => {
    mockPath = "/accounts";
    mockSearch = "returnTo=%2Ftransactions%2Fnew";
    expect(target()).toEqual({ href: "/transactions/new", level: 2 });
  });

  it("a returnTo pointing at the current page is ignored", () => {
    mockPath = "/accounts/5";
    mockSearch = "returnTo=%2Faccounts%2F5%3Ftab%3Dx";
    expect(target()).toEqual({ href: "/accounts", level: 2 });
  });

  it("a returnTo on an unregistered route still gives a back target", () => {
    mockPath = "/nope";
    mockSearch = "returnTo=%2Ftransactions";
    expect(target()).toEqual({ href: "/transactions", level: 2 });
  });
});

describe("applyReturnTo (pure)", () => {
  it("keeps the level of a deeper page and only swaps the href", () => {
    expect(applyReturnTo({ href: "/portfolio/new", level: 3 }, "/portfolio/new/buy/x", "/portfolio/new/buy")).toEqual({
      href: "/portfolio/new/buy/x",
      level: 3,
    });
  });

  it("returns the target unchanged when returnTo is missing or invalid", () => {
    const t = { href: "/portfolio", level: 2 };
    expect(applyReturnTo(t, undefined, "/portfolio/new")).toBe(t);
    expect(applyReturnTo(t, "//x", "/portfolio/new")).toBe(t);
    expect(applyReturnTo(null, "https://x", "/nope")).toBeNull();
  });

  it("a null target with a valid returnTo becomes a level 2 target", () => {
    expect(applyReturnTo(null, "/transactions", "/nope")).toEqual({ href: "/transactions", level: 2 });
  });
});

describe("PageHeader automatic back with ?returnTo", () => {
  it("renders the back link href as the returnTo value", () => {
    mockPath = "/categories/9/edit";
    mockSearch = "returnTo=%2Ftransactions%2Fnew";
    render(<PageHeader title="Category" />);
    expect(backLink()?.getAttribute("href")).toBe("/transactions/new");
  });

  it("a level 1 tab with a returnTo shows a back link to the entry form", () => {
    mockPath = "/accounts";
    mockSearch = "returnTo=%2Ftransactions%2Fnew";
    render(<PageHeader title="Accounts" />);
    expect(backLink()?.getAttribute("href")).toBe("/transactions/new");
  });

  it("a level 1 tab without a returnTo still shows no back button", () => {
    mockPath = "/accounts";
    render(<PageHeader title="Accounts" />);
    expect(backLink()).toBeNull();
  });

  it("an explicit backHref prop still wins over a valid returnTo", () => {
    mockPath = "/categories/9/edit";
    mockSearch = "returnTo=%2Ftransactions%2Fnew";
    render(<PageHeader title="Category" backHref="/categories" />);
    expect(backLink()?.getAttribute("href")).toBe("/categories");
  });

  it("an onBack button still wins over a valid returnTo (no link rendered)", () => {
    mockPath = "/categories/9/edit";
    mockSearch = "returnTo=%2Ftransactions%2Fnew";
    const onBack = vi.fn();
    render(<PageHeader title="Category" onBack={onBack} />);
    expect(backLink()?.getAttribute("href")).toBeNull();
    expect(backLink()?.tagName).toBe("BUTTON");
  });

  it("an invalid returnTo leaves the registry parent in the header", () => {
    mockPath = "/categories/9/edit";
    mockSearch = "returnTo=" + encodeURIComponent("//evil.example");
    render(<PageHeader title="Category" />);
    expect(backLink()?.getAttribute("href")).toBe("/categories");
  });
});
