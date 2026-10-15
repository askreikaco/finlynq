// ONE list row for the whole app: src/components/mobile/list-row.tsx.
// AccountRow / HoldingRow / TxRow / CategoryRow are thin data -> props wrappers; goals, loans, categories, hubs, menus,
// admin and report lists render <ListRow> directly. This guard fails when a second row layout comes back.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("one list row", () => {
  it("the old row layouts are gone", () => {
    expect(existsSync(join(process.cwd(), "src/components/mobile/progress-row.tsx"))).toBe(false);
    const hits = execSync(
      "grep -rlE 'ProgressRowButton|PROGRESS_ROW_|TX_ROW_PRESS|TX_ROW_TILE|<ProgressRow\\b' src --include=*.ts --include=*.tsx || true",
      { encoding: "utf8" },
    ).trim();
    expect(hits).toBe("");
  });

  it("ListRow owns the chart + mini bar + dot + tile markup", () => {
    const row = read("src/components/mobile/list-row.tsx");
    expect(row).toContain("<Sparkline");
    expect(row).toContain('role="progressbar"');
    expect(row).toContain("list-row-tile");
    expect(row).toContain("list-row-chevron");
    expect(row).toContain('shape === "rounded"');
  });

  it("no other component draws a progress bar, a sparkline slot or a status dot for a row", () => {
    for (const f of [
      "src/app/(app)/goals/page.tsx",
      "src/app/(app)/loans/page.tsx",
      "src/app/(app)/categories/_components/category-row.tsx",
      "src/components/mobile/tx-row.tsx",
      "src/components/mobile/account-row.tsx",
      "src/components/mobile/holding-row.tsx",
    ]) {
      const src = read(f);
      expect(src, f).not.toContain('role="progressbar"');
      expect(src, f).not.toContain("<Sparkline");
    }
  });

  it("domain wrappers render <ListRow> and carry no layout or styling of their own", () => {
    for (const f of ["tx-row.tsx", "account-row.tsx", "holding-row.tsx"]) {
      const src = read(`src/components/mobile/${f}`);
      expect(src, f).toContain("<ListRow");
      expect(src, f).not.toMatch(/className=/);
      expect(src, f).not.toMatch(/\b(?:flex|grid|rounded|px-\d|py-\d|gap-\d)\b/);
    }
    const cat = read("src/app/(app)/categories/_components/category-row.tsx");
    expect(cat).toContain("<ListRow");
    expect(cat).not.toMatch(/className=/);
  });

  it("goals and loans rows are ListRows with the categories row parts (dot, name, chart slot, % bar, value)", () => {
    for (const f of ["src/app/(app)/goals/page.tsx", "src/app/(app)/loans/page.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/import \{[^}]*\bListRow\b[^}]*\} from "@\/components\/mobile"/);
      expect(src, f).toContain("<ListRow");
      expect(src, f).toContain("dot={STATUS_DOT[");
      expect(src, f).toContain("progress={{");
      expect(src, f).toContain("trend=");
    }
    expect(read("src/app/(app)/categories/_components/category-row.tsx")).toContain("progress={{");
  });

  it("goals and loans rows take their dot colour from the one status mapping", () => {
    for (const f of ["src/app/(app)/goals/page.tsx", "src/app/(app)/loans/page.tsx"]) {
      expect(read(f)).toContain("STATUS_DOT");
    }
    expect(read("src/lib/status-colour.ts")).toContain("export const STATUS_DOT");
  });

  it("the hubs, menus and settings lists render ListRow, not their own row markup", () => {
    for (const f of [
      "src/components/settings-hub.tsx",
      "src/components/templates/hub-page.tsx",
      "src/components/more-menu.tsx",
      "src/components/account-switcher.tsx",
      "src/app/(app)/portfolio/new/page.tsx",
    ]) {
      expect(read(f), f).toContain("<ListRow");
    }
    for (const f of ["src/components/more-menu.tsx", "src/components/templates/hub-page.tsx", "src/components/account-switcher.tsx"]) {
      expect(read(f), f).not.toMatch(/<(InsetRow|AccountCard)\b/);
    }
  });

  // Folded in from the deleted one-tx-row guard (pane-detail-lists moved the loan schedule into loan-amortization.tsx).
  it("loan amortization / payment rows (inside loan detail) still use TxRow", () => {
    expect(read("src/app/(app)/loans/_components/loan-amortization.tsx")).toContain("<TxRow");
  });
});
