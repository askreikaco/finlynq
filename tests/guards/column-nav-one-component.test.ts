/**
 * Guard: the cascading More | Settings | page columns exist once (src/components/mobile/column-nav.tsx ColumnShell).
 * Both routers (Next page/layout, SPA twins) render that one component; nothing else may draw column panes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

describe("one column shell", () => {
  it("only column-nav.tsx draws data-column-pane / data-column-shell", () => {
    const hits = walk(join(ROOT, "src"))
      .filter((f) => /data-column-(pane|shell)/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length + 1));
    expect(hits).toEqual(["src/components/mobile/column-nav.tsx"]);
  });

  it("Next and SPA entry points of the family all use ColumnShell", () => {
    for (const f of [
      "src/app/(app)/more/page.tsx",
      "src/app/(app)/settings/layout.tsx",
      "src/spa/pages/more.tsx",
      "src/spa/pages/settings/layout.tsx",
    ]) {
      expect(read(f), f).toMatch(/<ColumnShell[\s>]/);
    }
  });

  it("the More list and the Settings hub are single-column lists at wide", () => {
    expect(read("src/components/more-menu.tsx")).toMatch(/wide:grid-cols-1/);
    expect(read("src/components/more-menu.tsx")).not.toMatch(/wide:grid-cols-[23]/);
    expect(read("src/components/settings-hub.tsx")).not.toMatch(/wide:grid-cols-[23]/);
  });
});
