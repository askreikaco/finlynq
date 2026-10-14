// One row for the Categories, Goals and Loans lists: src/components/mobile/progress-row.tsx.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("one progress row", () => {
  it("categories row is a thin config of ProgressRow", () => {
    const src = read("src/app/(app)/categories/_components/category-row.tsx");
    expect(src).toMatch(/import \{ ProgressRow \} from "@\/components\/mobile\/progress-row"/);
    expect(src).toContain("<ProgressRow");
    expect(src).not.toContain("<Sparkline");
  });

  it.each(["src/app/(app)/goals/page.tsx", "src/app/(app)/loans/page.tsx"])("%s renders <ProgressRow> from the shared mobile components", (f) => {
    const src = read(f);
    expect(src).toMatch(/import \{[^}]*\bProgressRow\b[^}]*\} from "@\/components\/mobile"/);
    expect(src).toContain("<ProgressRow");
    expect(src).not.toMatch(/<ListRow\b/);
  });

  it("goals and loans rows take their dot colour from the one status mapping", () => {
    for (const f of ["src/app/(app)/goals/page.tsx", "src/app/(app)/loans/page.tsx"]) {
      expect(read(f)).toContain("STATUS_DOT");
    }
    expect(read("src/lib/status-colour.ts")).toContain("export const STATUS_DOT");
  });

  it("ProgressRow is the only place with the chart + mini bar + dot markup", () => {
    const row = read("src/components/mobile/progress-row.tsx");
    expect(row).toContain("<Sparkline");
    expect(row).toContain('role="progressbar"');
    for (const f of ["src/app/(app)/goals/page.tsx", "src/app/(app)/loans/page.tsx", "src/app/(app)/categories/_components/category-row.tsx"]) {
      expect(read(f)).not.toContain('role="progressbar"');
    }
  });
});
