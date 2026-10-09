// @vitest-environment node
/**
 * Static guard for the loans + subscriptions conversion: create and edit are
 * full pages (/loans/new, /loans/[id]/edit, /subscriptions/new,
 * /subscriptions/[id]/edit). The list pages navigate to them and must no
 * longer render a create/edit dialog. Delete stays a confirm dialog.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { FAB_ROUTES } from "@/components/mobile/fab-registry";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LOANS_LIST = read("src/app/(app)/loans/page.tsx");
const SUBS_LIST = read("src/app/(app)/subscriptions/page.tsx");
const LOAN_FORM = read("src/app/(app)/loans/_components/loan-form.tsx");
const SUB_FORM = read("src/app/(app)/subscriptions/_components/subscription-form.tsx");

describe("loans list: navigates, no create/edit dialog", () => {
  const src = code(LOANS_LIST);
  it("renders no Dialog and no form state", () => {
    expect(src).not.toMatch(/<Dialog\b/);
    expect(src).not.toMatch(/DialogContent/);
    expect(src).not.toMatch(/function (openCreate|openEdit|handleSubmit|doSave|buildPayload)\b/);
  });
  it("create and edit go to the full pages", () => {
    expect(src).toContain('router.push("/loans/new")');
    expect(src).toContain("router.push(`/loans/${loan.id}/edit`)");
  });
  it("keeps the delete confirm on the list", () => {
    expect(src).toContain('title="Delete loan"');
  });
  it("no longer registers the create FAB handler", () => {
    expect(src).not.toMatch(/usePageFab\(/);
  });
});

describe("subscriptions list: navigates, no create/edit dialog", () => {
  const src = code(SUBS_LIST);
  it("does not import or render SubscriptionDialog", () => {
    expect(src).not.toMatch(/SubscriptionDialog/);
    expect(src).not.toMatch(/subscription-dialog/);
    expect(src).not.toMatch(/<Dialog\b/);
  });
  it("add, edit and review navigate", () => {
    expect(src).toContain('router.push("/subscriptions/new")');
    expect(src).toContain("router.push(`/subscriptions/${id}/edit");
    expect(src).toContain("router.push(draftSearchParams(");
  });
  it("keeps the delete confirm on the list", () => {
    expect(src).toContain('title="Delete subscription"');
  });
  it("no longer registers the create FAB handler", () => {
    expect(src).not.toMatch(/usePageFab\(/);
  });
});

describe("shared forms and new routes exist", () => {
  it("loan form is shared by create and edit, one payload builder", () => {
    const f = code(LOAN_FORM);
    expect(f).toMatch(/export function LoanForm\(/);
    expect(f.match(/function buildPayload\(/g) ?? []).toHaveLength(1);
    expect(f).toContain('method: isEdit ? "PUT" : "POST"');
    expect(f).toContain("pendingRedenominate");
  });
  it("subscription form is shared by create and edit, one payload builder", () => {
    const f = code(SUB_FORM);
    expect(f).toMatch(/export function SubscriptionForm\(/);
    expect(f).toContain('method: isEdit ? "PUT" : "POST"');
  });
  it.each([
    "src/app/(app)/loans/new/page.tsx",
    "src/app/(app)/loans/[id]/edit/page.tsx",
    "src/app/(app)/subscriptions/new/page.tsx",
    "src/app/(app)/subscriptions/[id]/edit/page.tsx",
  ])("%s exists and validates returnTo", (rel) => {
    expect(existsSync(path.join(ROOT, rel))).toBe(true);
    expect(read(rel)).toContain("safeReturnTo(");
  });
  it("the delete confirm lives on the edit pages, behind the overflow", () => {
    for (const rel of ["src/app/(app)/loans/[id]/edit/page.tsx", "src/app/(app)/subscriptions/[id]/edit/page.tsx"]) {
      const s = read(rel);
      expect(s).toContain("overflow={[");
      expect(s).toContain("<ConfirmDialog");
    }
  });
  it("the old subscription dialog file is gone", () => {
    expect(existsSync(path.join(ROOT, "src/app/(app)/subscriptions/_components/subscription-dialog.tsx"))).toBe(false);
  });
});

describe("FAB registry wiring for the conversion", () => {
  it("list pages are route entries to the create pages", () => {
    const loans = FAB_ROUTES["/loans"];
    const subs = FAB_ROUTES["/subscriptions"];
    expect(loans.kind === "route" && loans.href).toBe("/loans/new");
    expect(loans.kind === "route" && loans.label).toBe("Add loan");
    expect(subs.kind === "route" && subs.href).toBe("/subscriptions/new");
    expect(subs.kind === "route" && subs.label).toBe("Add subscription");
  });
  it.each(["/loans/new", "/loans/[id]/edit", "/subscriptions/new", "/subscriptions/[id]/edit"])("%s is a hidden create/edit flow", (r) => {
    expect(FAB_ROUTES[r]?.kind).toBe("hidden");
  });
});
