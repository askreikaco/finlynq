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
    file: "src/components/portfolio/PerformanceChart.tsx",
    line: `const stackCurrency = holdings?.currency ?? data?.currency ?? "USD";`,
    count: 1,
    reason: "Portfolio chart uses account/data currency fallback",
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

  // OUT OF SCOPE: Holdings and portfolio forms
  {
    file: "src/components/holdings/holding-edit-form.tsx",
    line: `currency: initialHolding?.currency ?? "CAD",`,
    count: 1,
    reason: "Holding form fallback to holding currency",
  },
  {
    file: "src/components/holdings/holding-edit-form.tsx",
    line: `currency: row.currency ?? "CAD",`,
    count: 1,
    reason: "Holding edit form fallback to row currency",
  },

  // OUT OF SCOPE: Import/reconcile components (data-driven, currency from rows/accounts)
  {
    file: "src/components/import/reconcile/db-pane.tsx",
    line: `{formatCurrency(r.amount, r.currency || "CAD")}`,
    count: 1,
    reason: "Reconcile display falls back to bank row currency",
  },
  {
    file: "src/components/import/reconcile/db-pane.tsx",
    line: `? formatCurrency(r.runningBalance, r.currency || "CAD")`,
    count: 1,
    reason: "Reconcile balance falls back to bank row currency",
  },
  {
    file: "src/components/import/reconcile/db-pane.tsx",
    line: `? formatCurrency(r.anchorBalance, r.currency || "CAD")`,
    count: 1,
    reason: "Reconcile balance falls back to bank row currency",
  },
  {
    file: "src/components/import/reconcile/file-pane.tsx",
    line: `{formatCurrency(r.amount, r.currency || "CAD")}`,
    count: 1,
    reason: "Reconcile display falls back to bank row currency",
  },
  {
    file: "src/components/import/reconcile/file-pane.tsx",
    line: `? formatCurrency(dayBalance, r.currency || "CAD")`,
    count: 1,
    reason: "Reconcile balance falls back to bank row currency",
  },
  {
    file: "src/components/reconcile/bank-pane.tsx",
    line: `{formatCurrency(r.amount, r.currency || "CAD")}`,
    count: 1,
    reason: "Reconcile display falls back to bank row currency",
  },
  {
    file: "src/components/reconcile/confirm-delete-bank-row.tsx",
    line: `{formatCurrency(bankAmount, bankCurrency || "CAD")}`,
    count: 1,
    reason: "Delete confirm displays bank row currency",
  },
  {
    file: "src/components/reconcile/investment-op-preview-dialog.tsx",
    line: `const amountAbs = formatCurrency(Math.abs(preview.amount), preview.currency || "CAD");`,
    count: 1,
    reason: "Investment preview falls back to preview currency",
  },
  {
    file: "src/components/reconcile/transactions-pane.tsx",
    line: `{formatCurrency(r.amount, r.currency || "CAD")}`,
    count: 1,
    reason: "Reconcile display falls back to bank row currency",
  },

  // OUT OF SCOPE: Staging/import surface (data-driven)
  {
    file: "src/components/import/staged-review-surface.tsx",
    line: `const driftCurrency = dbRows[0]?.currency ?? "USD";`,
    count: 1,
    reason: "Staged import surfaces use account/row currency",
  },
  {
    file: "src/components/import/staged-review-surface.tsx",
    line: `currency: payload.bankCurrency ?? snap?.currency ?? "CAD",`,
    count: 1,
    reason: "Staged import surfaces use account/row currency",
  },
  {
    file: "src/components/import/staged-review-surface.tsx",
    line: `stagedCurrency: sRow.currency ?? "CAD",`,
    count: 1,
    reason: "Staged import surfaces use row currency",
  },

  // OUT OF SCOPE: Inbox components (data-driven from transactions)
  {
    file: "src/components/inbox/auto-rule-banner.tsx",
    line: `{formatCurrency(item.amount, item.currency || "CAD")}`,
    count: 1,
    reason: "Inbox banner displays transaction currency",
  },
  {
    file: "src/components/inbox/row-card.tsx",
    line: `{formatCurrency(bank.amount, bank.currency || "CAD")}`,
    count: 1,
    reason: "Row card displays bank row currency",
  },
  {
    file: "src/components/inbox/row-card.tsx",
    line: `duplicate.txCurrency || bank.currency || "CAD",`,
    count: 1,
    reason: "Row card falls back through tx/bank/default currency",
  },

  // OUT OF SCOPE: Staging/reconciliation (data-driven)
  {
    file: "src/components/staging/balance-warning-banner.tsx",
    line: `return formatCurrency(value, currency ?? "USD");`,
    count: 1,
    reason: "Balance banner fallback to display currency is acceptable",
  },
  {
    file: "src/components/staging/reconciliation-callout.tsx",
    line: `const ccy = statementCurrency ?? boundAccountCurrency ?? "USD";`,
    count: 1,
    reason: "Reconciliation callout uses statement/account/display currency",
  },
  {
    file: "src/components/staging/staged-row-editor.tsx",
    line: `Row {s.rowIndex + 1}: {s.date} · {formatCurrency(s.amount, s.currency || "CAD")} ·{" "}`,
    count: 1,
    reason: "Staged row editor displays row currency",
  },

  // OUT OF SCOPE: Transaction dialog (complex form with many currency sources)
  {
    file: "src/components/transactions/transaction-dialog.tsx",
    line: `const targetCcy = toAcct?.currency ?? "USD";`,
    count: 1,
    reason: "Transaction dialog uses account currency",
  },
  {
    file: "src/components/transactions/transaction-dialog.tsx",
    line: `currency: acct?.currency ?? displayCurrency ?? "USD",`,
    count: 1,
    reason: "Transaction form uses account currency",
  },
  {
    file: "src/components/transactions/transaction-dialog.tsx",
    line: `<Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v ?? displayCurrency ?? "USD" })}>`,
    count: 1,
    reason: "Transaction currency selector form",
  },
  {
    file: "src/components/transactions/transaction-dialog.tsx",
    line: `? fxPreviewText(transferFxPreview.converted, toAcct?.currency ?? "USD")`,
    count: 1,
    reason: "Transaction FX preview uses account currency",
  },
  {
    file: "src/components/transactions/transaction-dialog.tsx",
    line: `: \`0.\${"0".repeat(currencyDecimals(toAcct?.currency ?? "USD"))}\``,
    count: 1,
    reason: "Transaction FX preview uses account currency",
  },

  // OUT OF SCOPE: Account page and settings forms
  {
    file: "src/app/(app)/accounts/[id]/page.tsx",
    line: `setNewSleeveCurrency(account?.currency ?? "USD");`,
    count: 1,
    reason: "Account detail uses account currency default",
  },
  {
    file: "src/app/(app)/settings/investments/page.tsx",
    line: `currency={pricesTarget?.currency ?? "USD"}`,
    count: 1,
    reason: "Investment settings price target currency",
  },
  {
    file: "src/app/(app)/settings/general/page.tsx",
    line: `const v = (val ?? "USD").toUpperCase();`,
    count: 1,
    reason: "General settings currency picker default",
  },

  // OUT OF SCOPE: Reconcile preview table
  {
    file: "src/components/reconcile/preview-table.tsx",
    line: `{formatCurrency(row.amount, row.currency ?? accountCurrency ?? "USD")}`,
    count: 1,
    reason: "Preview table uses row/account/display currency chain",
  },

  // OUT OF SCOPE: Dividends page
  {
    file: "src/app/(app)/portfolio/dividends/page.tsx",
    line: `const reportingCcy = data?.reportingCurrency ?? "USD";`,
    count: 1,
    reason: "Dividends page uses API reportingCurrency fallback",
  },

  // OUT OF SCOPE: Health info dialog
  {
    file: "src/app/(app)/dashboard/_components/health-info-dialog.tsx",
    line: `const reporting = data.reportingCurrency ?? displayCurrency ?? "USD";`,
    count: 1,
    reason: "Health dialog uses API currency chain",
  },

  // OUT OF SCOPE: Inbox reconcile tab (already addressed in component-level tests)
  {
    file: "src/components/inbox/inbox-reconcile-tab.tsx",
    line: `currency: payload.bankCurrency ?? snap?.currency ?? "CAD",`,
    count: 1,
    reason: "Inbox reconcile tab uses bank row currency",
  },
  {
    file: "src/components/inbox/inbox-reconcile-tab.tsx",
    line: `let currency = "CAD";`,
    count: 2,
    reason: "Inbox reconcile tab local variable initialization",
  },

  // OUT OF SCOPE: Inbox tabs (data-driven)
  {
    file: "src/components/inbox/inbox-to-approve-tab.tsx",
    line: `currency: payload.bankCurrency ?? snap?.currency ?? "CAD",`,
    count: 1,
    reason: "Inbox to-approve tab uses bank row currency",
  },
  {
    file: "src/components/inbox/inbox-to-categorize-tab.tsx",
    line: `currency: payload.bankCurrency ?? snap?.currency ?? "CAD",`,
    count: 1,
    reason: "Inbox to-categorize tab uses bank row currency",
  },

  // OUT OF SCOPE: Data section (transaction data display)
  {
    file: "src/components/settings/sections/data-section.tsx",
    line: `currency: row.currency || row.Currency || "CAD",`,
    count: 2,
    reason: "Data section displays transaction/import data currency",
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
      // Pattern 5: formatCurrency call (formatCurrency(..., "USD") or formatCurrency(..., "CAD"))
      { regex: /formatCurrency\s*\([^)]*,\s*["'](USD|CAD)["']\s*\)/g, name: "format-call" },
      // Pattern 6: Default currency fallback (DEFAULT_CURRENCY = "CAD")
      { regex: /DEFAULT_CURRENCY\s*=\s*["'](CAD)["']/g, name: "constant" },
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
