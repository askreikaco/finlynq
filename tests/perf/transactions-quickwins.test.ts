import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCurrency } from "@/lib/currency";
import { PERSIST_ALLOWED, isSafeToPersist } from "@/lib/data/persist-policy";

const ROOT = resolve(process.cwd());
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

// Counts Intl.NumberFormat constructions while still returning real formatters.
function spyNumberFormat() {
  const Orig = Intl.NumberFormat;
  const spy = vi.fn(function (locale?: string | string[], opts?: Intl.NumberFormatOptions) {
    return new Orig(locale, opts);
  });
  (Intl as { NumberFormat: unknown }).NumberFormat = spy;
  return { spy, restore: () => { (Intl as { NumberFormat: unknown }).NumberFormat = Orig; } };
}
let restoreIntl: (() => void) | undefined;

describe("transactions perf quick wins", () => {
  afterEach(() => {
    restoreIntl?.();
    restoreIntl = undefined;
    vi.restoreAllMocks();
  });

  it("(1) skeleton shows only on initial load, not on background revalidate", () => {
    const table = read("src/app/(app)/transactions/_components/transaction-table.tsx");
    expect(table).toContain("if (loading && txns.length === 0) return <TableSkeleton />;");
    expect(table).not.toContain("if (loading) return <TableSkeleton />;");

    const mobile = read("src/components/transactions/mobile-tx-list.tsx");
    expect(mobile).toContain("if (isLoading && transactions.length === 0) {");

    const workspace = read("src/app/(app)/transactions/_components/transactions-workspace.tsx");
    expect(workspace).toContain("isLoading={loading && txns.length === 0}");
  });

  it("(2) persist policy excludes the unfiltered /api/transactions ledger", () => {
    expect(PERSIST_ALLOWED.has("/api/transactions")).toBe(false);
    expect(isSafeToPersist("/api/transactions")).toBe(false);
    expect(isSafeToPersist("/api/transactions?limit=100000")).toBe(false);
    // other financial lists still persist
    expect(isSafeToPersist("/api/accounts")).toBe(true);
    expect(isSafeToPersist("/api/budgets")).toBe(true);
  });

  it("(3) formatCurrency constructs each Intl.NumberFormat once and returns identical strings", () => {
    const first = formatCurrency(1234.5, "NOK", { decimals: 2 });
    const { spy, restore } = spyNumberFormat();
    restoreIntl = restore;
    const second = formatCurrency(1234.5, "NOK", { decimals: 2 });
    const third = formatCurrency(1234.5, "NOK", { decimals: 2 });
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("(3b) a new currency constructs exactly one formatter across repeated calls", () => {
    const { spy, restore } = spyNumberFormat();
    restoreIntl = restore;
    const a = formatCurrency(-99.5, "SEK", { decimals: 2 });
    const b = formatCurrency(-99.5, "SEK", { decimals: 2 });
    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("(3c) dollar-family symbol path is memoized and unchanged", () => {
    const { spy, restore } = spyNumberFormat();
    restoreIntl = restore;
    expect(formatCurrency(-1234, "CAD", { decimals: 0 })).toBe("-C$1,234");
    formatCurrency(5, "CAD", { decimals: 0 });
    formatCurrency(7, "CAD", { decimals: 0 });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
