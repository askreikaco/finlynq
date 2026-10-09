/**
 * Static guard (PKG1 tx-edit): the edit, transfer-edit and split entry points navigate to pages.
 * Edit flows never mount the dialog; the dialog keeps only the create-mode callers.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("edit openers navigate instead of opening a dialog", () => {
  it("transactions workspace does not mount the transaction dialog or split dialog", () => {
    const src = read("src/app/(app)/transactions/_components/transactions-workspace.tsx");
    expect(src).not.toMatch(/<TransactionDialog\b/);
    expect(src).not.toMatch(/<SplitDialog\b/);
    expect(src).toMatch(/transactionEditHref\(/);
  });

  it("the shared edit form and both edit pages never render the dialog component", () => {
    for (const p of [
      "src/app/(app)/transactions/_components/transaction-edit-form.tsx",
      "src/app/(app)/transactions/[id]/edit/page.tsx",
      "src/app/(app)/transactions/transfer/[linkId]/edit/page.tsx",
    ]) {
      const src = read(p);
      expect(src, p).not.toMatch(/<TransactionDialog\b/);
      expect(src, p).not.toMatch(/\bDialog(Content)?\s+open=\{\s*true/);
    }
  });

  it("the form body and hook keep the save logic but not the dialog chrome", () => {
    const body = read("src/components/transactions/transaction-form-body.tsx");
    expect(body).not.toMatch(/from "@\/components\/ui\/dialog"/);
    const hook = read("src/components/transactions/use-transaction-form.ts");
    expect(hook).toMatch(/fetch\("\/api\/transactions", \{/);
    expect(hook).toMatch(/fetch\("\/api\/transactions\/transfer", \{/);
  });

  it("the edit page is a page route, not a modal: the Save primary is the form-bound header action", () => {
    const src = read("src/app/(app)/transactions/_components/transaction-edit-form.tsx");
    expect(src).toMatch(/form=\{FORM_ID\}/);
    expect(src).toMatch(/<PageHeader/);
    expect(src).toMatch(/Delete this transaction\?|Delete this transfer\?/);
  });

  it("returnTo is validated on both edit pages", () => {
    for (const p of [
      "src/app/(app)/transactions/[id]/edit/page.tsx",
      "src/app/(app)/transactions/transfer/[linkId]/edit/page.tsx",
    ]) {
      expect(read(p), p).toMatch(/safeReturnTo\(searchParams\.get\("returnTo"\)/);
    }
  });

  it("the edit routes hide the mobile tab bar", () => {
    expect(read("src/components/nav.tsx")).toMatch(/\\\/transactions\\\/\\d\+\\\/\(edit\|split\)/);
  });

  it("the transfer edit route exists", () => {
    expect(existsSync(join(root, "src/app/(app)/transactions/transfer/[linkId]/edit/page.tsx"))).toBe(true);
  });
});
