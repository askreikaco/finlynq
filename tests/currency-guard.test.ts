/**
 * Currency hardcode guard test.
 *
 * Scans src/components and src/app/(app) for hardcoded USD/CAD currency defaults
 * that should use useDisplayCurrency() instead. This test fails if new hardcodes
 * are introduced or if allow-listed entries become stale.
 *
 * Patterns detected:
 * - `currency = "USD"` or `currency = "CAD"`
 * - `?? "USD"` or `?? "CAD"` (fallback to hardcode)
 * - `|| "USD"` or `|| "CAD"` (logical or fallback)
 * - `currency={"USD"}` or `currency="CAD"` in JSX
 * - `formatCurrency(..., "USD")` or `formatCurrency(..., "CAD")`
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const SCAN_ROOTS = [
  join(REPO_ROOT, "src/components"),
  join(REPO_ROOT, "src/app/(app)"),
];

// Files where hardcoded form-only defaults are genuinely acceptable
// Format: { file: "path/to/file.tsx", line: "exact trimmed line", count: 1, reason: "..." }
const ALLOW_LIST = [
  // OUT OF SCOPE: Mobile, portfolio, chat, and other advanced features
  {
    file: "src/components/mobile/amount.tsx",
    line: `currency = "USD",`,
    count: 2,
    reason: "Mobile component out of scope (matches both assignment and jsx-attr)",
  },
  {
    file: "src/app/(app)/chat/page.tsx",
    line: `function InlineBarChart({ data, currency = "CAD" }: { data: Record<string, unknown>[]; currency?: string }) {`,
    count: 2,
    reason: "Chat UI component out of scope, form default (matches both assignment and jsx-attr)",
  },
  {
    file: "src/app/(app)/chat/page.tsx",
    line: `function InlinePieChart({ data, currency = "CAD" }: { data: Record<string, unknown>[]; currency?: string }) {`,
    count: 2,
    reason: "Chat UI component out of scope, form default (matches both assignment and jsx-attr)",
  },
  {
    file: "src/app/(app)/chat/page.tsx",
    line: `function InlineLineChart({ data, currency = "CAD" }: { data: Record<string, unknown>[]; currency?: string }) {`,
    count: 2,
    reason: "Chat UI component out of scope, form default (matches both assignment and jsx-attr)",
  },
  {
    file: "src/components/sankey-chart.tsx",
    line: `export function SankeyChart({ incomeData, expenseData, currency = "CAD" }: SankeyChartProps) {`,
    count: 2,
    reason: "Sankey chart out of scope",
  },
  {
    file: "src/components/fx-overrides-section.tsx",
    line: `<Select value={form.rateMode === "to-usd" ? form.currency : "USD"} onValueChange={(v) => setForm({ ...form, rateMode: v === "USD" ? "from-usd" : "to-usd" })}>`,
    count: 2, // matches property-key and ternary patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): FX override ternary display path still falls back to hardcoded USD as default rate mode",
  },

  // Holdings form defaults - currency from holding/row, but falls back to CAD when missing
  {
    file: "src/components/holdings/holding-edit-form.tsx",
    line: `currency: initialHolding?.currency ?? "CAD",`,
    count: 1,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the holding currency is missing",
  },
  {
    file: "src/components/holdings/holding-edit-form.tsx",
    line: `currency: row.currency ?? "CAD",`,
    count: 1,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },

  // Reconcile components - display path falls back to CAD when row currency is missing
  {
    file: "src/components/import/reconcile/db-pane.tsx",
    line: `{formatCurrency(r.amount, r.currency || "CAD")}`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/import/reconcile/db-pane.tsx",
    line: `? formatCurrency(r.runningBalance, r.currency || "CAD")`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/import/reconcile/db-pane.tsx",
    line: `? formatCurrency(r.anchorBalance, r.currency || "CAD")`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/import/reconcile/file-pane.tsx",
    line: `{formatCurrency(r.amount, r.currency || "CAD")}`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/import/reconcile/file-pane.tsx",
    line: `? formatCurrency(dayBalance, r.currency || "CAD")`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/reconcile/bank-pane.tsx",
    line: `{formatCurrency(r.amount, r.currency || "CAD")}`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/reconcile/investment-op-preview-dialog.tsx",
    line: `const amountAbs = formatCurrency(Math.abs(preview.amount), preview.currency || "CAD");`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the preview currency is missing",
  },
  {
    file: "src/components/reconcile/transactions-pane.tsx",
    line: `{formatCurrency(r.amount, r.currency || "CAD")}`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },

  // Staging/import surfaces - display path falls back to CAD when row/bank currency is missing
  {
    file: "src/components/import/staged-review-surface.tsx",
    line: `currency: payload.bankCurrency ?? snap?.currency ?? "CAD",`,
    count: 1,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/import/staged-review-surface.tsx",
    line: `stagedCurrency: sRow.currency ?? "CAD",`,
    count: 1,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },

  // Inbox components - display path falls back to CAD when transaction/row currency is missing
  {
    file: "src/components/inbox/auto-rule-banner.tsx",
    line: `{formatCurrency(item.amount, item.currency || "CAD")}`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/inbox/row-card.tsx",
    line: `{formatCurrency(bank.amount, bank.currency || "CAD")}`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/inbox/row-card.tsx",
    line: `duplicate.txCurrency || bank.currency || "CAD",`,
    count: 1,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },

  {
    file: "src/components/staging/staged-row-editor.tsx",
    line: `Row {s.rowIndex + 1}: {s.date} · {formatCurrency(s.amount, s.currency || "CAD")} ·{" "}`,
    count: 2, // matches logical-or and format-call patterns
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },

  // Inbox reconcile tab - display path falls back to CAD when row/bank currency is missing
  {
    file: "src/components/inbox/inbox-reconcile-tab.tsx",
    line: `currency: payload.bankCurrency ?? snap?.currency ?? "CAD",`,
    count: 1,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/inbox/inbox-reconcile-tab.tsx",
    line: `let currency = "CAD";`,
    count: 2,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },

  // Inbox tabs - display path falls back to CAD when row/bank currency is missing
  {
    file: "src/components/inbox/inbox-to-approve-tab.tsx",
    line: `currency: payload.bankCurrency ?? snap?.currency ?? "CAD",`,
    count: 1,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },
  {
    file: "src/components/inbox/inbox-to-categorize-tab.tsx",
    line: `currency: payload.bankCurrency ?? snap?.currency ?? "CAD",`,
    count: 1,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },

  // Data section - importer rows default to CAD when currency is missing
  {
    file: "src/components/settings/sections/data-section.tsx",
    line: `currency: row.currency || row.Currency || "CAD",`,
    count: 2,
    reason: "KNOWN GAP (follow-up, see projects/finlynq/currency-followups.md): display path still falls back to hardcoded CAD when the row currency is missing",
  },

  // OUT OF SCOPE: Onboarding and form helpers
  {
    file: "src/components/onboarding-wizard.tsx",
    line: `onValueChange={(v) => setCurrency(v || "USD")}`,
    count: 1,
    reason: "Onboarding form currency picker",
  },
  {
    file: "src/components/prompts/prompt-forms.tsx",
    line: `onValueChange={(v) => setCurrency(v || "USD")}`,
    count: 1,
    reason: "Prompt form currency picker",
  },
  {
    file: "src/components/prompts/prompt-forms.tsx",
    line: `const [currency, setCurrency] = useState("USD");`,
    count: 1,
    reason: "Prompt form useState currency default",
  },
  {
    file: "src/components/onboarding-wizard.tsx",
    line: `const [currency, setCurrency] = useState("USD");`,
    count: 1,
    reason: "Onboarding form useState currency default",
  },
  {
    file: "src/app/(app)/settings/investments/page.tsx",
    line: `const [addCurrency, setAddCurrency] = useState("USD");`,
    count: 1,
    reason: "Investment settings form useState currency default",
  },

  // Transaction dialog form defaults
  {
    file: "src/components/transactions/transaction-dialog.tsx",
    line: `currency: "CAD",`,
    count: 1,
    reason: "Transaction form default values, form-only (not display-reaching)",
  },

];

/**
 * Recursively find all files in a directory.
 */
