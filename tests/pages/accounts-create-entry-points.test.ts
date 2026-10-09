// @vitest-environment node
// Static guard: account creation lives on /accounts/new. No create-mode dialog
// wiring may come back on the list, the portfolio empty state or the detail page.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const ACCOUNTS = "src/app/(app)/accounts/page.tsx";
const PORTFOLIO = "src/app/(app)/portfolio/page.tsx";
const DETAIL = "src/app/(app)/accounts/[id]/page.tsx";

describe("account create entry points", () => {
  it("accounts list no longer opens AccountDialog or registers the accounts.create FAB handler", () => {
    const src = read(ACCOUNTS);
    expect(src).not.toContain("AccountDialog");
    expect(src).not.toContain('usePageFab("accounts.create"');
    expect(src).toContain('href="/accounts/new"');
  });

  it("portfolio Add Account links to /accounts/new with returnTo=/portfolio", () => {
    const src = read(PORTFOLIO);
    expect(src).toContain('href="/accounts/new?returnTo=/portfolio"');
    expect(src).not.toMatch(/href="\/accounts"[^>]*>\s*Add Account/);
  });

  it("no page opens AccountDialog in create mode", () => {
    for (const f of [ACCOUNTS, PORTFOLIO, DETAIL]) {
      expect(read(f), f).not.toMatch(/mode="create"/);
    }
    expect(read(DETAIL)).toMatch(/<AccountDialog\s+open=/);
  });

  it("the New account page is the only create surface and reuses the shared form", () => {
    const page = read("src/app/(app)/accounts/new/page.tsx");
    expect(page).toContain("AccountForm");
    expect(page).toContain('mode="create"');
  });
});
