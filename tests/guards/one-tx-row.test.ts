// One row for every money list: transactions and subscriptions render src/components/mobile/tx-row.tsx.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("one transaction row", () => {
  it.each([
    "src/components/transactions/mobile-tx-list.tsx",
    "src/app/(app)/subscriptions/page.tsx",
  ])("%s renders <TxRow> from the shared mobile components", (f) => {
    const src = read(f);
    expect(src).toMatch(/import \{[^}]*\bTxRow\b[^}]*\} from "@\/components\/mobile"/);
    expect(src).toContain("<TxRow");
  });

  it("loan amortization / payment rows (inside loan detail) still use TxRow", () => {
    expect(read("src/app/(app)/loans/_components/loan-amortization.tsx")).toContain("<TxRow");
  });

  it("subscriptions and loans do not hand-roll a ListRow for their entity rows", () => {
    expect(read("src/app/(app)/loans/page.tsx")).not.toMatch(/<ListRow\b/);
    // the one ListRow left in subscriptions is the 'found in your transactions' suggestion row
    expect((read("src/app/(app)/subscriptions/page.tsx").match(/<ListRow\b/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("TxRow is the only place with the row tile + press styling", () => {
    const row = read("src/components/mobile/tx-row.tsx");
    expect(row).toContain("<ListRow");
    expect(row).toContain("TX_ROW_PRESS");
    expect(read("src/components/transactions/mobile-tx-list.tsx")).not.toContain("rounded-full\", bgClass");
    expect(read("src/components/transactions/mobile-tx-list.tsx")).not.toContain("ROW_PRESS");
  });
});