function findFiles(dir: string, pattern = /\.(tsx?|jsx?)$/): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".next" && !entry.name.startsWith(".")) {
          files.push(...findFiles(path, pattern));
        }
      } else if (pattern.test(entry.name)) {
        files.push(path);
      }
    }
  } catch {
    // Directory doesn't exist; skip
  }
  return files;
}

/**
 * Extract relative path for reporting.
 */
function relPath(abs: string): string {
  return abs.replace(`${REPO_ROOT}/`, "");
}

describe("Currency Hardcodes Guard", () => {
  it("should have no unallowed hardcoded USD/CAD currency defaults", () => {
    const violations: string[] = [];
    const allowListUsed = new Set<string>();

    const patterns = [
      // Pattern 1: Direct assignment (currency = "USD" or currency = "CAD")
      { regex: /\bcurrency\s*=\s*["'](USD|CAD)["']/g, name: "assignment" },
      // Pattern 2: Nullish coalesce (currency ?? "USD" or currency ?? "CAD")
      { regex: /\?\?\s*["'](USD|CAD)["']/g, name: "nullish" },
      // Pattern 3: Logical or (currency || "USD" or currency || "CAD")
      { regex: /\|\|\s*["'](USD|CAD)["']/g, name: "logical-or" },
      // Pattern 4: JSX attribute (currency="USD" or currency="CAD" or currency={"USD"})
      { regex: /currency\s*=\s*["'{]*(USD|CAD)["}]/g, name: "jsx-attr" },
      // Pattern 5: formatCurrency call (any line with formatCurrency followed by "USD"/"CAD" at end of call)
      { regex: /formatCurrency\s*\(.*?["'](USD|CAD)["']\s*\)/g, name: "format-call" },
      // Pattern 6: Default currency fallback (DEFAULT_CURRENCY = "CAD")
      { regex: /DEFAULT_CURRENCY\s*=\s*["'](CAD)["']/g, name: "constant" },
      // Pattern 7: useState with hardcoded default (useState("USD") or useState("CAD"))
      { regex: /useState\s*\(\s*["'](USD|CAD)["']\s*\)/g, name: "useState" },
      // Pattern 8: Property key in object literal ({ currency: "USD" } or { currency: "CAD" })
      { regex: /\bcurrency\s*:\s*["'](USD|CAD)["']/g, name: "property-key" },
      // Pattern 9: Ternary fallback tail (? something : "CAD" or ? something : "USD")
      { regex: /\?\s*[^:]*:\s*["'](USD|CAD)["']/g, name: "ternary" },
    ];

    for (const scanRoot of SCAN_ROOTS) {
      const files = findFiles(scanRoot);

      for (const file of files) {
        const content = readFileSync(file, "utf-8");
        const relfile = relPath(file);
        const lines = content.split("\n");

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          const trimmed = line.trim();

          // Skip comments
          if (trimmed.startsWith("//")) {
            continue;
          }

          for (const { regex, name } of patterns) {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(line)) !== null) {
              const currency = match[1]; // USD or CAD
              const lineNum = lineIdx + 1;

              // Check if this violation is in the allow list
              const key = `${relfile}:${trimmed}`;
              const allowed = ALLOW_LIST.find(
                (a) =>
                  a.file === relfile &&
                  a.line === trimmed &&
                  a.count > 0
              );

              if (allowed) {
                // Decrement the allowed count
                allowed.count--;
                allowListUsed.add(key);
              } else {
                violations.push(
                  `${relfile}:${lineNum}: hardcoded ${currency} (${name})\n  ${line}`
                );
              }
            }
          }
        }
      }
    }

    // Check for stale allow-list entries (unused)
    const staleEntries = ALLOW_LIST.filter((e) => {
      const key = `${e.file}:${e.line}`;
      return !allowListUsed.has(key);
    });

    let message = "";
    if (violations.length > 0) {
      message += `Found ${violations.length} hardcoded currency defaults:\n\n${violations.join("\n\n")}\n\n`;
    }
    if (staleEntries.length > 0) {
      message += `Stale allow-list entries (found no matching line):\n${staleEntries
        .map((e) => `  - ${e.file}: "${e.line}"`)
        .join("\n")}\n`;
    }

    expect(violations.length).toBe(0);
    expect(staleEntries.length).toBe(0);

    if (message) {
      throw new Error(message);
    }
  });

  it("should scan both required roots (components and app)", () => {
    for (const root of SCAN_ROOTS) {
      const files = findFiles(root);
      expect(files.length).toBeGreaterThan(0);
    }
  });
});
