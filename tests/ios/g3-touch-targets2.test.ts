// @vitest-environment node
// G3 touch targets (round 2): >=44pt hit areas below md via max-md: variants, pressed states on
// switch / checkbox / tabs. Static source assertions only (no dev server, no Playwright).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");

const switchSrc = read("src/components/ui/switch.tsx");
const tabsSrc = read("src/components/ui/tabs.tsx");
const checkboxSrc = read("src/components/ui/checkbox.tsx");
const comboSrc = read("src/components/ui/combobox.tsx");
const workspace = read("src/app/(app)/transactions/_components/transactions-workspace.tsx");
const accountPage = read("src/app/(app)/accounts/[id]/page.tsx");
const moreMenu = read("src/components/more-menu.tsx");
const portfolio = read("src/app/(app)/portfolio/page.tsx");
const family = read("src/app/(app)/family/_components/overview-tab.tsx");
const shell = read("src/components/account-shell.tsx");
const consent = read("src/components/analytics-consent.tsx");

const BANNED = /md:hidden|hidden\s+md:|isMobile|window\.innerWidth/;

describe("switch hit area (44pt tall below md, desktop track unchanged)", () => {
  it("hit-slop is 12px top and bottom below md (22px padding box + 24px = 46px)", () => {
    expect(switchSrc).toContain("max-md:before:-inset-y-3");
    expect(switchSrc).toContain("max-md:before:-inset-x-2");
  });
  it("visual track stays h-6 w-10", () => {
    expect(switchSrc).toContain("h-6 w-10");
  });
  it("pressed state: unchecked and checked both change background", () => {
    expect(switchSrc).toContain("active:bg-input/80");
    expect(switchSrc).toContain("data-[checked]:active:bg-primary/80");
  });
});

describe("tabs trigger hit area and pressed state", () => {
  it("trigger hit-slop below md reaches the 44px list height (clipped by the list)", () => {
    expect(tabsSrc).toContain("max-md:before:-inset-y-1.5");
    expect(tabsSrc).toContain("max-md:before:absolute");
  });
  it("list keeps h-11 below md", () => {
    expect(tabsSrc).toContain("max-md:group-data-horizontal/tabs:h-11");
  });
  it("pressed state on triggers (text and default-variant background)", () => {
    expect(tabsSrc).toContain("active:text-foreground");
    expect(tabsSrc).toContain("group-data-[variant=default]/tabs-list:active:bg-background/60");
  });
});

describe("checkbox pressed state", () => {
  it("active ring feedback on the native control", () => {
    expect(checkboxSrc).toContain("active:ring-3 active:ring-primary/20");
  });
});

describe("combobox trigger reaches 44px below md (matches select.tsx)", () => {
  it("default and sm sizes are h-11 below md", () => {
    expect(comboSrc).toContain("max-md:data-[size=default]:h-11");
    expect(comboSrc).toContain("max-md:data-[size=sm]:h-11");
  });
  it("desktop heights unchanged", () => {
    expect(comboSrc).toContain("data-[size=default]:h-8");
    expect(comboSrc).toContain("data-[size=sm]:h-7");
  });
});

describe("page-level targets", () => {
  it("transactions 'Search and filter' link has min-h-11", () => {
    expect(workspace).toMatch(/"flex min-h-11 flex-1 items-center gap-2 px-3 py-2\.5 bg-muted rounded-lg/);
  });
  it("accounts/[id] 'Back to Accounts' links are 44px tall on coarse pointers (both render paths)", () => {
    const n = accountPage.split('className="inline-flex pointer-coarse:min-h-11 items-center gap-1.5').length - 1;
    expect(n).toBe(2);
    expect(accountPage).not.toContain("max-md:min-h-11");
  });
  it("accounts/[id] Information edit icon button is 44px wide on coarse pointers", () => {
    expect(accountPage).toMatch(/variant="ghost"\s*\n\s*className="pointer-coarse:w-11 pointer-coarse:px-0"\s*\n\s*onClick=\{\(\) => openEdit\("details"\)\}\s*\n\s*title="Edit account"/);
    expect(accountPage).not.toContain("max-md:w-11");
  });
  it("more-menu theme segment: min-h-9, min-h-11 for touch input (pointer-coarse, not width), with pressed bg", () => {
    expect(moreMenu).toContain("min-h-9 pointer-coarse:min-h-11 rounded-md px-2.5");
    expect(moreMenu).toContain("active:bg-muted");
  });
  it("portfolio 'Add Account' link has min-h-11", () => {
    expect(portfolio).toContain("inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2");
  });
  it("family overview Refresh button is 44x44 on coarse pointers, 36x36 otherwise", () => {
    expect(family).toContain("w-9 h-9 pointer-coarse:w-11 pointer-coarse:h-11");
  });
  it("account shell Info/Security tabs are 44px tall and wide below md", () => {
    expect(shell).toContain("max-md:flex max-md:min-h-11 max-md:min-w-11 max-md:items-end");
  });
  it("consent banner z-[9999] is still pinned (tests/ios/g3a-dvh-overscroll.test.ts)", () => {
    expect(consent).toContain("z-[9999]");
  });
});

describe("guards on the touched primitives", () => {
  it.each([
    ["switch", switchSrc],
    ["tabs", tabsSrc],
    ["checkbox", checkboxSrc],
    ["combobox", comboSrc],
  ])("%s adds no adaptive-JS or md:hidden pattern", (_name, src) => {
    expect(src).not.toMatch(BANNED);
  });
  it.each([
    ["switch", switchSrc],
    ["tabs", tabsSrc],
    ["combobox", comboSrc],
  ])("%s uses no custom px font size", (_name, src) => {
    expect(src).not.toMatch(/text-\[\d+px\]/);
  });
});
